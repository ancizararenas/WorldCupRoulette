/* ============================================================
   La Chusma Mundealera 2026 — client
   Flow:  setup (teams) → lobby (players self-join) → play.
   All draw logic is on the server; this file is UI + sound.
   ============================================================ */

/* ── CONFIG ───────────────────────────────────────────────
   Point at your API. Local dev = localhost:3000.
   Override with ?api=https://your-api ... in the URL.        */
const API_BASE = (new URLSearchParams(location.search).get("api")
  || "http://localhost:3000").replace(/\/$/, "");

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const SPIN_MS = REDUCED ? 2200 : 4300;     // must match #wheel-rot transition in CSS

/* Host mode is granted by a ?host=... parameter in the URL. It only changes what
   this device can SEE (team setup + reset). Players open the same link without it. */
const IS_HOST = new URLSearchParams(location.search).has("host");
function playerLink() { const u = new URL(location.href); u.searchParams.delete("host"); return u.toString(); }
async function copyPlayerLink(btn) {
  const link = playerLink(), label = btn.textContent;
  try { await navigator.clipboard.writeText(link); btn.textContent = "Copied!"; setTimeout(() => (btn.textContent = label), 1500); }
  catch { window.prompt("Share this link with players:", link); }
}

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
const norm = (s) => String(s).trim().toLowerCase();

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

/* remember this device's player name across refreshes */
function loadName() { try { return localStorage.getItem("chusma_name") || ""; } catch { return ""; } }
function saveName(n) { try { n ? localStorage.setItem("chusma_name", n) : localStorage.removeItem("chusma_name"); } catch {} }

/* ── UI state ─────────────────────────────────────────────── */
let isSpinning = false, lastStatus = null, wheelSig = "", currentRot = 0;
let lastResultLen = 0, firstRender = true, currentWheelTeams = [], winTimer = null;
let myName = loadName();

/* ════════════════ SOUND ════════════════ */
function updateSoundBtn() {
  const b = $("soundBtn");
  b.classList.toggle("playing", Sound.isOn() && b.dataset.started === "1");
  b.classList.toggle("off", !Sound.isOn());
  b.classList.remove("pulse");
  $("soundLabel").textContent = Sound.isOn() ? "Sound on" : "Muted";
}
let audioUnlocked = false;
function unlockAudio() { if (audioUnlocked) return; audioUnlocked = true; $("soundBtn").dataset.started = "1"; Sound.ensure(); updateSoundBtn(); }
["pointerdown","keydown","touchstart"].forEach((ev) => window.addEventListener(ev, unlockAudio, { passive: true }));
$("soundBtn").addEventListener("click", (e) => { e.stopPropagation(); $("soundBtn").dataset.started = "1"; Sound.toggle(); updateSoundBtn(); });
Sound.onChange(updateSoundBtn);

/* ════════════════ STEP 1 · SETUP (teams) ════════════════ */
function makeTeamRow(team = "") {
  const row = document.createElement("div");
  row.className = "row one";
  row.innerHTML = `<input type="text" class="t" placeholder="Team" value="${escAttr(team)}" />
                   <button class="del" title="Remove">×</button>`;
  row.querySelector(".del").onclick = () => { Sound.click(); row.remove(); };
  return row;
}
function buildRows(n) { const r = $("rows"); r.innerHTML = ""; for (let i = 0; i < n; i++) r.appendChild(makeTeamRow()); }
const collectTeams = () => [...document.querySelectorAll("#rows .t")].map((i) => i.value.trim());

$("buildRows").onclick = () => {
  Sound.click();
  const n = Math.max(2, Math.min(48, parseInt($("numTeams").value, 10) || 2));
  $("numTeams").value = n; buildRows(n);
};
$("addRow").onclick = () => { Sound.click(); $("rows").appendChild(makeTeamRow()); };
$("sampleBtn").onclick = () => {
  Sound.click();
  const teams = ["Brazil", "Spain", "France", "Argentina", "Mexico", "Japan"];
  $("numTeams").value = teams.length; $("rows").innerHTML = "";
  teams.forEach((t) => $("rows").appendChild(makeTeamRow(t)));
};
$("openLobbyBtn").onclick = async () => {
  Sound.click();
  const teams = collectTeams().filter(Boolean), err = $("setupError");
  if (teams.length < 2) return (err.textContent = "Add at least two teams.");
  if (new Set(teams.map((t) => t.toLowerCase())).size !== teams.length)
    return (err.textContent = "Team names must be unique.");
  err.textContent = ""; $("openLobbyBtn").disabled = true;
  try { render(await api("/api/setup", { method: "POST", body: JSON.stringify({ teams }) })); }
  catch (e) { err.textContent = e.message; }
  finally { $("openLobbyBtn").disabled = false; }
};

