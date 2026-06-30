// Single-process server for coffeemaker: serves the static front-end and a
// small JSON API backed by a local SQLite file. No external dependencies.
//
//   node --experimental-sqlite server.js
//
// Environment:
//   PORT      port to listen on (default 8080)
//   DB_PATH   path to the SQLite file (default ./data/beans.db)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import {
  listBeans,
  getBean,
  insertBean,
  updateBean,
  deleteBean,
} from "./db.js";

const PORT = Number(process.env.PORT) || 8080;
const PUBLIC_DIR = process.cwd();

// Only these files are served. An explicit allowlist (rather than "anything
// under PUBLIC_DIR") keeps the database, .git, server source and any other
// files in the working directory unreachable over HTTP.
const PUBLIC_FILES = new Set([
  "index.html",
  "edit.html",
  "app.js",
  "styles.css",
  "config.js",
  "manifest.json",
  "icon.svg",
]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("payload too large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean); // ["api", "beans", id?]
  const id = parts[2];

  try {
    if (req.method === "GET" && !id) {
      const collectionId = url.searchParams.get("collection_id");
      if (!collectionId) return sendJson(res, 400, { error: "collection_id required" });
      return sendJson(res, 200, listBeans(collectionId));
    }

    if (req.method === "GET" && id) {
      const bean = getBean(id);
      return bean ? sendJson(res, 200, bean) : sendJson(res, 404, { error: "not found" });
    }

    if (req.method === "POST" && !id) {
      const body = await readBody(req);
      if (!body.name || !body.collection_id || !body.added_by) {
        return sendJson(res, 400, { error: "name, collection_id and added_by are required" });
      }
      return sendJson(res, 201, insertBean(body));
    }

    if ((req.method === "PATCH" || req.method === "PUT") && id) {
      const body = await readBody(req);
      const bean = updateBean(id, body);
      return bean ? sendJson(res, 200, bean) : sendJson(res, 404, { error: "not found" });
    }

    if (req.method === "DELETE" && id) {
      return deleteBean(id)
        ? sendJson(res, 200, { ok: true })
        : sendJson(res, 404, { error: "not found" });
    }

    return sendJson(res, 405, { error: "method not allowed" });
  } catch (err) {
    console.error("API error", err);
    return sendJson(res, 400, { error: err.message || "bad request" });
  }
}

async function serveStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendJson(res, 405, { error: "method not allowed" });
  }
  let name = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  if (name === "") name = "index.html";

  // Serve only files on the allowlist. basename() collapses any path so a
  // request can never reach the database, .git, server source, or a sibling
  // directory — even via encoded traversal sequences.
  if (basename(name) !== name || !PUBLIC_FILES.has(name)) {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    return;
  }

  try {
    const data = await readFile(join(PUBLIC_DIR, name));
    const type = MIME[extname(name)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
}

const server = createServer((req, res) => {
  // Parse against a constant base: we only need the path and query from the
  // request, never the host. Building the base from the attacker-controlled
  // Host header (and not catching) previously let a malformed Host crash the
  // whole process. The try/catch also guards against a malformed request line.
  let url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch {
    return sendJson(res, 400, { error: "bad request" });
  }
  if (url.pathname === "/api/beans" || url.pathname.startsWith("/api/beans/")) {
    handleApi(req, res, url);
  } else {
    serveStatic(req, res, url);
  }
});

// Last-resort backstop: never let an unexpected error take the server down.
process.on("uncaughtException", (err) => {
  console.error("uncaughtException", err);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use — the server is probably already running. ` +
        `Stop the existing one first:  sudo fuser -k ${PORT}/tcp`
    );
  } else {
    console.error("server error", err);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`coffeemaker listening on http://localhost:${PORT}`);
});
