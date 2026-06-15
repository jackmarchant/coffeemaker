// One-shot migration: copy every bean out of Supabase into the local SQLite
// file, so you can cancel the Supabase subscription. Idempotent — rows are
// matched by id, so re-running tops up rather than duplicating.
//
//   node --experimental-sqlite migrate.js
//
// Credentials default to the project's original publishable values so the
// migration runs with no setup. Override with SUPABASE_URL / SUPABASE_ANON_KEY
// env vars if needed (e.g. after rotating the key).
import { upsertBean, countBeans } from "./db.js";

// The same public URL + anon (publishable) key the front-end used to read with.
const DEFAULT_SUPABASE_URL = "https://wiccvoradplsbjsjruwj.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_p7SKz3ljZl7_0HfmzDk-pQ_KqJSyp7n";

function loadConfig() {
  const url = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase credentials not found. Set SUPABASE_URL and SUPABASE_ANON_KEY."
    );
  }
  return { url: url.replace(/\/$/, ""), key };
}

async function fetchAllBeans({ url, key }) {
  const pageSize = 1000;
  const all = [];
  for (let offset = 0; ; offset += pageSize) {
    const endpoint = `${url}/rest/v1/beans?select=*&order=created_at.asc&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      throw new Error(`Supabase responded ${res.status}: ${await res.text()}`);
    }
    const page = await res.json();
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return all;
}

async function main() {
  const config = loadConfig();
  console.log(`Fetching beans from ${config.url} ...`);
  const beans = await fetchAllBeans(config);
  console.log(`Fetched ${beans.length} bean(s) from Supabase.`);

  let migrated = 0;
  for (const bean of beans) {
    upsertBean(bean);
    migrated++;
  }

  console.log(`Done. ${migrated} bean(s) written to the local database.`);
  console.log(`Local database now holds ${countBeans()} bean(s) total.`);
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
