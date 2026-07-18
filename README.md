# Salah Calendar — Google Sign-In + Cloud Sync

Two pieces:

- **`server/`** — Express + SQLite API. Verifies Google sign-in, issues a session
  cookie, stores each user's `events` and `settings` blobs.
- **`client/`** — Your existing calendar UI (`SalahCalendar.jsx` / `engine.js`,
  unchanged), plus a login screen (`App.jsx`) and a storage adapter that now
  talks to the API instead of `window.storage`/`localStorage`.

How it fits together: the client gets a Google ID token from Google's own
sign-in widget, sends it to the server, and the server verifies that token
directly with Google before trusting it. That verification step is the reason
this needs a real server — it can't be done safely in front-end-only code.

## 1. Create a Google OAuth Client ID

1. Go to https://console.cloud.google.com/ and create (or pick) a project.
2. **APIs & Services → OAuth consent screen** — set it up for "External" users,
   fill in the required fields (app name, support email). You can leave it in
   "Testing" mode while developing; add your own Google account under **Test users**.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Web application**.
   - **Authorized JavaScript origins**: add `http://localhost:5173` (dev) and
     later your real client URL (e.g. `https://your-app.vercel.app`).
   - You do **not** need an Authorized redirect URI for this flow (Google
     Identity Services' one-tap/button flow uses a JS callback, not a redirect).
4. Copy the generated **Client ID** — you'll paste it into both `.env` files below.

## 2. Configure environment variables

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Edit `server/.env`:
- `GOOGLE_CLIENT_ID` — the client ID from step 1
- `JWT_SECRET` — generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `CLIENT_URL` — `http://localhost:5173` for local dev

Edit `client/.env`:
- `VITE_GOOGLE_CLIENT_ID` — same client ID as above
- `VITE_API_URL` — `http://localhost:8787` for local dev

## 3. Run it locally

```bash
# terminal 1
cd server
npm install
npm run dev

# terminal 2
cd client
npm install
npm run dev
```

Open the client's local URL (Vite will print it, typically `http://localhost:5173`).
You should see a "Sign in with Google" screen; after signing in, your calendar
loads and every change (events, settings) now saves to `server/data.db` under
your Google account instead of local browser storage.

## 4. Deploying for real

The client is a static site; the server is a small Node process with a SQLite
file next to it, so it needs a host that keeps a persistent disk (not a
serverless function host like plain Vercel functions, since SQLite needs a
writable file that sticks around between requests).

A simple combo that works well:

- **Server** → [Render](https://render.com) or [Railway](https://railway.app):
  point it at `server/`, set the same env vars as `server/.env` (with
  `COOKIE_SECURE=true` and `CLIENT_URL` set to your real client URL), start
  command `npm start`. Both offer a persistent disk for the SQLite file on
  their free/starter tiers.
- **Client** → [Vercel](https://vercel.com) or [Netlify](https://netlify.com):
  point it at `client/`, build command `npm run build`, output dir `dist`.
  Set `VITE_GOOGLE_CLIENT_ID` and `VITE_API_URL` (your deployed server's URL)
  as environment variables there.

Once both are deployed:
- Add the deployed client URL to the OAuth client's **Authorized JavaScript origins**
  in Google Cloud Console.
- Update `server`'s `CLIENT_URL` and `client`'s `VITE_API_URL` to the real URLs.
- Move the OAuth consent screen out of "Testing" to "In production" if you want
  anyone (not just your listed test users) to be able to sign in.

## Notes

- Sessions last 30 days (httpOnly cookie); "Sign out" in the settings drawer
  clears it.
- The API only stores two things per user — the `events` array and the
  `settings` object — matching exactly what the app already persisted locally.
  If you add more persisted state later, the same `store.get/set(key, value)`
  pattern in `SalahCalendar.jsx` extends to any new key with no server changes needed.
- SQLite is fine for a personal app or modest user base. If you outgrow it,
  swapping `server/src/db.js` for Postgres (e.g. via `pg`) is a contained change —
  the rest of the server code only calls the four exported functions in that file.
