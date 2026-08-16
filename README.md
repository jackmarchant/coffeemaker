# coffeemaker
Coffee making app

## Setup

The app is fully self-hosted: a small Node server (`server.js`) serves the
front-end **and** a JSON API backed by a single **SQLite file** on disk. No
Supabase, no subscription, no external dependencies — just Node.

> Requires **Node 22.5+** (for the built-in `node:sqlite` module). The
> `--experimental-sqlite` flag is already wired into the npm scripts.

1. Start the server:
   ```
   npm start
   ```
   It listens on `http://localhost:8080` and creates the database at
   `./data/beans.db` on first run. Override with env vars:
   - `PORT` — port to listen on (default `8080`)
   - `DB_PATH` — where the SQLite file lives (default `./data/beans.db`)
2. Install the git hooks so cache busting runs on commit:
   ```
   git config core.hooksPath .githooks
   ```

### Running it on EC2

A sample systemd unit lives in `deploy/coffeemaker.service`. Edit the paths and
user to match your instance, then:
```
sudo cp deploy/coffeemaker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now coffeemaker
```
Put nginx (or the AWS load balancer) in front for TLS if you want HTTPS. Back up
your data by copying the `data/` directory — that file *is* your database.

## Migrating off Supabase

To copy every existing bean out of Supabase into your local SQLite file
**automatically** (no manual export):

```
npm run migrate
```

It reads all rows from the old Supabase project and writes them into
`./data/beans.db`. The script is **idempotent** (rows are matched by `id`), so
it's safe to run more than once — run it on EC2 once the server is up, confirm
your beans show in the app, then cancel the Supabase subscription. Point it at a
different project or key with the `SUPABASE_URL` / `SUPABASE_ANON_KEY` env vars,
and target a different file with `DB_PATH`.

The old Postgres `schema.sql` is kept for reference only; the live schema now
lives in `db.js`.

## Cache busting

`styles.css` and `app.js` are referenced from the HTML with a `?v=<hash>` query
string. `scripts/bust-cache.sh` rewrites that hash from the file's content; the
pre-commit hook in `.githooks/pre-commit` runs it automatically and re-stages
the HTML if anything changed. `config.js`, `manifest.json`, and `icon.svg` are
not busted — edit them and the browser picks up the change on its normal
revalidation cycle.

For maximum cache lifetime on the EC2 server, pair this with HTTP headers:
`Cache-Control: public, max-age=31536000, immutable` for `*.css`/`*.js`, and
`Cache-Control: public, max-age=0, must-revalidate` for `*.html` and
`config.js`. Without those headers cache busting still works correctly — you
just don't get the long-lived cache benefit.

## How it works

- Each visitor picks a display name, which is stored in the browser's `localStorage` along with a generated UUID. There's no login.
- Everyone shares one bean list — every visitor sees every bean, regardless of who added it.
- Visitors with a name set can add beans; each bean is tagged with the contributor's name so you can see who added it.
- Any visitor can edit or delete any bean — the list is shared, so it's shared for writes too. Editing a bean preserves its original "Added by" credit rather than reassigning it to whoever made the edit.
- There is **no authentication of any kind**, and the API enforces none: anyone who can reach the server can change or delete any bean. The UI used to hide edit/delete for beans added by someone else, but that was cosmetic only (a plain `curl` bypassed it) and it broke ordinary use — a visitor's identity is a UUID in `localStorage`, so clearing site data or switching devices locked them out of their own beans permanently. Add real auth before relying on this for anything sensitive.
