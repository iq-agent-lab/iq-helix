import YAML from "yaml";
import type {
  Edge,
  Layer,
  Mastery,
  OpenQuestion,
  SourceRef,
  Subject,
} from "./types.js";

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;
const ANCHOR_RE = /<!--\s*helix:layer\s+([^>]*?)-->/;

export const HELIX_FORMAT_VERSION = 1;

/** subject .md 전체 → Subject. frontmatter가 인덱스 진실, 본문 앵커가 layer 진실. */
export function parseSubject(md: string): Subject {
  const fmMatch = md.match(FRONTMATTER_RE);
  if (!fmMatch) throw new Error("subject 파일에 frontmatter가 없습니다");
  const fm = YAML.parse(fmMatch[1]) ?? {};
  if (fm.helix !== HELIX_FORMAT_VERSION) {
    throw new Error(`지원하지 않는 helix 포맷 버전: ${fm.helix}`);
  }
  if (!fm.id) throw new Error("frontmatter에 id가 없습니다");

  const body = md.slice(fmMatch[0].length);
  const layers = parseLayers(body);

  return {
    id: fm.id,
    title: fm.title ?? fm.id,
    status: fm.status === "archived" ? "archived" : "active",
    tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
    sources: Array.isArray(fm.sources) ? fm.sources.map(parseSourceRef) : [],
    mastery: parseMastery(fm.mastery, layers),
    layers,
    questions: Array.isArray(fm.questions)
      ? fm.questions.map(parseQuestion)
      : [],
    edges: Array.isArray(fm.edges) ? fm.edges.map(parseEdge) : [],
    ...(Array.isArray(fm.unresolved_links) && fm.unresolved_links.length > 0
      ? { unresolvedLinks: fm.unresolved_links.map(String) }
      : {}),
  };
}

function parseSourceRef(raw: any): SourceRef {
  if (raw?.kind === "spiral-buddy") {
    return {
      kind: "spiral-buddy",
      roadmapId: raw.roadmap_id ?? null,
      chapterId: String(raw.chapter_id ?? ""),
    };
  }
  return { kind: "manual" };
}

function parseQuestion(raw: any): OpenQuestion {
  return {
    id: String(raw.id),
    text: String(raw.text ?? ""),
    status: raw.status === "resolved" ? "resolved" : "open",
    raisedAtLayer: Number(raw.raised_at_layer ?? 1),
    ...(raw.resolved_at_layer != null
      ? { resolvedAtLayer: Number(raw.resolved_at_layer) }
      : {}),
    ...(raw.resolution != null ? { resolution: String(raw.resolution) } : {}),
  };
}

function parseEdge(raw: any): Edge {
  return {
    to: String(raw.to),
    type: raw.type,
    ...(raw.note != null ? { note: String(raw.note) } : {}),
  };
}

function parseMastery(raw: any, layers: Layer[]): Mastery {
  const derived = computeMastery(layers);
  return {
    layerCount: raw?.layer_count ?? derived.layerCount,
    ...(raw?.max_depth != null
      ? { maxDepth: Number(raw.max_depth) }
      : derived.maxDepth != null
        ? { maxDepth: derived.maxDepth }
        : {}),
    ...(raw?.confidence != null ? { confidence: Number(raw.confidence) } : {}),
    lastTouched: raw?.last_touched
      ? isoDate(raw.last_touched)
      : derived.lastTouched,
  };
}

/** layers에서 mastery 파생값 재계산 (SPEC §2 설계 노트, doctor 검증 기준) */
export function computeMastery(
  layers: Layer[],
  confidence?: number,
): Mastery {
  const depths = layers
    .map((l) => l.depth)
    .filter((d): d is number => d != null);
  return {
    layerCount: layers.length,
    ...(depths.length > 0 ? { maxDepth: Math.max(...depths) } : {}),
    ...(confidence != null ? { confidence } : {}),
    lastTouched:
      layers.length > 0
        ? layers.map((l) => l.date).sort().at(-1)!
        : isoDate(new Date()),
  };
}

