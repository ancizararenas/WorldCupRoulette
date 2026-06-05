/* Faithful, DB-free replica of the spin algorithm in server.js, exercised
 * over many randomized games to prove the invariants hold. */

const RIGGED_NAMES = new Set(['anci', 'ancizar']);
const TOP_TEAMS    = new Set(['brazil', 'spain']);
const norm     = (s) => String(s).trim().toLowerCase();
const isRigged = (n) => RIGGED_NAMES.has(norm(n));
const isTop    = (t) => TOP_TEAMS.has(norm(t));
const pick     = (a) => a[Math.floor(Math.random() * a.length)];

function armed(players, teams) {
  return players.some(isRigged) &&
         teams.some((t) => norm(t) === 'brazil') &&
         teams.some((t) => norm(t) === 'spain');
}

// Plays one full game, returns the final {player: team} mapping.
function playGame(playersIn, teamsIn) {
  let players = playersIn.map((name, i) => ({ id: i, name }));
  let teams   = teamsIn.map((name, i) => ({ id: i, name }));
  const rig   = armed(playersIn, teamsIn);
  const out   = {};

  while (players.length) {
    const player = pick(players);
    let team;

    if (rig) {
      const topRemaining    = teams.filter((t) => isTop(t.name));
      const riggedUnmatched = players.filter((p) => isRigged(p.name)).length;
      if (isRigged(player.name)) {
        team = pick(topRemaining.length ? topRemaining : teams);
      } else if (topRemaining.length > riggedUnmatched) {
        team = pick(teams);
      } else {
        const nonTop = teams.filter((t) => !isTop(t.name));
        team = pick(nonTop.length ? nonTop : teams);
      }
    } else {
      team = pick(teams);
    }

    out[player.name] = team.name;
    players = players.filter((p) => p.id !== player.id);
    teams   = teams.filter((t) => t.id !== team.id);
  }
  return out;
}

/* ── Test configurations ──────────────────────────────────────────────────── */
const POOL = ['Brazil','Spain','France','Argentina','England','Portugal',
              'Germany','Netherlands','Croatia','Mexico','USA','Japan',
              'Morocco','Belgium','Uruguay','Senegal'];

function sample(arr, n) {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) { const j = (Math.random()*(i+1))|0; [c[i],c[j]]=[c[j],c[i]]; }
  return c.slice(0, n);
}

const RUNS = 30000;
let armedGames = 0, anciTop = 0, anciSeen = 0;
let nonRiggedGotTop = 0, balanceFails = 0;
const anciTeamCounts = {};                       // which top team Anci ends with
const noRigAnciTeam  = {};                       // control: Spain absent -> Anci spread

for (let r = 0; r < RUNS; r++) {
  const n = 4 + ((Math.random()*9)|0);           // 4..12 players/teams
  const teams = sample(POOL, n);
  const names = ['Anci'];                          // always include the rigged name
  while (names.length < n) names.push('P' + names.length);

  const map = playGame(names, teams);

  // 1:1 balance: every player mapped to a distinct team, counts equal.
  const mapped = Object.keys(map);
  const usedTeams = new Set(Object.values(map));
  if (mapped.length !== n || usedTeams.size !== n) balanceFails++;

  const isArmed = armed(names, teams);
  if (isArmed) {
    armedGames++;
    anciSeen++;
    const t = map['Anci'];
    anciTeamCounts[t] = (anciTeamCounts[t] || 0) + 1;
    if (isTop(t)) anciTop++;
    // did some non-rigged player get a top team in this armed game? (non-obviousness)
    if (Object.entries(map).some(([p, tm]) => !isRigged(p) && isTop(tm))) nonRiggedGotTop++;
  }
}

// Control group: Spain absent -> rule must NOT fire, Anci should spread around.
for (let r = 0; r < RUNS; r++) {
  const n = 4 + ((Math.random()*9)|0);
  const teams = sample(POOL.filter((t) => t !== 'Spain'), n);  // no Spain
  const names = ['Anci'];
  while (names.length < n) names.push('P' + names.length);
  const map = playGame(names, teams);
  const t = map['Anci'];
  noRigAnciTeam[t] = (noRigAnciTeam[t] || 0) + 1;
}

/* ── Report ───────────────────────────────────────────────────────────────── */
console.log('Armed games:               ', armedGames, '/', RUNS);
console.log('1:1 balance failures:      ', balanceFails, '  (must be 0)');
console.log('Anci landed on a top team: ', anciTop, '/', anciSeen,
            '=>', ((anciTop / anciSeen) * 100).toFixed(2) + '%  (must be 100%)');
console.log('Anci team split (armed):   ', anciTeamCounts);
console.log('Armed games where a non-rigged player also got a top team:',
            ((nonRiggedGotTop / armedGames) * 100).toFixed(1) + '%  (>0 => not obvious)');
console.log('CONTROL (no Spain) Anci spread:', noRigAnciTeam);

const ok = balanceFails === 0 && anciTop === anciSeen;
console.log('\n' + (ok ? 'PASS ✅  Rule holds and pairing stays 1:1.'
                        : 'FAIL ❌'));
process.exit(ok ? 0 : 1);
