/* ──────────────────────────────────────────────────────────────────────────
 *  La Chusma Mundealera 2026  —  REST API
 *  Express + Node's built-in SQLite (node:sqlite) — a single-file "lite DB"
 *  with NO native module to compile (no better-sqlite3 / node-gyp / Xcode).
 *
 *  Requires Node v24+ (built-in SQLite is unflagged there).
 *  On Node v22.5–23 it also works if you start with: node --experimental-sqlite server.js
 *
 *  All draw logic lives here on the server. The client only ever receives the
 *  final {player, team} pairing, so the selection rule is never exposed in the
 *  browser (nothing about it appears in /api/state or DevTools).
 * ────────────────────────────────────────────────────────────────────────── */

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  console.error('\n[!] This server uses Node\'s built-in SQLite (node:sqlite).');
  console.error('    It needs Node v24+ (or Node v22.5–23 started with --experimental-sqlite).');
  console.error('    Your Node version is ' + process.version + '.\n');
  process.exit(1);
}

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();
app.use(cors());                 // open CORS so a GitHub Pages origin can call this
app.use(express.json());

/* ── Database ─────────────────────────────────────────────────────────────── */
const db = new DatabaseSync(path.join(__dirname, 'roulette.db'));
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS game (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    status     TEXT    NOT NULL DEFAULT 'setup',   -- setup | active | complete
    rig_armed  INTEGER NOT NULL DEFAULT 0,         -- never sent to the client
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS players (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT    NOT NULL,
    used     INTEGER NOT NULL DEFAULT 0,
    position INTEGER
  );
  CREATE TABLE IF NOT EXISTS teams (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT    NOT NULL,
    used     INTEGER NOT NULL DEFAULT 0,
    position INTEGER
  );
  CREATE TABLE IF NOT EXISTS results (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT NOT NULL,
    team_name   TEXT NOT NULL,
    spun_at     TEXT
  );
`);

db.prepare(`INSERT OR IGNORE INTO game (id, status) VALUES (1, 'setup')`).run();

// node:sqlite has no transaction() helper — small wrapper around BEGIN/COMMIT.
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

/* ── Selection rule (server-side only) ──────────────────────────────────────
 * Each "rigged" player is guaranteed one of their preferred teams whenever at
 * least one of those teams is in the pool. Multiple rigged players are all
 * satisfied simultaneously — the engine reserves teams so nobody is stranded —
 * even when their preferred lists overlap (e.g. Spain appears in both below).  */
const RIGGED = [
  { names: ['anci', 'ancizar'], teams: ['brazil', 'spain'] },
  { names: ['julian'],          teams: ['france', 'spain'] },
];
const norm = (s) => String(s).trim().toLowerCase();
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// preferred team list (lowercase) for a player name, or null if not rigged
function preferredFor(name) {
  const n = norm(name);
  const g = RIGGED.find((r) => r.names.includes(n));
  return g ? g.teams : null;
}
const isRiggedName = (name) => preferredFor(name) !== null;

// Can every *armed* rigged player in `players` be matched to a DISTINCT preferred
// team present in `teams`? "Armed" = their preferred list intersects the full pool
// (`allTeamNames`) — so removing their last preferred team is a failure, not a free
// pass. Non-armed rigged players (teams never in the pool) carry no constraint.
function riggedSatisfiable(players, teams, allTeamNames) {
  const armed = players.filter((p) => {
    const pref = preferredFor(p.name);
    return pref && pref.some((t) => allTeamNames.includes(t));
  });
  const tnames = teams.map((t) => norm(t.name));
  const adj = armed.map((p) => {
    const pref = preferredFor(p.name);
    const idx = [];
    tnames.forEach((tn, i) => { if (pref.includes(tn)) idx.push(i); });
    return idx;
  });
  const owner = new Array(teams.length).fill(-1);
  const assign = (u, seen) => {
    for (const v of adj[u]) {
      if (!seen[v]) {
        seen[v] = true;
        if (owner[v] === -1 || assign(owner[v], seen)) { owner[v] = u; return true; }
      }
    }
    return false;
  };
  for (let u = 0; u < armed.length; u++) {
    if (!assign(u, new Array(teams.length).fill(false))) return false;  // empty adj ⇒ fails
  }
  return true;
}

// Pick a team for `player` so every OTHER armed rigged player stays satisfiable.
function chooseTeam(player, remainingPlayers, remainingTeams, allTeamNames) {
  const pref = preferredFor(player.name);
  let candidates;
  if (pref) {
    const present = remainingTeams.filter((t) => pref.includes(norm(t.name)));
    candidates = present.length ? present : remainingTeams;   // none present → draw normally
  } else {
    candidates = remainingTeams;                              // not rigged → any team
  }
  const others = remainingPlayers.filter((p) => p.id !== player.id && isRiggedName(p.name));
  const safe = candidates.filter((t) =>
    riggedSatisfiable(others, remainingTeams.filter((x) => x.id !== t.id), allTeamNames));
  return pick(safe.length ? safe : candidates);               // prefer safe, else best-effort
}

/* ── State (the only shape the client ever sees) ──────────────────────────── */
function getState() {
  const game    = db.prepare('SELECT status FROM game WHERE id = 1').get();
  const players = db.prepare('SELECT name, used FROM players ORDER BY position').all();
  const teams   = db.prepare('SELECT name, used FROM teams   ORDER BY position').all();
  const results = db.prepare('SELECT player_name, team_name, spun_at FROM results ORDER BY id').all();
  return { status: game.status, players, teams, results };   // rig_armed deliberately omitted
}

/* ── Routes ───────────────────────────────────────────────────────────────── */
app.get('/api/state', (_req, res) => res.json(getState()));

app.post('/api/setup', (req, res) => {
  const { players, teams } = req.body || {};
  if (!Array.isArray(players) || !Array.isArray(teams))
    return res.status(400).json({ error: 'players and teams must be arrays' });

  const cleanPlayers = players.map((p) => String(p).trim()).filter(Boolean);
  const cleanTeams   = teams.map((t) => String(t).trim()).filter(Boolean);

  if (cleanPlayers.length === 0)
    return res.status(400).json({ error: 'Add at least one player.' });
  if (cleanPlayers.length !== cleanTeams.length)
    return res.status(400).json({ error: `Players (${cleanPlayers.length}) and teams (${cleanTeams.length}) must be the same count.` });

  const rigArmed = cleanPlayers.some(isRiggedName) ? 1 : 0;

  tx(() => {
    db.prepare('DELETE FROM players').run();
    db.prepare('DELETE FROM teams').run();
    db.prepare('DELETE FROM results').run();
    const insP = db.prepare('INSERT INTO players (name, used, position) VALUES (?, 0, ?)');
    cleanPlayers.forEach((n, i) => insP.run(n, i));
    const insT = db.prepare('INSERT INTO teams (name, used, position) VALUES (?, 0, ?)');
    cleanTeams.forEach((n, i) => insT.run(n, i));
    db.prepare(`UPDATE game SET status='active', rig_armed=?, created_at=? WHERE id=1`)
      .run(rigArmed, new Date().toISOString());
  });

  res.json(getState());
});

app.post('/api/spin', (_req, res) => {
  const game = db.prepare('SELECT status, rig_armed FROM game WHERE id = 1').get();
  if (game.status !== 'active') return res.status(409).json({ error: 'No active game.' });

  const remainingPlayers = db.prepare('SELECT id, name FROM players WHERE used = 0').all();
  const remainingTeams   = db.prepare('SELECT id, name FROM teams   WHERE used = 0').all();
  if (remainingPlayers.length === 0 || remainingTeams.length === 0)
    return res.status(409).json({ error: 'Game already complete.' });

  const allTeams = db.prepare('SELECT name FROM teams').all().map((t) => norm(t.name));
  const player = pick(remainingPlayers);
  const team = chooseTeam(player, remainingPlayers, remainingTeams, allTeams);

  tx(() => {
    db.prepare('UPDATE players SET used = 1 WHERE id = ?').run(player.id);
    db.prepare('UPDATE teams   SET used = 1 WHERE id = ?').run(team.id);
    db.prepare('INSERT INTO results (player_name, team_name, spun_at) VALUES (?, ?, ?)')
      .run(player.name, team.name, new Date().toISOString());
    const left = db.prepare('SELECT COUNT(*) AS c FROM players WHERE used = 0').get().c;
    if (left === 0) db.prepare(`UPDATE game SET status='complete' WHERE id=1`).run();
  });

  res.json({ player: player.name, team: team.name, state: getState() });
});

app.post('/api/reset', (_req, res) => {
  tx(() => {
    db.prepare('DELETE FROM players').run();
    db.prepare('DELETE FROM teams').run();
    db.prepare('DELETE FROM results').run();
    db.prepare(`UPDATE game SET status='setup', rig_armed=0, created_at=NULL WHERE id=1`).run();
  });
  res.json(getState());
});

app.get('/', (_req, res) => res.send('La Chusma Mundealera 2026 API is running.'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Roulette API listening on :${PORT}`));
