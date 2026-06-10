# iq-helix — MVP 스펙 v0.1

> 작성일: 2026-06-10. 기획 세션 산출물. 신규 레포의 첫 커밋(`docs/SPEC.md`)이 되는 것을 의도.
> 입력: spiral-notes 기획 핸드오프(2026-06-01) + 기획 세션 결정사항.

---

## 0. 정체성

**iq-helix = 나선형 사고를 위한 노트 시스템.** 학습이 첫 적용 도메인이지만 코어는 "나선형 사고"라는 범주 자체.

Obsidian과 다른 범주다:
- Obsidian — 노트 = 평면 markdown + 그래프. 코어는 **관계(relationship)**.
- helix — 노트 = 시간/깊이 축에서 진화하는 대상. 코어는 **진화(evolution)**.

이름 = 데이터 모델 (isomorphic):
- **Subject** — 나선의 축. 학습에선 개념, 글쓰기에선 문서, 사고추적에선 문제.
- **Layer** — 가닥 1. 시간/깊이로 누적되는 사고의 흔적.
- **Open Question** — 가닥 2. 미해결 의문의 lifecycle.
- 두 가닥이 꼬이며 나선을 굴린다: question이 다음 layer를 끌어내고, layer가 question을 낳거나 해소한다.

---

## 1. Decision Log (잠근 결정)

### D1. Subject 정체성 = 결정적 slug + `sources` 배열 (MVP에선 길이 ≤ 1 강제)
- `id`는 안정적 slug, chapter_id에서 분리. importer는 `slugify(chapter basename)`으로 생성, 충돌 시 roadmap 접두.
- `sources: SourceRef[]`는 모델상 배열이지만 MVP에선 항상 1개. cross-roadmap 합치기는 post-MVP의 `mergeSubjects(a, b)` 연산으로 추가 — 포맷·importer 변경 없이 문이 열려 있음.
- 기각: 순수 1:1(확장 문 닫힘), 1급 cross-roadmap(모델·UI 무거움, MVP 검증에 불필요).

### D2. 질문 텍스트의 소유권은 OpenQuestion, Layer는 id만 참조
- `Layer.addedQuestionIds` / `resolvedQuestionIds`. 핸드오프 모델의 `addedQuestions: string[]`(텍스트)는 OpenQuestion과 이중 표현이 되어 resolved 동기화가 깨질 수 있어 기각.

### D3. Source of truth = markdown, `_helix.json`은 파생 인덱스
- subject 1개 = `.md` 파일 1개. frontmatter = 기계가독 인덱스(questions/edges/mastery), 본문 = 사람이 읽는 layer 누적.
- `_helix.json`은 빠른 쿼리용 캐시. `helix reindex`로 언제든 rebuild. **git에 커밋하지 않음**(.gitignore).

### D4. MVP에 최소 뷰어 포함 — 핸드오프 원안의 Phase 순서 변경
- 원안: 라이브러리 → spiral-buddy 전환 → 뷰어. **변경: 라이브러리+importer → 뷰어 → spiral-buddy 전환.**
- 이유: MVP의 가치 검증 = "기존 노트가 나선으로 *보이는* 순간". importer가 데이터를 공급하므로 뷰어는 통합 전에도 의미 있다.

### D5. 뷰어 MVP 스코프 = 나선 타임라인 + 질문 대시보드. 그래프는 post-MVP
- 그래프는 Obsidian이 이미 잘하고 우리 차별점이 아님. 차별점인 "진화" 시각화에 집중.
- 뷰어는 MVP 동안 read-only. 작성 경로 = spiral-buddy(자동) + 파일 직접 편집(수동).

### D6. 인덱스 백엔드 = JSON
- git diff 가능, rebuild 가능. subject 수백 개 넘으면 sqlite 재검토.

### D7. 뷰어 스택 = vanilla TS + ESM 정적 SPA
- spiral-buddy `client/`와 동결. 라이브러리가 얇은 Hono 서버(`helix serve`)로 노출.

