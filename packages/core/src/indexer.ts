import type { Subject } from "./types.js";

export interface HelixIndex {
  version: number;
  builtAt: string;
  subjects: Record<
    string,
    {
      title: string;
      file: string;
      status: string;
      tags: string[];
      layerCount: number;
      maxDepth?: number;
      lastTouched: string;
      openQuestionCount: number;
      edges: { to: string; type: string }[];
    }
  >;
  openQuestions: {
    subjectId: string;
    questionId: string;
    text: string;
    raisedAtLayer: number;
    raisedAtDate?: string;
  }[];
}

export function buildIndex(subjects: Subject[]): HelixIndex {
  const index: HelixIndex = {
    version: 1,
    builtAt: new Date().toISOString(),
    subjects: {},
    openQuestions: [],
  };
  for (const s of subjects) {
    index.subjects[s.id] = {
      title: s.title,
      file: `subjects/${s.id}.md`,
      status: s.status,
      tags: s.tags,
      layerCount: s.mastery.layerCount,
      ...(s.mastery.maxDepth != null ? { maxDepth: s.mastery.maxDepth } : {}),
      lastTouched: s.mastery.lastTouched,
      openQuestionCount: s.questions.filter((q) => q.status === "open").length,
      edges: s.edges.map((e) => ({ to: e.to, type: e.type })),
    };
    for (const q of s.questions) {
      if (q.status !== "open") continue;
      const raisedLayer = s.layers.find((l) => l.index === q.raisedAtLayer);
      index.openQuestions.push({
        subjectId: s.id,
        questionId: q.id,
        text: q.text,
        raisedAtLayer: q.raisedAtLayer,
        ...(raisedLayer ? { raisedAtDate: raisedLayer.date } : {}),
      });
    }
  }
  return index;
}
