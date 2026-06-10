import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { FileHelixStore } from "@iq-helix/core";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

export function createApp(store: FileHelixStore): Hono {
  const app = new Hono();
  const publicDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "public",
  );

  app.get("/api/subjects", async (c) => c.json(await store.listSubjects()));

  app.get("/api/subjects/:id", async (c) => {
    const subject = await store.getSubject(c.req.param("id"));
    if (!subject) return c.json({ error: "존재하지 않는 subject" }, 404);
    return c.json(subject);
  });

  app.get("/api/questions", async (c) =>
    c.json(await store.openQuestions()),
  );

  app.get("*", async (c) => {
    const reqPath = normalize(c.req.path).replace(/^\/+/, "");
    const candidate = join(publicDir, reqPath || "index.html");
    const file =
      candidate.startsWith(publicDir) && existsSync(candidate) && extname(candidate)
        ? candidate
        : join(publicDir, "index.html");
    const body = await readFile(file);
    return c.body(body, 200, {
      "content-type": MIME[extname(file)] ?? "application/octet-stream",
    });
  });

  return app;
}