---

## 2. 데이터 모델 (코어 타입)

```ts
type SubjectId = string;            // 안정적 slug. 예: "beanfactory"

interface Subject {
  id: SubjectId;
  title: string;
  status: "active" | "archived";
  tags: string[];
  sources: SourceRef[];             // MVP 불변식: length <= 1
  mastery: Mastery;
  layers: Layer[];                  // index 오름차순
  questions: OpenQuestion[];
  edges: Edge[];
}

type SourceRef =
  | { kind: "spiral-buddy"; roadmapId: string | null; chapterId: string }
  | { kind: "manual" };

interface Layer {
  index: number;                    // 1-base 나선 회차 (subject 내 순번)
  depth?: number;                   // 도메인 의미 깊이 — 입력원(학습 도구)이 부여, 선택
  date: string;                     // ISO date
  sessionRef?: string;              // 입력원 세션/트랜스크립트 역링크
  content: LayerContent;
  addedQuestionIds: string[];
  resolvedQuestionIds: string[];
}

interface LayerContent {
  sections: { heading: string; body: string }[];
  // 학습 도메인 = spiral-buddy의 8섹션 컨벤션. helix 포맷 자체는 섹션 구성을 강제하지 않는다 (범용성 지점).
}

interface OpenQuestion {
  id: string;                       // subject 내 unique: "q1", "q2", ...
  text: string;
  status: "open" | "resolved";
  raisedAtLayer: number;
  resolvedAtLayer?: number;
  resolution?: string;              // 해소 한 줄 요약 (선택)
}

interface Edge {
  to: SubjectId;
  type: "prereq" | "related" | "contrasts" | "refines";
  note?: string;
}

interface Mastery {
  layerCount: number;               // 파생값
  maxDepth?: number;                // 파생값
  confidence?: number;              // 0..1 — 입력원이 부여 (선택)
  lastTouched: string;              // 파생값
}
```

설계 노트:
- `index`(회차)와 `depth`(의미 깊이)를 분리. 핸드오프 모델은 둘을 `depth` 하나로 합쳐 "같은 depth를 두 번 돈 세션"을 표현하지 못했다.
- `Mastery`는 대부분 파생값 — frontmatter에 캐시하되 layers에서 항상 재계산 가능해야 한다 (`helix doctor`가 검증).

---

## 3. 저장소 레이아웃 + 파일 포맷

```
~/helix/                       # 기본 루트, helix.config.json으로 변경 가능
  subjects/
    beanfactory.md
    applicationcontext.md
  _helix.json                  # 파생 인덱스 (gitignore)
  helix.config.json
```

### `subjects/beanfactory.md` — 완전한 실제 예시

```markdown
---
helix: 1
id: beanfactory
title: "BeanFactory"
status: active
tags: [spring, ioc, bean-lifecycle]
sources:
  - kind: spiral-buddy
    roadmap_id: "spring ecosystem/spring-core-deep-dive/ioc-container"
    chapter_id: "01-beanfactory.md"
mastery:
  layer_count: 3
  max_depth: 3
  confidence: 0.7
  last_touched: 2026-06-01
questions:
  - id: q1
    text: "getBean() 시점에 순환참조는 어떻게 끊기나?"
    status: resolved
    raised_at_layer: 1
    resolved_at_layer: 3
    resolution: "3단계 캐시 + earlyReference로 proxy를 미리 노출"
  - id: q2
    text: "BeanFactory vs ApplicationContext의 pre-instantiation 차이가 실제 기동시간에 주는 영향은?"
    status: open
    raised_at_layer: 2
edges:
  - to: applicationcontext
    type: refines
  - to: circular-dependency
    type: related
---

# BeanFactory

## Layer 1 — 2026-05-18 (depth 1)
<!-- helix:layer index=1 depth=1 date=2026-05-18 session=2026-05-18-beanfactory-d1 adds=q1 -->

### 한 줄 요약
BeanFactory는 bean 정의의 등록과 lazy 생성을 담당하는 최소 IoC 컨테이너다.

### 핵심 개념
(…8섹션 본문…)

## Layer 2 — 2026-05-25 (depth 2)
<!-- helix:layer index=2 depth=2 date=2026-05-25 session=2026-05-25-beanfactory-d2 adds=q2 -->

### 한 줄 요약
순환참조 해결의 실체는 3단계 싱글톤 캐시 구조였다.
(…)

## Layer 3 — 2026-06-01 (depth 3)
<!-- helix:layer index=3 depth=3 date=2026-06-01 session=2026-06-01-beanfactory-d3 resolves=q1 -->

### 한 줄 요약
earlyReference와 AOP proxy 개입 시점까지 추적, q1 해소.
(…)
```

