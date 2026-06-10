import { computeMastery } from "./markdown.js";
import type { Subject } from "./types.js";

export interface DoctorIssue {
  subjectId: string;
  level: "error" | "warn";
  message: string;
}

/** frontmatter(인덱스 진실)와 본문 앵커(layer 진실)의 불일치를 찾는다. */
export function checkSubject(s: Subject): DoctorIssue[] {
  const issues: DoctorIssue[] = [];
  const err = (message: string) =>
    issues.push({ subjectId: s.id, level: "error", message });
  const warn = (message: string) =>
    issues.push({ subjectId: s.id, level: "warn", message });

  const derived = computeMastery(s.layers);
  if (s.mastery.layerCount !== derived.layerCount) {
    err(
      `mastery.layer_count(${s.mastery.layerCount}) ≠ 실제 layer 수(${derived.layerCount})`,
    );
  }
  if ((s.mastery.maxDepth ?? null) !== (derived.maxDepth ?? null)) {
    warn(
      `mastery.max_depth(${s.mastery.maxDepth}) ≠ 파생값(${derived.maxDepth})`,
    );
  }
  if (s.layers.length > 0 && s.mastery.lastTouched !== derived.lastTouched) {
    warn(
      `mastery.last_touched(${s.mastery.lastTouched}) ≠ 마지막 layer 날짜(${derived.lastTouched})`,
    );
  }

  s.layers.forEach((l, i) => {
    if (l.index !== i + 1) {
      err(`layer index 불연속: ${i + 1}번째 layer의 index가 ${l.index}`);
    }
  });

  const qids = new Set(s.questions.map((q) => q.id));
  for (const l of s.layers) {
    for (const qid of [...l.addedQuestionIds, ...l.resolvedQuestionIds]) {
      if (!qids.has(qid)) {
        err(`layer ${l.index} 앵커가 존재하지 않는 질문 참조: ${qid}`);
      }
    }
  }

  for (const q of s.questions) {
    const raised = s.layers.find((l) => l.index === q.raisedAtLayer);
    if (!raised) {
      err(`질문 ${q.id}의 raised_at_layer(${q.raisedAtLayer})가 존재하지 않음`);
    } else if (!raised.addedQuestionIds.includes(q.id)) {
      warn(`질문 ${q.id}가 layer ${q.raisedAtLayer} 앵커의 adds에 없음`);
    }
    if (q.status === "resolved" && q.resolvedAtLayer == null) {
      err(`질문 ${q.id}가 resolved인데 resolved_at_layer가 없음`);
    }
    if (q.status === "open" && q.resolvedAtLayer != null) {
      err(`질문 ${q.id}가 open인데 resolved_at_layer(${q.resolvedAtLayer})가 있음`);
    }
  }

  return issues;
}

export function checkAll(
  subjects: Subject[],
): DoctorIssue[] {
  const ids = new Set(subjects.map((s) => s.id));
  const issues = subjects.flatMap(checkSubject);
  for (const s of subjects) {
    for (const e of s.edges) {
      if (!ids.has(e.to)) {
        issues.push({
          subjectId: s.id,
          level: "warn",
          message: `edge가 존재하지 않는 subject를 가리킴: ${e.to}`,
        });
      }
    }
  }
  return issues;
}
