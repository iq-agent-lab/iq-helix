export type SubjectId = string;

export type SubjectStatus = "active" | "archived";

export interface Subject {
  id: SubjectId;
  title: string;
  status: SubjectStatus;
  tags: string[];
  /** MVP 불변식: length <= 1 (SPEC D1) */
  sources: SourceRef[];
  mastery: Mastery;
  /** index 오름차순 */
  layers: Layer[];
  questions: OpenQuestion[];
  edges: Edge[];
  /** importer가 매칭 실패한 옛 위키링크 보존용 (데이터 손실 금지) */
  unresolvedLinks?: string[];
}

export type SourceRef =
  | { kind: "spiral-buddy"; roadmapId: string | null; chapterId: string }
  | { kind: "manual" };

export interface Layer {
  /** 1-base 나선 회차 (subject 내 순번) */
  index: number;
  /** 도메인 의미 깊이 — 입력원이 부여, 선택 */
  depth?: number;
  /** ISO date (YYYY-MM-DD) */
  date: string;
  /** 입력원 세션/트랜스크립트 역링크 */
  sessionRef?: string;
  content: LayerContent;
  addedQuestionIds: string[];
  resolvedQuestionIds: string[];
}

export interface LayerContent {
  /** 학습 도메인 = spiral-buddy 8섹션 컨벤션. helix 포맷 자체는 섹션 구성을 강제하지 않는다. */
  sections: { heading: string; body: string }[];
}

export type QuestionStatus = "open" | "resolved";

export interface OpenQuestion {
  /** subject 내 unique: "q1", "q2", ... */
  id: string;
  text: string;
  status: QuestionStatus;
  raisedAtLayer: number;
  resolvedAtLayer?: number;
  resolution?: string;
}

export type EdgeType = "prereq" | "related" | "contrasts" | "refines";

export interface Edge {
  to: SubjectId;
  type: EdgeType;
  note?: string;
}

export interface Mastery {
  layerCount: number;
  maxDepth?: number;
  confidence?: number;
  lastTouched: string;
}

export interface SubjectSummary {
  id: SubjectId;
  title: string;
  status: SubjectStatus;
  tags: string[];
  layerCount: number;
  maxDepth?: number;
  openQuestionCount: number;
  lastTouched: string;
}

export interface SubjectDraft {
  id?: SubjectId;
  title: string;
  tags?: string[];
  sources?: SourceRef[];
}

export interface LayerDraft {
  depth?: number;
  /** 생략 시 오늘 */
  date?: string;
  sessionRef?: string;
  content: LayerContent;
  /** 이 layer에서 새로 제기된 질문 텍스트 — store가 OpenQuestion으로 승격 */
  addQuestions?: string[];
  /** 이 layer에서 해소된 질문 */
  resolveQuestions?: { id: string; resolution?: string }[];
  confidence?: number;
}

export interface HelixStore {
  createSubject(draft: SubjectDraft): Promise<Subject>;
  appendLayer(id: SubjectId, draft: LayerDraft): Promise<Subject>;
  resolveQuestion(
    id: SubjectId,
    questionId: string,
    opts: { atLayer: number; resolution?: string },
  ): Promise<void>;

  getSubject(id: SubjectId): Promise<Subject | null>;
  listSubjects(filter?: {
    tag?: string;
    sourceKind?: SourceRef["kind"];
    status?: SubjectStatus;
  }): Promise<SubjectSummary[]>;
  openQuestions(filter?: {
    subjectId?: SubjectId;
  }): Promise<(OpenQuestion & { subjectId: SubjectId })[]>;
  related(id: SubjectId): Promise<Subject[]>;

  archive(id: SubjectId): Promise<void>;
  reindex(): Promise<void>;
}
