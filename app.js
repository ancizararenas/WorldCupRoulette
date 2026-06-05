/* ============================================================
   World Cup 2026 Roulette — client (gamified)
   Pure vanilla JS. All draw logic is on the server; this file
   handles UI, animation and sound only.
   ============================================================ */

/* ── CONFIG ───────────────────────────────────────────────
   Point this at your deployed API. Local dev = localhost:3000.
   Override at runtime with ?api=https://your-api ...          */
const API_BASE = (new URLSearchParams(location.search).get("api")
  || "http://localhost:3000").replace(/\/$/, "");

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const SPIN_MS = REDUCED ? 2200 : 4300;     // must match #wheel-rot transition in CSS

/* ── helpers ──────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const PALETTE = ["#1c5c43","#2e8b6b","#0f3a2c","#3aa17e","#185040","#247a5c","#0c2f24","#359f78"];
async function api(path, opts) {
  const res = await fetch(API_BASE + path, { headers: { "Content-Type": "application/json" }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
  return data;
}
const escAttr = (s) => String(s).replace(/"/g, "&quot;");
const escHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c]));

/* country → flag emoji (best-effort; falls back to ⚽) */
const FLAGS = {
  brazil:"🇧🇷", spain:"🇪🇸", france:"🇫🇷", argentina:"🇦🇷", england:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", portugal:"🇵🇹",
  germany:"🇩🇪", netherlands:"🇳🇱", croatia:"🇭🇷", mexico:"🇲🇽", usa:"🇺🇸", "united states":"🇺🇸",
  canada:"🇨🇦", japan:"🇯🇵", morocco:"🇲🇦", belgium:"🇧🇪", uruguay:"🇺🇾", senegal:"🇸🇳",
  italy:"🇮🇹", switzerland:"🇨🇭", denmark:"🇩🇰", "south korea":"🇰🇷", korea:"🇰🇷", colombia:"🇨🇴",
  poland:"🇵🇱", serbia:"🇷🇸", ecuador:"🇪🇨", ghana:"🇬🇭", cameroon:"🇨🇲", australia:"🇦🇺",
  qatar:"🇶🇦", iran:"🇮🇷", "saudi arabia":"🇸🇦", "costa rica":"🇨🇷", tunisia:"🇹🇳", wales:"🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  nigeria:"🇳🇬", egypt:"🇪🇬", chile:"🇨🇱", peru:"🇵🇪", sweden:"🇸🇪", norway:"🇳🇴",
  scotland:"🏴󠁧󠁢󠁳󠁣󠁴󠁿", turkey:"🇹🇷", "ivory coast":"🇨🇮", algeria:"🇩🇿", austria:"🇦🇹", ukraine:"🇺🇦",
};
const flagFor = (t) => FLAGS[String(t).trim().toLowerCase()] || "⚽";

/* ── UI state ─────────────────────────────────────────────── */
let isSpinning = false, lastStatus = null, wheelSig = "", currentRot = 0;
let lastResultLen = 0, firstRender = true, currentWheelTeams = [], winTimer = null;

/* ════════════════ SOUND WIRING ════════════════ */
function updateSoundBtn() {
  const b = $("soundBtn");
  const labelStarted = b.dataset.started === "1";
  b.classList.toggle("playing", Sound.isOn() && labelStarted);
  b.classList.toggle("off", !Sound.isOn());
  b.classList.remove("pulse");
  $("soundLabel").textContent = Sound.isOn() ? "Sound on" : "Muted";
}
let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return; audioUnlocked = true;
  $("soundBtn").dataset.started = "1";
  Sound.ensure();
  updateSoundBtn();
}
["pointerdown", "keydown", "touchstart"].forEach((ev) =>
  window.addEventListener(ev, unlockAudio, { passive: true }));
$("soundBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  $("soundBtn").dataset.started = "1";
  Sound.toggle();
  updateSoundBtn();
});
Sound.onChange(updateSoundBtn);

