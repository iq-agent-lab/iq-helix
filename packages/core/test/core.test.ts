import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FileHelixStore,
  checkSubject,
  parseSubject,
  serializeSubject,
  type Subject,
} from "../src/index.js";

const SAMPLE: Subject = {
  id: "beanfactory",
  title: "BeanFactory",
  status: "active",
  tags: ["spring", "ioc"],
  sources: [
    {
      kind: "spiral-buddy",
      roadmapId: "spring ecosystem/spring-core-deep-dive/ioc-container",
      chapterId: "01-beanfactory.md",
    },
  ],
  mastery: { layerCount: 2, maxDepth: 2, confidence: 0.7, lastTouched: "2026-05-25" },
  layers: [
    {
      index: 1,
      depth: 1,
      date: "2026-05-18",
      sessionRef: "2026-05-18-beanfactory-d1",
      content: {
        sections: [
          { heading: "한 줄 요약", body: "BeanFactory는 최소 IoC 컨테이너다." },
          { heading: "핵심 개념", body: "lazy 생성, bean definition 등록." },
        ],
      },
      addedQuestionIds: ["q1"],
      resolvedQuestionIds: [],
    },
    {
      index: 2,
      depth: 2,
      date: "2026-05-25",
      content: {
        sections: [{ heading: "한 줄 요약", body: "3단계 캐시 구조 확인." }],
      },
      addedQuestionIds: [],
      resolvedQuestionIds: ["q1"],
    },
  ],
  questions: [
    {
      id: "q1",
      text: "순환참조는 어떻게 끊기나?",
      status: "resolved",
      raisedAtLayer: 1,
      resolvedAtLayer: 2,
      resolution: "3단계 캐시 + earlyReference",
    },
  ],
  edges: [{ to: "applicationcontext", type: "refines" }],
};

describe("markdown round-trip", () => {
  it("parse(serialize(s))는 의미 무손실이다", () => {
    const md = serializeSubject(SAMPLE);
    const parsed = parseSubject(md);
    expect(parsed).toEqual(SAMPLE);
  });

  it("두 번 직렬화해도 동일하다 (안정성)", () => {
    const once = serializeSubject(SAMPLE);
    const twice = serializeSubject(parseSubject(once));
    expect(twice).toBe(once);
  });

  it("샘플은 doctor를 통과한다", () => {
    expect(checkSubject(SAMPLE)).toEqual([]);
  });
});

describe("FileHelixStore", () => {
  async function freshStore() {
    return new FileHelixStore(await mkdtemp(join(tmpdir(), "helix-")));
  }

  it("createSubject → appendLayer → 질문 lifecycle", async () => {
    const store = await freshStore();
    await store.createSubject({ title: "MVCC", tags: ["db"] });

    await store.appendLayer("mvcc", {
      depth: 1,
      date: "2026-06-01",
      content: { sections: [{ heading: "한 줄 요약", body: "버전 기반 동시성." }] },
      addQuestions: ["undo log는 언제 정리되나?", "snapshot은 어디 저장되나?"],
    });

    let open = await store.openQuestions({ subjectId: "mvcc" });
    expect(open.map((q) => q.id)).toEqual(["q1", "q2"]);

    await store.appendLayer("mvcc", {
      depth: 2,
      date: "2026-06-08",
      content: { sections: [{ heading: "한 줄 요약", body: "purge 스레드 확인." }] },
      resolveQuestions: [{ id: "q1", resolution: "purge가 read view 기준으로 정리" }],
    });

    const subject = (await store.getSubject("mvcc"))!;
    expect(subject.layers).toHaveLength(2);
    expect(subject.layers[1].index).toBe(2);
    expect(subject.questions.find((q) => q.id === "q1")?.status).toBe("resolved");
    expect(subject.mastery).toMatchObject({
      layerCount: 2,
      maxDepth: 2,
      lastTouched: "2026-06-08",
    });

    open = await store.openQuestions();
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ subjectId: "mvcc", id: "q2" });

    expect(checkSubject(subject)).toEqual([]);
  });

  it("sources.length > 1은 MVP 불변식 위반으로 거부한다 (D1)", async () => {
    const store = await freshStore();
    await expect(
      store.createSubject({
        title: "x",
        sources: [{ kind: "manual" }, { kind: "manual" }],
      }),
    ).rejects.toThrow(/D1/);
  });

  it("reindex가 _helix.json을 생성한다", async () => {
    const store = await freshStore();
    await store.createSubject({ title: "Tx" });
    const { readFile } = await import("node:fs/promises");
    const index = JSON.parse(await readFile(store.indexPath, "utf8"));
    expect(index.subjects.tx).toMatchObject({ title: "Tx", layerCount: 0 });
  });
});
