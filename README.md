# coffeemaker
Coffee making app

## Setup

The app uses Supabase Postgres so collections persist and can be shared with friends who can contribute their own beans.

1. Create a Supabase project at https://supabase.com.
2. In the SQL editor, run `schema.sql` from this repo to create the `beans` table and Row Level Security policies. (The script is idempotent — safe to re-run.)
3. Copy your project's **URL** and **publishable / anon public key** from **Project Settings → API** into `config.js`:
   ```js
   window.GROUNDS_CONFIG = {
     SUPABASE_URL: "https://xxxx.supabase.co",
     SUPABASE_ANON_KEY: "sb_publishable_...",
   };
   ```
4. Serve the directory (e.g. `python -m http.server` or deploy to Netlify).

## How it works

- Each visitor picks a display name, which is stored in the browser's `localStorage` along with a generated UUID. There's no login.
- Every visitor with a name has one collection, identified by their UUID.
- The **Share** button copies a link of the form `index.html?collection=<your-uuid>`.
- Anyone with that link can view the collection. Visitors with a name set can add beans to it (each bean is tagged with the contributor's name).
- The UI only lets you edit/delete beans whose `added_by` matches your local UUID. Note: because there's no real authentication, this is honor-system only — anyone determined enough could write directly to the database. Add real auth before relying on it for anything sensitive.