/* ════════════════ STEP 2 · LOBBY (join) ════════════════ */
async function doJoin() {
  const name = $("joinName").value.trim(), err = $("lobbyError");
  if (!name) return (err.textContent = "Enter a name.");
  err.textContent = "";
  try {
    const state = await api("/api/join", { method: "POST", body: JSON.stringify({ name }) });
    myName = name; saveName(myName); $("joinName").value = "";
    render(state);
  } catch (e) { err.textContent = e.message; }
}
$("joinBtn").onclick = () => { Sound.click(); doJoin(); };
$("joinName").addEventListener("keydown", (e) => { if (e.key === "Enter") { Sound.click(); doJoin(); } });

async function unjoin(name) {
  try { const s = await api("/api/unjoin", { method: "POST", body: JSON.stringify({ name }) });
        if (name === myName) { myName = ""; saveName(""); } render(s); }
  catch (e) { $("lobbyError").textContent = e.message; }
}
$("startBtn").onclick = async () => {
  Sound.click();
  try { render(await api("/api/start", { method: "POST" })); }
  catch (e) { $("lobbyError").textContent = e.message; }
};

/* ════════════════ WHEEL ════════════════ */
const CX = 200, CY = 200, R = 184;
const rim = (deg, radius = R) => { const a = (deg * Math.PI) / 180; return [CX + radius * Math.sin(a), CY - radius * Math.cos(a)]; };

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
function spinWheelTo(teams, idx) {
  const n = teams.length, seg = 360 / n, center = idx * seg + seg / 2;
  const jitter = (Math.random() - 0.5) * seg * 0.7;
  const desired = ((-(center + jitter)) % 360 + 360) % 360;
  const curMod = ((currentRot % 360) + 360) % 360;
  const delta = 5 * 360 + ((desired - curMod + 360) % 360);
  currentRot += delta;
  const g = $("wheel-rot"); void g.getBoundingClientRect();
  g.style.transform = `rotate(${currentRot}deg)`;
  return delta;
}

/* ════════════════ STEP 3 · SPIN ════════════════ */
function selectedSpinner() { return $("spinner") ? $("spinner").value : ""; }
function updateSpinEnabled(done) {
  const ok = lastStatus === "active" && !done && !isSpinning && !!selectedSpinner();
  $("spinBtn").disabled = !ok;
  $("spinner").classList.toggle("armed", !!selectedSpinner());
}
$("spinner") && ($("spinner").onchange = () => { Sound.click(); updateSpinEnabled(false); });

