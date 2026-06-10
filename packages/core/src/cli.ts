#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { checkAll } from "./doctor.js";
import { importSpiralBuddy } from "./importer.js";
import { FileHelixStore } from "./store.js";

function resolveRoot(args: string[]): string {
  const i = args.indexOf("--root");
  if (i !== -1 && args[i + 1]) return args[i + 1];
  return process.env.HELIX_ROOT ?? join(homedir(), "helix");
}

const USAGE = `helix — 나선형 사고 노트 (iq-helix)

사용법:
  helix import spiral-buddy <vault-or-notes-path> [--root <helix-root>]
  helix reindex [--root <helix-root>]
  helix doctor  [--root <helix-root>]

root 기본값: $HELIX_ROOT 또는 ~/helix`;

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2);
  const store = new FileHelixStore(resolveRoot(rest));

  if (cmd === "import" && rest[0] === "spiral-buddy" && rest[1]) {
    const r = await importSpiralBuddy(store, rest[1]);
    console.log(
      `import 완료 → ${store.root}\n` +
        `  subjects: ${r.subjects}, layers: ${r.layers}, 시드된 질문: ${r.seededQuestions}\n` +
        `  edges 변환: ${r.resolvedEdges}, unresolved links: ${r.unresolvedLinks}` +
        (r.skippedFiles.length
          ? `\n  건너뜀(${r.skippedFiles.length}): ${r.skippedFiles.join(", ")}`
          : ""),
    );
    return 0;
  }

  if (cmd === "reindex") {
    await store.reindex();
    console.log(`reindex 완료 → ${store.indexPath}`);
    return 0;
  }

  if (cmd === "doctor") {
    const issues = checkAll(await store.readAll());
    if (issues.length === 0) {
      console.log("doctor: 문제 없음 ✓");
      return 0;
    }
    for (const i of issues) {
      console.log(`[${i.level}] ${i.subjectId}: ${i.message}`);
    }
    return issues.some((i) => i.level === "error") ? 1 : 0;
  }

  console.log(USAGE);
  return cmd ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
