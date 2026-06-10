import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileHelixStore, importSpiralBuddy } from "../src/index.js";

describe("importSpiralBuddy — 변형 스키마 (네이밍 개선 이후 노트)", () => {
  it("generator/chapter_id 없는 토픽 파일명 노트도 구제하고, 진짜 비노트만 사유와 함께 스킵한다", async () => {
    const vault = await mkdtemp(join(tmpdir(), "vault-"));
    const notes = join(vault, "spiral-buddy");
    await mkdir(notes, { recursive: true });

    // 변형 1: chapter_id·generator 없음, 토픽 기반 파일명, depth는 frontmatter에
    await writeFile(
      join(notes, "InnoDB Buffer Pool — 메모리와 디스크 사이 캐시 레이어 d1.md"),
      `---
title: "InnoDB Buffer Pool — 메모리와 디스크 사이 캐시 레이어"
topic: "InnoDB Buffer Pool"
date: 2026-06-03
depth: 1
tags: ["mysql", "innodb"]
---
# InnoDB Buffer Pool

## 한 줄 요약
디스크 페이지의 메모리 캐시.

## 헷갈렸던 / 확인이 필요한 지점
- LRU의 midpoint insertion은 왜 필요한가?
`,
    );

    // 변형 2: depth가 파일명에만 있음 (frontmatter에 없음)
    await writeFile(
      join(notes, "Row Format — 데이터가 Page 안에 저장되는 구조 d1.md"),
      `---
topic: "Row Format"
date: 2026-06-05
tags: ["mysql"]
---
# Row Format

## 한 줄 요약
레코드의 물리 배치.
`,
    );

    // 진짜 스킵 대상들
    await writeFile(join(notes, "_index.md"), "# index\n");
    await writeFile(join(notes, "메모.md"), "frontmatter 없는 그냥 메모\n");

    const store = new FileHelixStore(await mkdtemp(join(tmpdir(), "helix-")));
    const result = await importSpiralBuddy(store, vault);

    expect(result.subjects).toBe(2);
    expect(result.seededQuestions).toBe(1);
    expect(result.skipped).toEqual([
      { file: "_index.md", reason: "인덱스/내부 파일" },
      { file: "메모.md", reason: "frontmatter 없음" },
    ]);

    const bp = (await store.getSubject("innodb-buffer-pool"))!;
    expect(bp.layers).toHaveLength(1);
    expect(bp.sources[0]).toMatchObject({ kind: "spiral-buddy", roadmapId: null });

    const rf = (await store.getSubject("row-format"))!;
    expect(rf.layers[0].depth).toBe(1); // 파일명 d1에서 추출
  });
});