### 파싱 규칙
- Layer 경계 = `## Layer {index}` 헤딩 직후의 `<!-- helix:layer ... -->` 앵커 코멘트. **코멘트가 기계 파싱의 진실**, 헤딩은 사람용 표현.
- frontmatter(questions/edges/mastery)가 인덱스 진실. 본문 앵커(`adds=`/`resolves=`)와 불일치하면 `helix doctor`가 경고.
- round-trip 불변식: parse → serialize 시 의미 무손실.

---

## 4. `_helix.json` 예시

```json
{
  "version": 1,
  "builtAt": "2026-06-10T09:00:00+09:00",
  "subjects": {
    "beanfactory": {
      "title": "BeanFactory",
      "file": "subjects/beanfactory.md",
      "tags": ["spring", "ioc", "bean-lifecycle"],
      "layerCount": 3,
      "maxDepth": 3,
      "lastTouched": "2026-06-01",
      "openQuestionCount": 1,
      "edges": [{ "to": "applicationcontext", "type": "refines" }]
    }
  },
  "openQuestions": [
    {
      "subjectId": "beanfactory",
      "questionId": "q2",
      "text": "BeanFactory vs ApplicationContext의 pre-instantiation 차이가 실제 기동시간에 주는 영향은?",
      "raisedAtLayer": 2,
      "raisedAtDate": "2026-05-25"
    }
  ]
}
```

---

## 5. HelixStore 인터페이스 (라이브러리 공개면)

```ts
interface HelixStore {
  // 쓰기
  createSubject(draft: SubjectDraft): Promise<Subject>;
  appendLayer(id: SubjectId, draft: LayerDraft): Promise<Subject>;
  resolveQuestion(id: SubjectId, questionId: string,
    opts: { atLayer: number; resolution?: string }): Promise<void>;

  // 읽기
  getSubject(id: SubjectId): Promise<Subject | null>;
  listSubjects(filter?: { tag?: string; source?: Partial<SourceRef>;
    status?: "active" | "archived" }): Promise<SubjectSummary[]>;
  openQuestions(filter?: { subjectId?: SubjectId })
    : Promise<(OpenQuestion & { subjectId: SubjectId })[]>;
  related(id: SubjectId): Promise<Subject[]>;

  // 수명주기 + 유지보수
  archive(id: SubjectId): Promise<void>;
  reindex(): Promise<void>;
}
```

핸드오프 `SpiralStore` 대비 변경과 이유:
- `trash/restore` → `archive` — markdown이 진실이고 git이 복구를 담당하므로 trash 폴더 메커니즘 불필요.
- `viewerUrl()` 제거 — 뷰어는 라이브러리 위의 레이어. URL 생성은 store의 책임이 아님.
- `mastery()` 제거 — `Subject.mastery`에 포함.
- spiral-buddy 어휘(roadmapId/chapterId)는 시그니처에서 제거, `SourceRef` 필터로 일반화 — "나선형 사고" 범용성의 인터페이스 반영.