/* ════════════════ SETUP ════════════════ */
function makeRow(player = "", team = "") {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `
    <input type="text" class="p" placeholder="First name" value="${escAttr(player)}" />
    <input type="text" class="t" placeholder="Team" value="${escAttr(team)}" />
    <button class="del" title="Remove">×</button>`;
  row.querySelector(".del").onclick = () => { Sound.click(); row.remove(); };
  return row;
}
function buildRows(n) { const r = $("rows"); r.innerHTML = ""; for (let i = 0; i < n; i++) r.appendChild(makeRow()); }
function collectEntries() {
  return {
    players: [...document.querySelectorAll("#rows .p")].map((i) => i.value.trim()),
    teams:   [...document.querySelectorAll("#rows .t")].map((i) => i.value.trim()),
  };
}
$("buildRows").onclick = () => {
  Sound.click();
  const n = Math.max(2, Math.min(32, parseInt($("numPlayers").value, 10) || 2));
  $("numPlayers").value = n; buildRows(n);
};
$("addRow").onclick = () => { Sound.click(); $("rows").appendChild(makeRow()); };
$("sampleBtn").onclick = () => {
  Sound.click();
  const players = ["Anci", "Marta", "Diego", "Priya", "Tom", "Yuki"];
  const teams   = ["Brazil", "Spain", "France", "Argentina", "Mexico", "Japan"];
  $("numPlayers").value = players.length; $("rows").innerHTML = "";
  players.forEach((p, i) => $("rows").appendChild(makeRow(p, teams[i])));
};
$("startBtn").onclick = async () => {
  Sound.click();
  const { players, teams } = collectEntries();
  const fp = players.filter(Boolean), ft = teams.filter(Boolean), err = $("setupError");
  if (fp.length < 2) return (err.textContent = "Add at least two players.");
  if (fp.length !== ft.length)
    return (err.textContent = `Players (${fp.length}) and teams (${ft.length}) must match — fill every field.`);
  if (new Set(ft.map((t) => t.toLowerCase())).size !== ft.length)
    return (err.textContent = "Team names must be unique.");
  err.textContent = ""; $("startBtn").disabled = true;
  try { render(await api("/api/setup", { method: "POST", body: JSON.stringify({ players: fp, teams: ft }) })); }
  catch (e) { err.textContent = e.message; }
  finally { $("startBtn").disabled = false; }
};

/* ════════════════ WHEEL ════════════════ */
const CX = 200, CY = 200, R = 184;
function rim(deg, radius = R) { const a = (deg * Math.PI) / 180; return [CX + radius * Math.sin(a), CY - radius * Math.cos(a)]; }

