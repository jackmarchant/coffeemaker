# coffeemaker
Coffee making app

## Setup

The app is fully self-hosted: a small Node server (`server.js`) serves the
front-end **and** a JSON API backed by a single **SQLite file** on disk. No
Supabase, no subscription, no external dependencies — just Node.

> Requires **Node 22.5+** (for the built-in `node:sqlite` module). There are
> **no npm dependencies** — npm is only a shortcut for the commands below, and
> you can run `node` directly instead (see "No npm? No problem").

### Installing Node

The default Node in most OS package repos is older than 22.5, so install it with
a version manager. This one line installs Node 22 (npm included) for your user,
no `sudo` required, on any Linux/macOS box:

```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash && . ~/.nvm/nvm.sh && nvm install 22
```

Then re-open your shell and confirm: `node -v` should print v22.5 or newer.

Prefer the system package manager? On Amazon Linux 2023 / RHEL:

```
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash - && sudo dnf install -y nodejs
```

(On Ubuntu/Debian swap `rpm`→`deb` and `dnf`→`apt-get`.)

### Running it

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

#### No npm? No problem

npm ships with Node, so the install above gives you both. But since there are no
dependencies, you never actually need npm — run `node` directly:

```
node --experimental-sqlite server.js     # same as: npm start
node --experimental-sqlite migrate.js    # same as: npm run migrate
```

The systemd unit below already calls `node` directly, not npm.

### Running it on a Linux server (in the background)

Use **systemd** so the server runs in the background, restarts if it crashes,
and comes back after a reboot. A sample unit lives in
`deploy/coffeemaker.service`.

```
# 1. Find your node path — required if you installed node with nvm:
which node
#    nvm prints something like /home/ec2-user/.nvm/versions/node/v22.x.x/bin/node
#    a system (NodeSource) install prints /usr/bin/node

# 2. Edit deploy/coffeemaker.service: set ExecStart to that node path, and
#    adjust User and WorkingDirectory to match your instance.

# 3. Install and start it:
sudo cp deploy/coffeemaker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now coffeemaker     # start now + on every boot
```

Manage and inspect it:
```
systemctl status coffeemaker        # is it running?
journalctl -u coffeemaker -f        # follow the logs
sudo systemctl restart coffeemaker  # after pulling new code
```

Put nginx (or the AWS load balancer) in front for TLS if you want HTTPS. Back up
your data by copying the `data/` directory — that file *is* your database.

> **Quick test without systemd:** to background it ad-hoc, use
> `nohup node --experimental-sqlite server.js > coffeemaker.log 2>&1 &`. This
> won't survive a reboot — prefer systemd for anything real.

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
- Every visitor with a name has one collection, identified by their UUID.
- The **Share** button copies a link of the form `index.html?collection=<your-uuid>`.
- Anyone with that link can view the collection. Visitors with a name set can add beans to it (each bean is tagged with the contributor's name).
- The UI only lets you edit/delete beans whose `added_by` matches your local UUID. Note: because there's no real authentication, this is honor-system only — anyone determined enough could write directly to the database. Add real auth before relying on it for anything sensitive.