function parseLayers(body: string): Layer[] {
  const layers: Layer[] = [];
  const blocks = body.split(/^## (?=Layer\b)/m).slice(1);
  for (const block of blocks) {
    const anchor = block.match(ANCHOR_RE);
    if (!anchor) continue;
    const attrs = parseAttrs(anchor[1]);
    const content = block.slice(block.indexOf(anchor[0]) + anchor[0].length);
    layers.push({
      index: Number(attrs.index),
      ...(attrs.depth != null ? { depth: Number(attrs.depth) } : {}),
      date: attrs.date ?? "",
      ...(attrs.session ? { sessionRef: attrs.session } : {}),
      content: { sections: parseSections(content) },
      addedQuestionIds: splitIds(attrs.adds),
      resolvedQuestionIds: splitIds(attrs.resolves),
    });
  }
  return layers.sort((a, b) => a.index - b.index);
}

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(/([\w-]+)=(\S+)/g)) out[m[1]] = m[2];
  return out;
}

function splitIds(raw?: string): string[] {
  return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

function parseSections(raw: string): { heading: string; body: string }[] {
  const sections: { heading: string; body: string }[] = [];
  const parts = raw.split(/^### /m);
  const lead = parts[0].trim();
  if (lead) sections.push({ heading: "", body: lead });
  for (const part of parts.slice(1)) {
    const nl = part.indexOf("\n");
    const heading = (nl === -1 ? part : part.slice(0, nl)).trim();
    const sectionBody = nl === -1 ? "" : part.slice(nl + 1).trim();
    sections.push({ heading, body: sectionBody });
  }
  return sections;
}

/** Subject → subject .md 전체. parse(serialize(s))는 의미 무손실(round-trip 불변식). */
export function serializeSubject(s: Subject): string {
  const fm: Record<string, unknown> = {
    helix: HELIX_FORMAT_VERSION,
    id: s.id,
    title: s.title,
    status: s.status,
    tags: s.tags,
    sources: s.sources.map((src) =>
      src.kind === "spiral-buddy"
        ? {
            kind: "spiral-buddy",
            roadmap_id: src.roadmapId,
            chapter_id: src.chapterId,
          }
        : { kind: "manual" },
    ),
    mastery: dropUndefined({
      layer_count: s.mastery.layerCount,
      max_depth: s.mastery.maxDepth,
      confidence: s.mastery.confidence,
      last_touched: s.mastery.lastTouched,
    }),
    questions: s.questions.map((q) =>
      dropUndefined({
        id: q.id,
        text: q.text,
        status: q.status,
        raised_at_layer: q.raisedAtLayer,
        resolved_at_layer: q.resolvedAtLayer,
        resolution: q.resolution,
      }),
    ),
    edges: s.edges.map((e) =>
      dropUndefined({ to: e.to, type: e.type, note: e.note }),
    ),
  };
  if (s.unresolvedLinks?.length) fm.unresolved_links = s.unresolvedLinks;

  const yaml = YAML.stringify(fm, { lineWidth: 0 });
  const layersMd = s.layers.map(serializeLayer).join("\n");
  return `---\n${yaml}---\n\n# ${s.title}\n\n${layersMd}`;
}

function serializeLayer(l: Layer): string {
  const heading = `## Layer ${l.index} — ${l.date}${
    l.depth != null ? ` (depth ${l.depth})` : ""
  }`;
  const attrs = [`index=${l.index}`];
  if (l.depth != null) attrs.push(`depth=${l.depth}`);
  attrs.push(`date=${l.date}`);
  if (l.sessionRef) attrs.push(`session=${l.sessionRef}`);
  if (l.addedQuestionIds.length) attrs.push(`adds=${l.addedQuestionIds.join(",")}`);
  if (l.resolvedQuestionIds.length)
    attrs.push(`resolves=${l.resolvedQuestionIds.join(",")}`);
  const anchor = `<!-- helix:layer ${attrs.join(" ")} -->`;
  const sections = l.content.sections
    .map((sec) => (sec.heading ? `### ${sec.heading}\n\n${sec.body}` : sec.body))
    .join("\n\n");
  return `${heading}\n${anchor}\n\n${sections}\n`;
}

function dropUndefined<T extends Record<string, unknown>>(obj: T): T {
  for (const k of Object.keys(obj)) if (obj[k] === undefined) delete obj[k];
  return obj;
}

export function isoDate(d: string | Date): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}