---

## 6. 뷰어 MVP (`helix serve`)

화면 3개:
1. **Subject 목록** — 카드: title, layer 수, open question 수, lastTouched. 정렬: 최근 / 질문 많은 순.
2. **Subject 상세 = 나선 타임라인 (킬러 뷰)** — layer 카드가 위→아래로 쌓이고, 질문이 raised layer에서 resolved layer까지 세로 실(thread)로 이어진다. 열린 질문은 화면 아래로 계속 이어지는 실 — "다음에 뭘 팔지"의 시각적 신호. 이중나선을 평면에 편 형태. (기획 세션의 목업 참조.)
3. **질문 대시보드** — 전 subject의 open questions. 클릭 → 해당 subject 타임라인의 raised layer로 점프. 다음 학습 세션의 진입점.

비스코프(post-MVP): 그래프 뷰, 검색, 뷰어 내 편집.

---

## 7. Importer (`helix import spiral-buddy <vault-path>`)

1. `<vault>/spiral-buddy/*.md` 읽기 (read-only — 원본 불변).
2. `(roadmap_id, chapter_id)` 그룹핑. roadmap_id 없는 옛 노트는 spiral-buddy `src/vault.ts:235`의 fallback 규칙(roadmap_name + chapter_id suffix 매칭)을 재현.
3. 그룹 내 date/depth 정렬 → Layer 1..n으로 접기. depth 동률이면 date 우선.
4. 각 노트의 "헷갈렸던 / 확인이 필요한 지점" 불릿 → OpenQuestion 시드. 전부 `status: open`, `raisedAtLayer` = 해당 layer. (옛 노트엔 해소 기록이 없으므로 resolved 추론은 하지 않는다 — 이후 세션이나 수동으로 정리.)
5. `related:` 위키링크 → `edges(type: related)` 변환 시도. 매칭 실패 시 frontmatter `unresolved_links`에 보존(데이터 손실 금지).
6. 결과 요약 출력: subject 수, layer 수, 시드된 질문 수, unresolved link 수.

---

## 8. MVP 단계 + 완성 기준 (DoD)

| Phase | 산출물 | DoD |
|---|---|---|
| 0 | 스펙 동결 + 레포 생성 | 이 문서가 `docs/SPEC.md`로 첫 커밋 |
| 1 | `@iq-helix/core` — parser/serializer, HelixStore 파일시스템 구현, reindex, importer | 실제 vault import 성공 + `helix doctor` 통과 + round-trip 무손실 테스트 |
| 2 | 뷰어 — `helix serve` + 화면 3개 | **import된 BeanFactory가 layer 타임라인 + 질문 실로 보인다** |
| 3 | spiral-buddy 전환 — vault.ts → HelixStore 어댑터, note-writer가 appendLayer 호출, spiral.ts가 openQuestions/mastery 직접 조회 | 새 세션 1회 = 새 layer 1개로 쌓이고 뷰어에 즉시 반영 |

**MVP 전체 DoD: "BeanFactory를 한 번 더 파면, 파일이 하나 늘어나는 게 아니라 나선이 한 바퀴 자란다 — 그리고 그게 보인다."**

레포 구조 (Phase 0):

```
iq-helix/
  docs/SPEC.md            # 이 문서
  packages/core/          # @iq-helix/core
  packages/viewer/        # Phase 2
  package.json            # pnpm workspace
```

---

## 9. Post-MVP 보류 목록

- 그래프 뷰 (typed edges 시각화) / 검색 / 뷰어 내 편집·직접 작성 UI
- `mergeSubjects(a, b)` — cross-roadmap 1급 개념 (D1이 문 열어둠)
- Obsidian 미러 export (마이그레이션 안전망 + 공유용)
- MCP 서버 (`@iq-helix/mcp`) — Claude가 나선 노트를 직접 읽기
- sqlite 인덱스 (subject 수백 개 이후)
