#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { FileHelixStore } from "@iq-helix/core";
import { createApp } from "./server.js";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const root = arg("--root", process.env.HELIX_ROOT ?? join(homedir(), "helix"));
const port = Number(arg("--port", "4180"));
const store = new FileHelixStore(root);

serve({ fetch: createApp(store).fetch, port }, () => {
  console.log(`iq-helix viewer → http://localhost:${port}  (root: ${root})`);
});
