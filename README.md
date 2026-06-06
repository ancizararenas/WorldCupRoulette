# La Chusma Mundealera 2026 — Roulette Draw

A shared roulette that pairs each player with a national team, played live across
everyone's phones in three steps:

1. **Setup** — a host enters the list of teams. The number of teams sets the number of player slots.
2. **Lobby** — each player opens the site and types their name; every roster entry syncs to all devices instantly. The draw can start once the roster is full (players = teams).
3. **Play** — each spinner selects their name, hits **SPIN**, and the wheel lands them a team. The pair drops onto the results board and both leave the pool until everyone's drawn.

A **Reset** button clears everything and starts a brand-new game from step 1.

- **Frontend** — pure HTML / CSS / JS (no build step) → host free on **GitHub Pages**.
- **Backend** — a tiny **Express** REST API using **Node's built-in SQLite** (`node:sqlite`,
  no native module to compile) → needs **Node 24+** → host free on Render / Railway / Fly.
- State lives centrally in the SQLite file, so every device sees the same game.

### Host link vs. player link

Open the site with a `?host=...` parameter (e.g. `https://you.github.io/repo/?host=1`) to
get **host mode**: you'll see the team-setup screen and the **Reset** button, plus a
**Copy player link** button. Share that copied link (the same URL *without* `?host`) with
everyone else — they'll only see the teams and a box to enter their name. While the host is
still choosing teams, players see a "hang tight" screen that flips to the lobby automatically.

This gating is client-side (it controls what each device *shows*), which is plenty for a
friendly game; it isn't hardened against someone hand-crafting API calls. Ask if you'd like
a server-enforced host key.

```
worldcup-roulette/
├── index.html          ← frontend (GitHub Pages serves this)
├── styles.css
├── app.js              ← set API_BASE near the top
├── audio.js            ← synthesized theme song + sound effects
└── server/
    ├── server.js       ← REST API + SQLite
    ├── package.json
    └── sim_test.js     ← optional: `node sim_test.js` sanity-checks the draw
```

The wheel is a real prize-wheel spin with a ratcheting tick that slows with the
wheel, a winner spotlight, confetti, a progress bar, and an original looping
theme song — all generated in-browser with the Web Audio API (no audio files,
nothing copyrighted). A sound toggle sits in the top bar; browsers only allow
audio after the first tap/click, so music starts on first interaction.

## API

| Method | Path          | Purpose                                  |
|--------|---------------|------------------------------------------|
| GET    | `/api/state`  | Current game: status, players, teams, results       |
| POST   | `/api/setup`  | `{ teams:[] }` — set the teams, open the lobby       |
| POST   | `/api/join`   | `{ name }` — add a player to the lobby roster        |
| POST   | `/api/unjoin` | `{ name }` — remove a name from the lobby            |
| POST   | `/api/start`  | Lock the roster and begin (needs players = teams)   |
| POST   | `/api/spin`   | `{ player }` — draw a team for that player           |
| POST   | `/api/reset`  | Wipe everything and return to setup                 |

`status` moves through `setup → lobby → active → complete`.

All draw logic runs **server-side** and is never sent to the browser — clients
only receive the final pairing. (If you want it kept fully private, publish only
the frontend to GitHub Pages and host `server/` from a private repository.)

## Run locally

```bash
cd server
npm install          # pure-JS deps only (express, cors) — no native build
npm start            # → http://localhost:3000
```

Requires **Node 24+** (built-in SQLite is enabled by default there). On Node 22.5–23
start it with `node --experimental-sqlite server.js` instead. You may see a harmless
"SQLite is an experimental feature" warning in the console — that's expected.

Then open `index.html` in a browser. With the API on `localhost:3000`, the default
`API_BASE` already matches, so it just works. (Tip: opening via a local static
server such as `npx serve .` avoids any `file://` quirks.)

## Deploy

**Backend (Render, free):** New → Web Service → connect this repo →
set **Root Directory** to `server`, **Build** `npm install`, **Start**
`node server.js`. Copy the resulting URL, e.g. `https://your-api.onrender.com`.

**Frontend (GitHub Pages):** in `app.js` set

```js
const API_BASE = "https://your-api.onrender.com";
```

push, then Settings → Pages → Deploy from branch → `main` / root. Your site
appears at `https://<you>.github.io/<repo>/`.

> You can also override the API without editing code by adding
> `?api=https://your-api.onrender.com` to the page URL.

## Notes

- **One shared game at a time** — anyone can spin; the server resolves each spin
  atomically and all devices poll every ~2.5 s to stay in sync.
- **Persistence** — the SQLite file persists across requests. On free hosting tiers
  the disk is ephemeral (it can reset on redeploy or sleep); attach a small
  persistent disk if you need the game to survive restarts.
- **CORS** is open so any origin (your Pages site) can call the API.
- Players = teams in count; each name ends up paired with exactly one team.