$("spinBtn").onclick = async () => {
  const who = selectedSpinner();
  if (isSpinning || !who) return;
  isSpinning = true;
  $("spinBtn").disabled = true; $("resetBtn").disabled = true; $("spinner").disabled = true;

  let result;
  try { result = await api("/api/spin", { method: "POST", body: JSON.stringify({ player: who }) }); }
  catch (e) {
    isSpinning = false; $("resetBtn").disabled = false; $("spinner").disabled = false;
    $("revealLabel").textContent = e.message;
    try { render(await api("/api/state")); } catch {}
    return;
  }

  const teams = currentWheelTeams;
  const idx = teams.findIndex((t) => t.toLowerCase() === result.team.toLowerCase());
  $("revealLabel").textContent = "Spinning…";
  $("revealPair").textContent = "—";
  $("reveal").classList.add("spinning");
  $("wheelStage").classList.remove("ready"); $("wheelStage").classList.add("spinning");

  Sound.whoosh();
  if (idx >= 0) { const delta = spinWheelTo(teams, idx); Sound.spinTicks(delta, teams.length, SPIN_MS); }

  const finish = () => {
    $("wheelStage").classList.remove("spinning"); $("reveal").classList.remove("spinning");
    isSpinning = false;
    $("spinner").disabled = false;
    announce(result.player, result.team);
    lastResultLen = result.state.results.length;
    render(result.state);
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
  Sound.win(); showWinModal(player, team); burstConfetti(90);
}
function showWinModal(player, team) {
  $("winFlag").textContent = flagFor(team);
  $("winPlayer").textContent = player; $("winTeam").textContent = team;
  $("winModal").classList.remove("hidden");
  clearTimeout(winTimer); winTimer = setTimeout(() => $("winModal").classList.add("hidden"), 2400);
}
$("winModal").addEventListener("click", () => { clearTimeout(winTimer); $("winModal").classList.add("hidden"); });

/* ════════════════ RESET ════════════════ */
async function doReset() {
  Sound.click();
  if (!confirm("Clear everything and start a brand-new game (new teams + players)?")) return;
  try {
    const s = await api("/api/reset", { method: "POST" });
    wheelSig = ""; currentRot = 0; lastResultLen = 0; myName = ""; saveName("");
    render(s);
  } catch (e) { alert(e.message); }
}
$("resetBtn").onclick = doReset;
$("resetBtnLobby").onclick = doReset;
$("copyLinkLobby") && ($("copyLinkLobby").onclick = () => { Sound.click(); copyPlayerLink($("copyLinkLobby")); });
$("copyLinkGame")  && ($("copyLinkGame").onclick  = () => { Sound.click(); copyPlayerLink($("copyLinkGame")); });

/* ════════════════ RENDER ════════════════ */
function show(view) {
  ["setup", "waiting", "lobby", "game"].forEach((v) => $(v).classList.toggle("hidden", v !== view));
}

function render(state) {
  const status = state.status;
  const players = state.players, teams = state.teams, results = state.results;

  if (status === "setup") {
    show(IS_HOST ? "setup" : "waiting");
    if (IS_HOST && lastStatus !== "setup") { buildRows(parseInt($("numTeams").value, 10) || 6); $("setupError").textContent = ""; }
    lastStatus = status; firstRender = false; return;
  }

  if (status === "lobby") {
    show("lobby");
    $("teamCount").textContent = teams.length;
    $("lobbyTeams").innerHTML = teams.map((t) => `<li>${escHtml(t.name)}</li>`).join("");
    $("roster").innerHTML = players.length
      ? players.map((p) => `<li class="${norm(p.name) === norm(myName) ? "you" : ""}">${escHtml(p.name)}<span class="x" data-name="${escAttr(p.name)}">×</span></li>`).join("")
      : `<li class="muted" style="opacity:.6">No one yet…</li>`;
    $("roster").querySelectorAll(".x").forEach((x) => x.onclick = () => { Sound.click(); unjoin(x.dataset.name); });
    $("rosterCount").textContent = `${players.length} / ${teams.length}`;
    const need = teams.length - players.length;
    $("lobbyNote").textContent = need > 0
      ? `Waiting for ${need} more player${need === 1 ? "" : "s"}…`
      : "Roster full — ready to start!";
    $("startBtn").disabled = players.length === 0 || players.length !== teams.length;
    $("joinBtn").disabled = players.length >= teams.length && !players.some((p) => norm(p.name) === norm(myName));
    lastStatus = status; firstRender = false; return;
  }

  // active | complete
  show("game");
  const remainingPlayers = players.filter((p) => !p.used);
  const remainingTeams = teams.filter((t) => !t.used).map((t) => t.name);
  const drawn = results.length, total = players.length;
  const done = status === "complete";

  $("progBar").style.width = total ? (drawn / total) * 100 + "%" : "0%";
  $("progText").textContent = `${drawn} / ${total} drawn`;

  $("remainCount").textContent = remainingPlayers.length;
  $("remainPlayers").innerHTML = players
    .map((p) => `<li class="${p.used ? "gone" : ""}">${escHtml(p.name)}</li>`).join("");

  $("boardBody").innerHTML = results.map((r, i) =>
    `<tr class="${i === drawn - 1 && drawn > lastResultLen ? "fresh" : ""}"><td>${i + 1}</td><td>${escHtml(r.player_name)}</td><td>${escHtml(r.team_name)}</td></tr>`).join("");
  $("emptyBoard").classList.toggle("hidden", drawn > 0);

  if (firstRender) { lastResultLen = drawn; firstRender = false; }
  else if (!isSpinning && drawn > lastResultLen) {
    const last = results[drawn - 1]; announce(last.player_name, last.team_name); lastResultLen = drawn;
  } else if (drawn < lastResultLen) lastResultLen = drawn;

  if (!isSpinning) {
    currentWheelTeams = remainingTeams;
    drawWheel(remainingTeams);

    // "who's spinning" dropdown — preserve selection, else pre-pick this device's name
    const prev = selectedSpinner();
    const names = remainingPlayers.map((p) => p.name);
    let keep = names.find((n) => n === prev) || names.find((n) => norm(n) === norm(myName)) || "";
    $("spinner").innerHTML = `<option value="">Select your name…</option>` +
      names.map((n) => `<option value="${escAttr(n)}" ${n === keep ? "selected" : ""}>${escHtml(n)}</option>`).join("");

    $("spinnerRow").classList.toggle("hidden", done);
    $("spinBtn").classList.toggle("hidden", done);
    updateSpinEnabled(done);
  }

  $("completeMsg").classList.toggle("hidden", !done);
  if (done && lastStatus !== "complete") {
    $("revealLabel").textContent = "Final results"; $("revealPair").textContent = "🏆 Draw complete";
    Sound.complete(); burstConfetti(160);
  }
  lastStatus = status;
}

/* ════════════════ CONFETTI / FLOATERS ════════════════ */
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
    box.appendChild(s); setTimeout(() => s.remove(), 3600);
  }
}
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

document.body.classList.toggle("host", IS_HOST);
buildRows(6);
poll();
setInterval(poll, 2500);