function drawWheel(teams) {
  const sig = teams.join("|");
  if (sig === wheelSig) return;
  wheelSig = sig;
  const n = teams.length, seg = 360 / n;
  let paths = "";
  for (let i = 0; i < n; i++) {
    const a0 = i * seg, a1 = (i + 1) * seg, [x0, y0] = rim(a0), [x1, y1] = rim(a1);
    const large = a1 - a0 > 180 ? 1 : 0, fill = PALETTE[i % PALETTE.length];
    paths += `<path d="M${CX} ${CY} L${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z" fill="${fill}" stroke="#06140f" stroke-width="2"></path>`;
    const mid = a0 + seg / 2, [lx, ly] = rim(mid, R * 0.62);
    let rot = mid; if (mid > 90 && mid < 270) rot += 180;
    const label = teams[i].length > 11 ? teams[i].slice(0, 10) + "…" : teams[i];
    paths += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="#eafff5" font-family="Sora, sans-serif" font-size="${n > 14 ? 11 : 14}" font-weight="700" text-anchor="middle" dominant-baseline="middle" transform="rotate(${rot.toFixed(1)} ${lx.toFixed(1)} ${ly.toFixed(1)})">${escHtml(label)}</text>`;
  }
  $("wheel").innerHTML = `
    <defs><radialGradient id="hub" cx="50%" cy="42%" r="60%">
      <stop offset="0%" stop-color="#fff"/><stop offset="55%" stop-color="#ffd86b"/><stop offset="100%" stop-color="#ff9b1e"/>
    </radialGradient></defs>
    <circle cx="${CX}" cy="${CY}" r="${R + 8}" fill="none" stroke="#c8ff2e" stroke-opacity=".25" stroke-width="3"/>
    <g id="wheel-rot" style="transform:rotate(${currentRot}deg);">${paths}</g>
    <circle cx="${CX}" cy="${CY}" r="34" fill="url(#hub)" stroke="#06140f" stroke-width="3"/>
    <text x="${CX}" y="${CY + 6}" text-anchor="middle" font-family="Anton, sans-serif" font-size="20" fill="#2a1500">26</text>`;
}

// returns the total rotation delta applied (degrees)
function spinWheelTo(teams, idx) {
  const n = teams.length, seg = 360 / n, center = idx * seg + seg / 2;
  const jitter = (Math.random() - 0.5) * seg * 0.7;
  const desired = ((-(center + jitter)) % 360 + 360) % 360;
  const curMod = ((currentRot % 360) + 360) % 360;
  const forward = (desired - curMod + 360) % 360;
  const delta = 5 * 360 + forward;
  currentRot += delta;
  const g = $("wheel-rot");
  void g.getBoundingClientRect();
  g.style.transform = `rotate(${currentRot}deg)`;
  return delta;
}

/* ════════════════ SPIN ════════════════ */
$("spinBtn").onclick = async () => {
  if (isSpinning) return;
  isSpinning = true;
  $("spinBtn").disabled = true; $("resetBtn").disabled = true;

  let result;
  try { result = await api("/api/spin", { method: "POST" }); }
  catch (e) {
    isSpinning = false; $("spinBtn").disabled = false; $("resetBtn").disabled = false;
    $("revealLabel").textContent = e.message; return;
  }

  const teams = currentWheelTeams;
  const idx = teams.findIndex((t) => t.toLowerCase() === result.team.toLowerCase());
  $("revealLabel").textContent = "Spinning…";
  $("revealPair").textContent = "—";
  $("reveal").classList.add("spinning");
  $("wheelStage").classList.remove("ready");
  $("wheelStage").classList.add("spinning");

  Sound.whoosh();
  if (idx >= 0) { const delta = spinWheelTo(teams, idx); Sound.spinTicks(delta, teams.length, SPIN_MS); }

  const finish = () => {
    $("wheelStage").classList.remove("spinning");
    $("reveal").classList.remove("spinning");
    isSpinning = false;                 // clear BEFORE render so it re-enables the button + rebuilds the wheel
    announce(result.player, result.team);
    lastResultLen = result.state.results.length;
    render(result.state);
    $("spinBtn").disabled = result.state.status === "complete";
    $("resetBtn").disabled = false;
  };
  const g = $("wheel-rot");
  g.addEventListener("transitionend", finish, { once: true });
  setTimeout(() => { if (isSpinning) finish(); }, SPIN_MS + 500);
};

function announce(player, team) {
  const rev = $("reveal");
  $("revealLabel").textContent = "Drawn!";
  $("revealPair").textContent = `${player}  →  ${team}`;
  rev.classList.remove("flash"); void rev.offsetWidth; rev.classList.add("flash");
  Sound.win();
  showWinModal(player, team);
  burstConfetti(90);
}

function showWinModal(player, team) {
  $("winFlag").textContent = flagFor(team);
  $("winPlayer").textContent = player;
  $("winTeam").textContent = team;
  const m = $("winModal");
  m.classList.remove("hidden");
  clearTimeout(winTimer);
  winTimer = setTimeout(() => m.classList.add("hidden"), 2400);
}
$("winModal").addEventListener("click", () => { clearTimeout(winTimer); $("winModal").classList.add("hidden"); });

/* ════════════════ RESET ════════════════ */
$("resetBtn").onclick = async () => {
  Sound.click();
  if (!confirm("Clear the current draw and set up a new one?")) return;
  try { const s = await api("/api/reset", { method: "POST" }); wheelSig = ""; currentRot = 0; lastResultLen = 0; render(s); }
  catch (e) { alert(e.message); }
};

/* ════════════════ RENDER ════════════════ */
function render(state) {
  const status = state.status;

  if (status === "setup") {
    $("game").classList.add("hidden"); $("setup").classList.remove("hidden");
    if (lastStatus !== "setup") { buildRows(parseInt($("numPlayers").value, 10) || 4); $("setupError").textContent = ""; }
    lastStatus = status; firstRender = false; return;
  }

  $("setup").classList.add("hidden"); $("game").classList.remove("hidden");

  const total = state.players.length;
  const remainingPlayers = state.players.filter((p) => !p.used);
  const remainingTeams = state.teams.filter((t) => !t.used).map((t) => t.name);
  const drawn = state.results.length;

  // progress
  $("progBar").style.width = total ? (drawn / total) * 100 + "%" : "0%";
  $("progText").textContent = `${drawn} / ${total} drawn`;

  // remaining players
  $("remainCount").textContent = remainingPlayers.length;
  $("remainPlayers").innerHTML = state.players
    .map((p) => `<li class="${p.used ? "gone" : ""}">${escHtml(p.name)}</li>`).join("");

  // leaderboard
  $("boardBody").innerHTML = state.results.map((r, i) =>
    `<tr class="${i === drawn - 1 && drawn > lastResultLen ? "fresh" : ""}"><td>${i + 1}</td><td>${escHtml(r.player_name)}</td><td>${escHtml(r.team_name)}</td></tr>`).join("");
  $("emptyBoard").classList.toggle("hidden", drawn > 0);

  // first load: sync counter without firing a celebration
  if (firstRender) { lastResultLen = drawn; firstRender = false; }
  else if (!isSpinning && drawn > lastResultLen) {           // someone else spun
    const last = state.results[drawn - 1];
    announce(last.player_name, last.team_name);
    lastResultLen = drawn;
  } else if (drawn < lastResultLen) lastResultLen = drawn;

  // wheel
  if (!isSpinning) { currentWheelTeams = remainingTeams; drawWheel(remainingTeams); }

  // controls / states
  const done = status === "complete";
  $("spinBtn").classList.toggle("hidden", done);
  $("completeMsg").classList.toggle("hidden", !done);
  if (!isSpinning) {
    $("spinBtn").disabled = done || remainingTeams.length === 0;
    $("wheelStage").classList.toggle("ready", !done && remainingTeams.length > 0);
  }
  if (done && lastStatus !== "complete") {
    $("revealLabel").textContent = "Final results";
    $("revealPair").textContent = "🏆 Draw complete";
    Sound.complete(); burstConfetti(160);
  }
  lastStatus = status;
}

/* ════════════════ CONFETTI ════════════════ */
function burstConfetti(count = 80) {
  if (REDUCED) count = Math.min(count, 24);
  const box = $("confetti"), colors = ["#c8ff2e","#ffc233","#ff5d73","#ffffff","#36e0c8"];
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.style.left = Math.random() * 100 + "vw";
    s.style.background = colors[(Math.random() * colors.length) | 0];
    s.style.animationDuration = 1.8 + Math.random() * 1.6 + "s";
    s.style.animationDelay = Math.random() * 0.3 + "s";
    s.style.transform = `rotate(${Math.random() * 360}deg)`;
    box.appendChild(s);
    setTimeout(() => s.remove(), 3600);
  }
}

/* ════════════════ BACKGROUND FLOATERS ════════════════ */
(function floaters() {
  const box = $("floaters"), icons = ["⚽","🏆","🥅","🎉","⚽"];
  for (let i = 0; i < 9; i++) {
    const s = document.createElement("span");
    s.textContent = icons[(Math.random() * icons.length) | 0];
    s.style.left = Math.random() * 100 + "vw";
    s.style.fontSize = 18 + Math.random() * 26 + "px";
    s.style.animationDuration = 14 + Math.random() * 16 + "s";
    s.style.animationDelay = -Math.random() * 20 + "s";
    box.appendChild(s);
  }
})();

/* ════════════════ POLLING ════════════════ */
async function poll() {
  try { const s = await api("/api/state"); setConn("live"); if (!isSpinning) render(s); }
  catch { setConn("down"); }
}
function setConn(mode) {
  $("conn").className = "conn " + (mode === "live" ? "live" : mode === "down" ? "down" : "");
  $("connText").textContent = mode === "live" ? "live · synced" : mode === "down" ? "API offline" : "connecting…";
}

buildRows(4);
poll();
setInterval(poll, 2500);
