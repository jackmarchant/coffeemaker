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
import { extname, join, normalize } from "node:path";
import {
  listBeans,
  getBean,
  insertBean,
  updateBean,
  deleteBean,
} from "./db.js";

const PORT = Number(process.env.PORT) || 8080;
const PUBLIC_DIR = process.cwd();

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
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

  // Prevent path traversal: resolve within PUBLIC_DIR only.
  const filePath = normalize(join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const data = await readFile(filePath);
    const type = MIME[extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/api/beans" || url.pathname.startsWith("/api/beans/")) {
    handleApi(req, res, url);
  } else {
    serveStatic(req, res, url);
  }
});

server.listen(PORT, () => {
  console.log(`coffeemaker listening on http://localhost:${PORT}`);
});
