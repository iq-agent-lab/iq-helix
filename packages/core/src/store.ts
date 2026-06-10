import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  computeMastery,
  isoDate,
  parseSubject,
  serializeSubject,
} from "./markdown.js";
import { buildIndex } from "./indexer.js";
import { slugify } from "./slug.js";
import type {
  HelixStore,
  LayerDraft,
  OpenQuestion,
  Subject,
  SubjectDraft,
  SubjectId,
  SubjectSummary,
} from "./types.js";

export class FileHelixStore implements HelixStore {
  constructor(readonly root: string) {}

  get subjectsDir(): string {
    return join(this.root, "subjects");
  }

  get indexPath(): string {
    return join(this.root, "_helix.json");
  }

  subjectPath(id: SubjectId): string {
    return join(this.subjectsDir, `${id}.md`);
  }

  async init(): Promise<void> {
    await mkdir(this.subjectsDir, { recursive: true });
  }

  async createSubject(draft: SubjectDraft): Promise<Subject> {
    await this.init();
    const id = draft.id ?? slugify(draft.title);
    if (existsSync(this.subjectPath(id))) {
      throw new Error(`subject가 이미 존재합니다: ${id}`);
    }
    const sources = draft.sources ?? [];
    if (sources.length > 1) {
      throw new Error("MVP 불변식 위반: sources.length <= 1 (SPEC D1)");
    }
    const subject: Subject = {
      id,
      title: draft.title,
      status: "active",
      tags: draft.tags ?? [],
      sources,
      mastery: computeMastery([]),
      layers: [],
      questions: [],
      edges: [],
    };
    await this.write(subject);
    await this.reindex();
    return subject;
  }

  async appendLayer(id: SubjectId, draft: LayerDraft): Promise<Subject> {
    const subject = await this.mustGet(id);
    const index = (subject.layers.at(-1)?.index ?? 0) + 1;
    const date = draft.date ?? isoDate(new Date());

    const addedQuestionIds: string[] = [];
    let nextQ = nextQuestionNumber(subject.questions);
    for (const text of draft.addQuestions ?? []) {
      const qid = `q${nextQ++}`;
      subject.questions.push({
        id: qid,
        text,
        status: "open",
        raisedAtLayer: index,
      });
      addedQuestionIds.push(qid);
    }

    const resolvedQuestionIds: string[] = [];
    for (const r of draft.resolveQuestions ?? []) {
      const q = subject.questions.find((q) => q.id === r.id);
      if (!q) throw new Error(`존재하지 않는 질문: ${id}/${r.id}`);
      q.status = "resolved";
      q.resolvedAtLayer = index;
      if (r.resolution) q.resolution = r.resolution;
      resolvedQuestionIds.push(r.id);
    }

    subject.layers.push({
      index,
      ...(draft.depth != null ? { depth: draft.depth } : {}),
      date,
      ...(draft.sessionRef ? { sessionRef: draft.sessionRef } : {}),
      content: draft.content,
      addedQuestionIds,
      resolvedQuestionIds,
    });
    subject.mastery = computeMastery(
      subject.layers,
      draft.confidence ?? subject.mastery.confidence,
    );

    await this.write(subject);
    await this.reindex();
    return subject;
  }

  async resolveQuestion(
    id: SubjectId,
    questionId: string,
    opts: { atLayer: number; resolution?: string },
  ): Promise<void> {
    const subject = await this.mustGet(id);
    const q = subject.questions.find((q) => q.id === questionId);
    if (!q) throw new Error(`존재하지 않는 질문: ${id}/${questionId}`);
    q.status = "resolved";
    q.resolvedAtLayer = opts.atLayer;
    if (opts.resolution) q.resolution = opts.resolution;
    const layer = subject.layers.find((l) => l.index === opts.atLayer);
    if (layer && !layer.resolvedQuestionIds.includes(questionId)) {
      layer.resolvedQuestionIds.push(questionId);
    }
    await this.write(subject);
    await this.reindex();
  }

  async getSubject(id: SubjectId): Promise<Subject | null> {
    const path = this.subjectPath(id);
    if (!existsSync(path)) return null;
    return parseSubject(await readFile(path, "utf8"));
  }

  async listSubjects(filter?: {
    tag?: string;
    sourceKind?: "spiral-buddy" | "manual";
    status?: "active" | "archived";
  }): Promise<SubjectSummary[]> {
    const subjects = await this.readAll();
    return subjects
      .filter((s) => (filter?.tag ? s.tags.includes(filter.tag) : true))
      .filter((s) =>
        filter?.sourceKind
          ? s.sources.some((src) => src.kind === filter.sourceKind)
          : true,
      )
      .filter((s) => (filter?.status ? s.status === filter.status : true))
      .map((s) => ({
        id: s.id,
        title: s.title,
        status: s.status,
        tags: s.tags,
        layerCount: s.mastery.layerCount,
        ...(s.mastery.maxDepth != null ? { maxDepth: s.mastery.maxDepth } : {}),
        openQuestionCount: s.questions.filter((q) => q.status === "open")
          .length,
        lastTouched: s.mastery.lastTouched,
      }))
      .sort((a, b) => b.lastTouched.localeCompare(a.lastTouched));
  }

  async openQuestions(filter?: {
    subjectId?: SubjectId;
  }): Promise<(OpenQuestion & { subjectId: SubjectId })[]> {
    const subjects = filter?.subjectId
      ? [await this.mustGet(filter.subjectId)]
      : await this.readAll();
    return subjects.flatMap((s) =>
      s.questions
        .filter((q) => q.status === "open")
        .map((q) => ({ ...q, subjectId: s.id })),
    );
  }

  async related(id: SubjectId): Promise<Subject[]> {
    const subject = await this.mustGet(id);
    const out: Subject[] = [];
    for (const edge of subject.edges) {
      const target = await this.getSubject(edge.to);
      if (target) out.push(target);
    }
    return out;
  }

  async archive(id: SubjectId): Promise<void> {
    const subject = await this.mustGet(id);
    subject.status = "archived";
    await this.write(subject);
    await this.reindex();
  }

  async reindex(): Promise<void> {
    const subjects = await this.readAll();
    await writeFile(
      this.indexPath,
      JSON.stringify(buildIndex(subjects), null, 2) + "\n",
      "utf8",
    );
  }

  async readAll(): Promise<Subject[]> {
    await this.init();
    const files = (await readdir(this.subjectsDir)).filter((f) =>
      f.endsWith(".md"),
    );
    const out: Subject[] = [];
    for (const f of files) {
      out.push(parseSubject(await readFile(join(this.subjectsDir, f), "utf8")));
    }
    return out;
  }

  async write(subject: Subject): Promise<void> {
    await this.init();
    await writeFile(
      this.subjectPath(subject.id),
      serializeSubject(subject),
      "utf8",
    );
  }

  private async mustGet(id: SubjectId): Promise<Subject> {
    const s = await this.getSubject(id);
    if (!s) throw new Error(`존재하지 않는 subject: ${id}`);
    return s;
  }
}

function nextQuestionNumber(questions: OpenQuestion[]): number {
  let max = 0;
  for (const q of questions) {
    const m = q.id.match(/^q(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}
