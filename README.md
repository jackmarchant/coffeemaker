# coffeemaker
Coffee making app

## Setup

The app uses Supabase (Postgres + Google OAuth) so collections can be shared and contributed to by other signed-in users.

1. Create a Supabase project at https://supabase.com.
2. In the SQL editor, run `schema.sql` from this repo to create the `beans` table and Row Level Security policies.
3. In **Authentication → Providers**, enable **Google** and supply your OAuth client ID/secret. Add your site URL (e.g. `http://localhost:8000` and the Netlify URL) to **Authentication → URL Configuration → Redirect URLs**.
4. Copy your project's **URL** and **anon public key** from **Project Settings → API** into `config.js`:
   ```js
   window.GROUNDS_CONFIG = {
     SUPABASE_URL: "https://xxxx.supabase.co",
     SUPABASE_ANON_KEY: "eyJ...",
   };
   ```
5. Serve the directory (e.g. `python -m http.server` or deploy to Netlify).

## How it works

- Every signed-in user has one collection, identified by their user UUID.
- The **Share** button copies a link of the form `index.html?collection=<your-uuid>`.
- Anyone with that link can view the collection. Signed-in visitors can add beans to it (each bean is tagged with the contributor).
- Contributors can edit or delete only the beans they themselves added.
