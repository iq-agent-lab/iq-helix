import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { computeMastery, serializeSubject } from "./markdown.js";
import { slugify, slugifyChapter } from "./slug.js";
import type { FileHelixStore } from "./store.js";
import type { Layer, OpenQuestion, Subject } from "./types.js";

export interface ImportResult {
  subjects: number;
  layers: number;
  seededQuestions: number;
  resolvedEdges: number;
  unresolvedLinks: number;
  skippedFiles: string[];
}

interface OldNote {
  file: string;
  topic: string;
  date: string;
  depth: number;
  chapterId: string;
  roadmapName: string | null;
  roadmapId: string | null;
  tags: string[];
  related: string[];
  sections: { heading: string; body: string }[];
}

const QUESTION_SECTION_RE = /헷갈렸|확인이 필요/;

/**
 * 기존 spiral-buddy 노트(read-only)를 helix subjects로 접는다.
 * 그룹 키 = (roadmap_name, chapter basename) — roadmap_id 유무가 섞인 옛/새 스키마를
 * vault.ts:235 fallback과 같은 효과로 병합한다 (SPEC §7-2).
 */
export async function importSpiralBuddy(
  store: FileHelixStore,
  vaultOrNotesPath: string,
): Promise<ImportResult> {
  const notesDir = existsSync(join(vaultOrNotesPath, "spiral-buddy"))
    ? join(vaultOrNotesPath, "spiral-buddy")
    : vaultOrNotesPath;

  const result: ImportResult = {
    subjects: 0,
    layers: 0,
    seededQuestions: 0,
    resolvedEdges: 0,
    unresolvedLinks: 0,
    skippedFiles: [],
  };

  const files = (await readdir(notesDir)).filter((f) => f.endsWith(".md"));
  const notes: OldNote[] = [];
  for (const f of files) {
    const note = parseOldNote(f, await readFile(join(notesDir, f), "utf8"));
    if (note) notes.push(note);
    else result.skippedFiles.push(f);
  }

  const groups = new Map<string, OldNote[]>();
  for (const n of notes) {
    const key = `${n.roadmapName ?? ""}::${chapterBasename(n.chapterId)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(n);
  }

  const subjects: Subject[] = [];
  const usedIds = new Set<string>();
  const fileSlugToSubjectId = new Map<string, string>();

  for (const group of groups.values()) {
    group.sort(
      (a, b) => a.depth - b.depth || a.date.localeCompare(b.date),
    );
    const first = group[0];
    let id = slugifyChapter(first.chapterId);
    if (usedIds.has(id)) {
      id = `${slugify(first.roadmapName ?? "roadmap")}-${id}`;
    }
    usedIds.add(id);

    const questions: OpenQuestion[] = [];
    const layers: Layer[] = group.map((n, i) => {
      const index = i + 1;
      const added: string[] = [];
      for (const text of extractQuestions(n)) {
        const qid = `q${questions.length + 1}`;
        questions.push({ id: qid, text, status: "open", raisedAtLayer: index });
        added.push(qid);
      }
      return {
        index,
        depth: n.depth,
        date: n.date,
        sessionRef: n.file.replace(/\.md$/, ""),
        content: { sections: n.sections },
        addedQuestionIds: added,
        resolvedQuestionIds: [],
      };
    });

    const roadmapId = group.find((n) => n.roadmapId)?.roadmapId ?? null;
    const subject: Subject = {
      id,
      title: first.topic,
      status: "active",
      tags: [...new Set(group.flatMap((n) => n.tags))],
      sources: [
        { kind: "spiral-buddy", roadmapId, chapterId: first.chapterId },
      ],
      mastery: computeMastery(layers),
      layers,
      questions,
      edges: [],
    };

    for (const n of group) {
      fileSlugToSubjectId.set(n.file.replace(/\.md$/, ""), id);
    }
    subjects.push(subject);
    result.subjects += 1;
    result.layers += layers.length;
    result.seededQuestions += questions.length;
  }

  // 2차 패스: related 위키링크 → edges, 실패 시 unresolved_links 보존
  for (const subject of subjects) {
    const group = [...groups.values()].find((g) =>
      g.some((n) => fileSlugToSubjectId.get(n.file.replace(/\.md$/, "")) === subject.id),
    )!;
    const unresolved: string[] = [];
    for (const link of new Set(group.flatMap((n) => n.related))) {
      const target =
        fileSlugToSubjectId.get(link) ?? matchByConceptSlug(link, usedIds);
      if (target && target !== subject.id) {
        if (!subject.edges.some((e) => e.to === target)) {
          subject.edges.push({ to: target, type: "related" });
          result.resolvedEdges += 1;
        }
      } else if (!target) {
        unresolved.push(link);
        result.unresolvedLinks += 1;
      }
    }
    if (unresolved.length) subject.unresolvedLinks = unresolved;
  }

  await store.init();
  for (const subject of subjects) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      store.subjectPath(subject.id),
      serializeSubject(subject),
      "utf8",
    );
  }
  await store.reindex();
  return result;
}

function parseOldNote(file: string, md: string): OldNote | null {
  const fmMatch = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!fmMatch) return null;
  let fm: any;
  try {
    fm = YAML.parse(fmMatch[1]);
  } catch {
    return null;
  }
  if (!fm?.chapter_id || fm.generator !== "iq-spiral-buddy") return null;

  const body = md.slice(fmMatch[0].length);
  const sections = body
    .split(/^## /m)
    .slice(1)
    .map((part) => {
      const nl = part.indexOf("\n");
      return {
        heading: (nl === -1 ? part : part.slice(0, nl)).trim(),
        body: nl === -1 ? "" : part.slice(nl + 1).trim(),
      };
    });

  const related: string[] = [];
  for (const raw of fm.related ?? []) {
    const m = String(raw).match(/\[\[([^\]]+)\]\]/);
    related.push(m ? m[1] : String(raw));
  }

  return {
    file,
    topic: fm.topic ?? fm.title ?? file,
    date: String(fm.date).slice(0, 10),
    depth: Number(fm.depth ?? 1),
    chapterId: String(fm.chapter_id),
    roadmapName: fm.roadmap ?? null,
    roadmapId: fm.roadmap_id ?? null,
    tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
    related,
    sections,
  };
}

function extractQuestions(n: OldNote): string[] {
  const section = n.sections.find((s) => QUESTION_SECTION_RE.test(s.heading));
  if (!section) return [];
  return section.body
    .split("\n")
    .map((line) => line.match(/^\s*[-*]\s+(.+)$/)?.[1]?.trim())
    .filter((q): q is string => Boolean(q));
}

function chapterBasename(chapterId: string): string {
  return chapterId.split("/").at(-1)!;
}

/** "2026-05-20-applicationcontext-d1" → "applicationcontext" 추정 매칭 */
function matchByConceptSlug(
  link: string,
  ids: Set<string>,
): string | null {
  const stripped = link
    .replace(/^\d{4}-\d{2}-\d{2}-/, "")
    .replace(/-d\d+$/, "");
  const candidate = slugify(stripped.replace(/^\d+[-_.]?/, ""));
  return ids.has(candidate) ? candidate : null;
}
