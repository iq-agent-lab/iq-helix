import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileHelixStore, checkAll, importSpiralBuddy } from "../src/index.js";

function oldNote(opts: {
  topic: string;
  date: string;
  depth: number;
  chapterId: string;
  roadmap: string;
  roadmapId?: string;
  questions?: string[];
  related?: string[];
}): string {
  const fm = [
    "---",
    `title: "${opts.topic} 학습"`,
    `topic: "${opts.topic}"`,
    `date: ${opts.date}`,
    `depth: ${opts.depth}`,
    `chapter_id: "${opts.chapterId}"`,
    `roadmap: "${opts.roadmap}"`,
    ...(opts.roadmapId ? [`roadmap_id: "${opts.roadmapId}"`] : []),
    `tags: ["spring"]`,
    `summary: "..."`,
    ...(opts.related?.length
      ? ["related:", ...opts.related.map((r) => `  - "[[${r}]]"`)]
      : []),
    "generator: iq-spiral-buddy",
    "---",
  ].join("\n");
  const questions = (opts.questions ?? [])
    .map((q) => `- ${q}`)
    .join("\n");
  return `${fm}\n# ${opts.topic}\n\n## 한 줄 요약\n${opts.topic} 요약.\n\n## 헷갈렸던 / 확인이 필요한 지점\n${questions}\n\n## 다음에 볼 것\n- ...\n`;
}

describe("importSpiralBuddy", () => {
  it("옛/새 스키마 혼재 노트를 subject별 layer로 접는다", async () => {
    const vault = await mkdtemp(join(tmpdir(), "vault-"));
    const notes = join(vault, "spiral-buddy");
    await mkdir(notes, { recursive: true });

    // beanfactory: d1은 옛 스키마(roadmap_id 없음), d2/d3는 새 스키마 → 병합되어야 함
    await writeFile(
      join(notes, "2026-05-18-beanfactory-d1.md"),
      oldNote({
        topic: "BeanFactory",
        date: "2026-05-18",
        depth: 1,
        chapterId: "01-beanfactory.md",
        roadmap: "ioc-container",
        questions: ["순환참조는 어떻게 끊기나?"],
      }),
    );
    await writeFile(
      join(notes, "2026-05-25-beanfactory-d2.md"),
      oldNote({
        topic: "BeanFactory",
        date: "2026-05-25",
        depth: 2,
        chapterId: "01-beanfactory.md",
        roadmap: "ioc-container",
        roadmapId: "spring/ioc-container",
        questions: ["pre-instantiation 차이의 기동시간 영향은?"],
        related: ["2026-05-20-applicationcontext-d1"],
      }),
    );
    await writeFile(
      join(notes, "2026-05-20-applicationcontext-d1.md"),
      oldNote({
        topic: "ApplicationContext",
        date: "2026-05-20",
        depth: 1,
        chapterId: "02-applicationcontext.md",
        roadmap: "ioc-container",
        roadmapId: "spring/ioc-container",
        related: ["없는-노트-링크"],
      }),
    );

    const store = new FileHelixStore(await mkdtemp(join(tmpdir(), "helix-")));
    const result = await importSpiralBuddy(store, vault);

    expect(result.subjects).toBe(2);
    expect(result.layers).toBe(3);
    expect(result.seededQuestions).toBe(2);
    expect(result.resolvedEdges).toBe(1);
    expect(result.unresolvedLinks).toBe(1);

    const bf = (await store.getSubject("beanfactory"))!;
    expect(bf.layers.map((l) => l.index)).toEqual([1, 2]);
    expect(bf.layers[0].depth).toBe(1);
    expect(bf.sources).toEqual([
      {
        kind: "spiral-buddy",
        roadmapId: "spring/ioc-container", // 그룹 내 첫 non-null
        chapterId: "01-beanfactory.md",
      },
    ]);
    expect(bf.questions.map((q) => q.raisedAtLayer)).toEqual([1, 2]);
    expect(bf.questions.every((q) => q.status === "open")).toBe(true);
    expect(bf.edges).toEqual([{ to: "applicationcontext", type: "related" }]);

    const ac = (await store.getSubject("applicationcontext"))!;
    expect(ac.unresolvedLinks).toEqual(["없는-노트-링크"]);

    // import 결과는 doctor를 통과해야 한다
    expect(
      checkAll(await store.readAll()).filter((i) => i.level === "error"),
    ).toEqual([]);
  });
});
