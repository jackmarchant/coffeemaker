// Tiny SQLite-backed data layer for the beans collection.
// Uses Node's built-in node:sqlite (no external dependencies) — the whole
// "database" is a single file on disk, configurable via the DB_PATH env var.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const DB_PATH = resolve(process.env.DB_PATH || "./data/beans.db");

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

// WAL gives us safer concurrent reads/writes for this low-traffic app.
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS beans (
    id            TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL,
    added_by      TEXT NOT NULL,
    added_by_name TEXT,
    name          TEXT NOT NULL,
    roaster       TEXT,
    rating        INTEGER NOT NULL DEFAULT 0,
    roast_type    TEXT,
    notes         TEXT,
    favorite      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`);

db.exec(
  "CREATE INDEX IF NOT EXISTS beans_collection_id_idx ON beans (collection_id, created_at DESC);"
);

// SQLite has no boolean type; normalise to/from JS booleans at the edges.
function rowToBean(row) {
  if (!row) return null;
  return { ...row, favorite: !!row.favorite };
}

export function listBeans(collectionId) {
  const rows = db
    .prepare(
      "SELECT * FROM beans WHERE collection_id = ? ORDER BY created_at DESC"
    )
    .all(collectionId);
  return rows.map(rowToBean);
}

export function getBean(id) {
  return rowToBean(db.prepare("SELECT * FROM beans WHERE id = ?").get(id));
}

export function insertBean(input) {
  const bean = {
    id: input.id || randomUUID(),
    collection_id: input.collection_id,
    added_by: input.added_by,
    added_by_name: input.added_by_name ?? null,
    name: input.name,
    roaster: input.roaster ?? null,
    rating: Number(input.rating) || 0,
    roast_type: input.roast_type ?? null,
    notes: input.notes ?? null,
    favorite: input.favorite ? 1 : 0,
    created_at: input.created_at || new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO beans
       (id, collection_id, added_by, added_by_name, name, roaster, rating, roast_type, notes, favorite, created_at)
     VALUES
       (@id, @collection_id, @added_by, @added_by_name, @name, @roaster, @rating, @roast_type, @notes, @favorite, @created_at)`
  ).run(bean);
  return getBean(bean.id);
}

// Idempotent insert used by the migration so re-running won't duplicate rows.
export function upsertBean(input) {
  if (input.id && getBean(input.id)) {
    db.prepare(
      `UPDATE beans SET
         collection_id = @collection_id,
         added_by      = @added_by,
         added_by_name = @added_by_name,
         name          = @name,
         roaster       = @roaster,
         rating        = @rating,
         roast_type    = @roast_type,
         notes         = @notes,
         favorite      = @favorite,
         created_at    = @created_at
       WHERE id = @id`
    ).run({
      id: input.id,
      collection_id: input.collection_id,
      added_by: input.added_by,
      added_by_name: input.added_by_name ?? null,
      name: input.name,
      roaster: input.roaster ?? null,
      rating: Number(input.rating) || 0,
      roast_type: input.roast_type ?? null,
      notes: input.notes ?? null,
      favorite: input.favorite ? 1 : 0,
      created_at: input.created_at || new Date().toISOString(),
    });
    return getBean(input.id);
  }
  return insertBean(input);
}

const UPDATABLE = [
  "collection_id",
  "added_by",
  "added_by_name",
  "name",
  "roaster",
  "rating",
  "roast_type",
  "notes",
  "favorite",
];

export function updateBean(id, input) {
  if (!getBean(id)) return null;
  const sets = [];
  const params = { id };
  for (const key of UPDATABLE) {
    if (key in input) {
      sets.push(`${key} = @${key}`);
      params[key] =
        key === "favorite"
          ? input[key]
            ? 1
            : 0
          : key === "rating"
            ? Number(input[key]) || 0
            : input[key] ?? null;
    }
  }
  if (sets.length) {
    db.prepare(`UPDATE beans SET ${sets.join(", ")} WHERE id = @id`).run(params);
  }
  return getBean(id);
}

export function deleteBean(id) {
  const result = db.prepare("DELETE FROM beans WHERE id = ?").run(id);
  return result.changes > 0;
}

export function countBeans() {
  return db.prepare("SELECT COUNT(*) AS n FROM beans").get().n;
}
