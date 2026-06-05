/* DB-free replica of the draw engine in server.js, exercised over many random
 * games to prove the rigging + 1:1 invariants hold (incl. the overlapping Spain).
 * Run:  node sim_test.js  */

const RIGGED = [
  { names: ['anci', 'ancizar'], teams: ['brazil', 'spain'] },
  { names: ['julian'],          teams: ['france', 'spain'] },
];
const norm = (s) => String(s).trim().toLowerCase();
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const preferredFor = (name) => { const g = RIGGED.find((r) => r.names.includes(norm(name))); return g ? g.teams : null; };
const isRiggedName = (name) => preferredFor(name) !== null;

function riggedSatisfiable(players, teams, allTeamNames) {
  const armed = players.filter((p) => { const pref = preferredFor(p.name); return pref && pref.some((t) => allTeamNames.includes(t)); });
  const tnames = teams.map((t) => norm(t.name));
  const adj = armed.map((p) => { const pref = preferredFor(p.name); const idx = []; tnames.forEach((tn, i) => { if (pref.includes(tn)) idx.push(i); }); return idx; });
  const owner = new Array(teams.length).fill(-1);
  const assign = (u, seen) => { for (const v of adj[u]) { if (!seen[v]) { seen[v] = true; if (owner[v] === -1 || assign(owner[v], seen)) { owner[v] = u; return true; } } } return false; };
  for (let u = 0; u < armed.length; u++) if (!assign(u, new Array(teams.length).fill(false))) return false;
  return true;
}
function chooseTeam(player, rp, rt, all) {
  const pref = preferredFor(player.name);
  let cand = pref ? (rt.filter((t) => pref.includes(norm(t.name))).length ? rt.filter((t) => pref.includes(norm(t.name))) : rt) : rt;
  const others = rp.filter((p) => p.id !== player.id && isRiggedName(p.name));
  const safe = cand.filter((t) => riggedSatisfiable(others, rt.filter((x) => x.id !== t.id), all));
  return pick(safe.length ? safe : cand);
}
function playGame(names, teamNames) {
  let players = names.map((n, i) => ({ id: i, name: n }));
  let teams = teamNames.map((n, i) => ({ id: i, name: n }));
  const all = teamNames.map(norm);
  const out = {};
  while (players.length) {
    const p = pick(players);
    const t = chooseTeam(p, players, teams, all);
    out[p.name] = t.name;
    players = players.filter((x) => x.id !== p.id);
    teams = teams.filter((x) => x.id !== t.id);
  }
  return out;
}

// oracle: is there an SDR satisfying BOTH Anci{br,sp} and Julian{fr,sp} in this pool?
function jointlyFeasible(teamNames) {
  const tl = teamNames.map(norm);
  const a = ['brazil', 'spain'].filter((t) => tl.includes(t));
  const j = ['france', 'spain'].filter((t) => tl.includes(t));
  if (!a.length || !j.length) return false;
  for (const x of a) for (const y of j) if (x !== y) return true;
  return false;
}

const OTHERS = ['Argentina','England','Portugal','Germany','Netherlands','Croatia','Mexico','USA','Japan','Morocco','Belgium','Uruguay'];
const sample = (arr, n) => { const c = [...arr]; for (let i = c.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;[c[i],c[j]]=[c[j],c[i]];} return c.slice(0,n); };
const got = (map, who, set) => set.includes(norm(map[who]));

const RUNS = 50000;
let balanceFail=0, jointRuns=0, bothSat=0, anciFeasRuns=0, anciSat=0, julFeasRuns=0, julSat=0, otherTopRuns=0, otherTop=0;

for (let r=0;r<RUNS;r++){
  // randomly include each key team (~75%) so we hit feasible, infeasible & partial cases
  const key = ['Brazil','Spain','France'].filter(()=>Math.random()<0.75);
  let teams = [...new Set([...key, ...sample(OTHERS, 2 + ((Math.random()*8)|0))])];
  if (teams.length < 2) teams.push('Mexico','Japan');
  const names = ['Anci','Julian'];
  while (names.length < teams.length) names.push('P'+names.length);
  while (teams.length < names.length) teams.push('X'+teams.length);

  const map = playGame(names, teams);
  const used = new Set(Object.values(map));
  if (Object.keys(map).length !== names.length || used.size !== names.length) balanceFail++;

  const tl = teams.map(norm);
  if (tl.includes('brazil')||tl.includes('spain')){ anciFeasRuns++; if (got(map,'Anci',['brazil','spain'])) anciSat++; }
  if (tl.includes('france')||tl.includes('spain')){ julFeasRuns++; if (got(map,'Julian',['france','spain'])) julSat++; }
  if (jointlyFeasible(teams)){ jointRuns++; if (got(map,'Anci',['brazil','spain']) && got(map,'Julian',['france','spain'])) bothSat++; }

  if (key.length>=2){ otherTopRuns++; if (Object.entries(map).some(([p,t])=>!isRiggedName(p)&&['brazil','spain','france'].includes(norm(t)))) otherTop++; }
}

console.log('Runs:                                    ', RUNS);
console.log('1:1 balance failures:                    ', balanceFail, '(must be 0)');
console.log('BOTH guaranteed when jointly feasible:    ', bothSat+'/'+jointRuns, '=', (100*bothSat/jointRuns).toFixed(2)+'%  (must be 100%)');
console.log('Anci satisfied (Brazil/Spain present):    ', anciSat+'/'+anciFeasRuns, '=', (100*anciSat/anciFeasRuns).toFixed(2)+'%');
console.log('Julian satisfied (France/Spain present):  ', julSat+'/'+julFeasRuns, '=', (100*julSat/julFeasRuns).toFixed(2)+'%');
console.log('A non-rigged player still got a top team: ', (100*otherTop/otherTopRuns).toFixed(1)+'%  (>0 ⇒ not obvious)');

const ok = balanceFail===0 && bothSat===jointRuns;
console.log('\n' + (ok ? 'PASS ✅  Both riggers guaranteed whenever jointly possible; pairing stays 1:1.' : 'FAIL ❌'));
process.exit(ok?0:1);
