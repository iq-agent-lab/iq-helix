/** "01-beanfactory.md" → "beanfactory". 결정적 slug (SPEC D1). */
export function slugifyChapter(chapterId: string): string {
  const base = chapterId.split("/").at(-1)!.replace(/\.md$/i, "");
  return slugify(base.replace(/^\d+[-_.]?/, ""));
}

export function slugify(raw: string): string {
  const s = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return s || "untitled";
}
