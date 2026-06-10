# iq-helix

**나선형 사고를 위한 노트 시스템.** Obsidian의 코어가 "관계"라면, helix의 코어는 **"진화"** — 하나의 Subject가 시간/깊이 축에서 Layer를 누적하고, Open Question이 lifecycle을 가진다.

- **Subject** — 나선의 축
- **Layer** — 가닥 1: 누적되는 사고의 흔적
- **Open Question** — 가닥 2: 미해결 의문의 lifecycle

설계 전체는 [docs/SPEC.md](docs/SPEC.md) 참조.

## 패키지

- `@iq-helix/core` — 포맷 파서/직렬화, `FileHelixStore`, `_helix.json` 인덱서, spiral-buddy importer, doctor, CLI
- `@iq-helix/viewer` — 자체 뷰어. 나선 타임라인(layer + 질문 가닥), 열린 질문 대시보드

## 사용

```bash
pnpm install
pnpm build
pnpm test

# 기존 spiral-buddy 노트 import (원본 read-only)
node packages/core/dist/cli.js import spiral-buddy "<obsidian-vault-경로>" --root ~/helix
node packages/core/dist/cli.js doctor --root ~/helix

# 뷰어 실행 → http://localhost:4180
node packages/viewer/dist/cli.js --root ~/helix
```

## 상태

- [x] Phase 0 — 스펙 동결 + 스캐폴딩
- [x] Phase 1 — `@iq-helix/core` (파서/스토어/인덱서/importer/doctor/CLI)
- [x] Phase 2 — 뷰어 (`helix-viewer`: 나선 타임라인 + 질문 대시보드)
- [ ] Phase 3 — spiral-buddy 전환
