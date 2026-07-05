// ── Riff: application logic ──────────────────────────────────────────────────

const PREP_SEC = 30;
const SPEAK_SEC = 60;
const STORE_KEY = "1minconvo";
const API_KEY_STORE = "1minconvo-key";
const ROW_H = 68; // reel row height, kept in sync with styles.css
const REEL_REPS = 10;

const $ = (id) => document.getElementById(id);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const hoverFine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

// GSAP powers the premium motion; every use is guarded so the app is fully
// functional (just calmer) if the library fails to load or motion is reduced.
function gsapReady() { return !reducedMotion && typeof window.gsap !== "undefined"; }

function initMotion() {
  if (!gsapReady()) return;
  gsap.to(".amb-1", { xPercent: 14, yPercent: 10, scale: 1.08, duration: 22, ease: "sine.inOut", repeat: -1, yoyo: true });
  gsap.to(".amb-2", { xPercent: -12, yPercent: -8, scale: 0.94, duration: 27, ease: "sine.inOut", repeat: -1, yoyo: true });
  gsap.from("#screen-home .hero, #screen-home .setup-card, #screen-home .home-cta, #screen-home .week-goal, #screen-home .home-stats",
    { autoAlpha: 0, y: 16, duration: 0.5, stagger: 0.06, ease: "power3.out" });
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── State ─────────────────────────────────────────────────────────────────
const state = {
  lang: LANGS[0],
  diff: "easy",
  topics: [],
  topicIdx: -1,
  drawOrder: [],
  drawPos: 0,
  reelOrder: [],
  reelRow: 0,
  spinning: false,
  transcript: "",
  interim: "",
  activity: [],
  speakStartTs: 0,
  speakElapsed: 0,
  noAnalysis: false,
};

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

// ── Sound (synthesised via Web Audio, no audio files) ───────────────────────
let sfxCtx = null;
function sfx() {
  if (!sfxCtx) {
    try { sfxCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
  }
  if (sfxCtx.state === "suspended") sfxCtx.resume().catch(() => {});
  return sfxCtx;
}
function tone(ctx, t, freq, dur, vol, type, glideTo) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type || "sine";
  osc.frequency.setValueAtTime(freq, t);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}
function playReelSound(rows, durSec) {
  if (reducedMotion) return;
  const ctx = sfx();
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.03;
  // ticks are frequent at the start and thin out with the ease-out deceleration:
  // the k-th tick time is the inverse of ease-out-cubic, t = T·(1 − ³√(1 − p))
  const ticks = Math.min(26, Math.floor(rows / 3));
  for (let k = 1; k <= ticks; k++) {
    const p = k / ticks;
    tone(ctx, t0 + (1 - Math.cbrt(1 - p)) * durSec, 1900, 0.03, 0.02, "triangle");
  }
  tone(ctx, t0 + durSec, 300, 0.22, 0.08, "sine", 140); // soft landing thud
}
function playTick() {
  if (reducedMotion) return;
  const ctx = sfx();
  if (ctx) tone(ctx, ctx.currentTime + 0.01, 1000, 0.05, 0.03, "sine");
}
function playStart() {
  const ctx = sfx();
  if (ctx) tone(ctx, ctx.currentTime + 0.01, 520, 0.16, 0.05, "sine", 780);
}
function playChime() {
  const ctx = sfx();
  if (!ctx) return;
  const t = ctx.currentTime + 0.02;
  tone(ctx, t, 660, 0.16, 0.05, "sine");
  tone(ctx, t + 0.14, 880, 0.28, 0.05, "sine");
}

// ── Storage ─────────────────────────────────────────────────────────────────
function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* corrupt data — start fresh */ }
  return { sessions: [], streak: 0, lastDay: null, badges: [], weeklyGoal: 5 };
}
function saveStore() { localStorage.setItem(STORE_KEY, JSON.stringify(store)); }
let store = loadStore();
if (!store.weeklyGoal) store.weeklyGoal = 5;

function getApiKey() { return localStorage.getItem(API_KEY_STORE) || ""; }

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function updateStreak() {
  const today = todayStr();
  if (store.lastDay === today) return;
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
  store.streak = store.lastDay === yesterday ? store.streak + 1 : 1;
  store.lastDay = today;
}

// ── Streak flame (green face; grumpy until you practise today) ──────────────
function renderStreak() {
  const done = store.lastDay === todayStr();
  const pill = $("streakPill");
  pill.classList.toggle("done", done);
  pill.classList.toggle("sad", !done);
  $("streakNum").textContent = store.streak;
  $("streakWord").textContent = store.streak === 1 ? "day" : "days";
  pill.title = done
    ? `${store.streak}-day streak · practised today`
    : "You haven't spoken today yet — keep the streak alive";
}

// ── Weekly goal ─────────────────────────────────────────────────────────────
const WEEK_LEN = 2 * Math.PI * 18;
function weekStart() {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - dow);
  return d.getTime();
}
function sessionsThisWeek() {
  const start = weekStart();
  return store.sessions.filter((s) => new Date(s.date).getTime() >= start).length;
}
function renderWeek() {
  const done = sessionsThisWeek();
  const goal = store.weeklyGoal;
  $("weekCount").textContent = done;
  $("weekGoalNum").textContent = goal;
  const frac = Math.max(0, Math.min(1, done / goal));
  const fill = $("weekFill");
  fill.style.strokeDasharray = WEEK_LEN;
  fill.style.strokeDashoffset = WEEK_LEN * (1 - frac);
}
$("weekGoal").onclick = () => {
  store.weeklyGoal = store.weeklyGoal >= 7 ? 3 : store.weeklyGoal + 2; // 3 → 5 → 7 → 3
  saveStore();
  renderWeek();
};

// ── Screen navigation ───────────────────────────────────────────────────────
const SCREENS = ["home", "reel", "prep", "speak", "result", "history"];
function show(name) {
  SCREENS.forEach((s) => $("screen-" + s).classList.toggle("active", s === name));
  window.scrollTo({ top: 0, behavior: "instant" });
}

// ── Home screen ─────────────────────────────────────────────────────────────
function renderHome() {
  const row = $("langRow");
  row.innerHTML = "";
  LANGS.forEach((l) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.setAttribute("aria-pressed", String(l.key === state.lang.key));
    b.innerHTML = `<span class="chip-code">${l.short}</span>${l.name}`;
    b.onclick = () => { state.lang = l; renderHome(); };
    if (gsapReady() && hoverFine) {
      const code = b.querySelector(".chip-code");
      b.addEventListener("pointerenter", () => {
        gsap.to(b, { y: -4, duration: 0.28, ease: "back.out(2.2)" });
        gsap.fromTo(code, { rotate: -6 }, { rotate: 6, yoyo: true, repeat: 1, duration: 0.16, ease: "power2.inOut", transformOrigin: "center" });
      });
      b.addEventListener("pointerleave", () => gsap.to(b, { y: 0, duration: 0.3, ease: "power2.out" }));
    }
    row.appendChild(b);
  });

  const grid = $("diffGrid");
  grid.innerHTML = "";
  DIFFS.forEach((d) => {
    const b = document.createElement("button");
    b.className = "diff-card";
    b.type = "button";
    b.setAttribute("aria-pressed", String(d.id === state.diff));
    b.innerHTML = `<span class="diff-name">${d.label}</span><span class="diff-cefr">${d.cefr}</span><div class="diff-desc">${d.desc}</div>`;
    b.onclick = () => { state.diff = d.id; renderHome(); };
    grid.appendChild(b);
  });

  renderStreak();
  renderWeek();
  renderKeyStatus();

  const n = store.sessions.length;
  const scored = store.sessions.filter((s) => typeof s.score === "number");
  const best = scored.length ? Math.max(...scored.map((s) => s.score)) : "—";
  $("homeStats").innerHTML = n
    ? `<div><b>${n}</b>talks</div><div><b>${best}</b>best score</div><div><b>${store.badges.length}/${BADGES.length}</b>badges</div>`
    : "";

  const notice = $("srNotice");
  if (!SR) {
    notice.textContent = "Your browser doesn't support speech recognition — analysis won't be available. Open the site in Chrome or Edge to get a score. You can still practise with the timer here.";
    notice.classList.remove("hidden");
  } else {
    notice.classList.add("hidden");
  }
}

function renderKeyStatus() {
  const has = !!getApiKey();
  $("aiStatus").textContent = has ? "Key saved — deep analysis is on." : "";
  $("btnSaveKey").textContent = has ? "Remove key" : "Save";
  $("apiKeyInput").placeholder = has ? "sk-ant-… (saved)" : "sk-ant-…";
}

$("btnSaveKey").onclick = () => {
  if (getApiKey()) {
    localStorage.removeItem(API_KEY_STORE);
    $("apiKeyInput").value = "";
  } else {
    const v = $("apiKeyInput").value.trim();
    if (!v) { $("aiStatus").textContent = "Paste your key in the field above."; return; }
    localStorage.setItem(API_KEY_STORE, v);
    $("apiKeyInput").value = "";
  }
  renderKeyStatus();
};

// ── Topic reel ──────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function setStripY(row, animate) {
  const strip = $("reelStrip");
  if (!animate) strip.style.transition = "none";
  strip.style.transform = `translateY(${ROW_H - row * ROW_H}px)`;
  if (!animate) {
    strip.getBoundingClientRect(); // commit position before restoring transition
    strip.style.transition = "";
  }
}

let spinSeq = 0; // invalidates deferred timers from earlier spins

function buildReel() {
  spinSeq++;
  state.topics = TOPICS[state.diff];
  state.drawOrder = shuffle(state.topics.map((_, i) => i));
  state.drawPos = 0;
  state.topicIdx = -1;
  state.spinning = false;
  state.reelOrder = shuffle(state.topics.map((_, i) => i));

  const strip = $("reelStrip");
  strip.innerHTML = "";
  strip.classList.remove("spinning");
  const n = state.reelOrder.length;
  for (let r = 0; r < n * REEL_REPS; r++) {
    const div = document.createElement("div");
    div.className = "reel-row";
    div.textContent = state.topics[state.reelOrder[r % n]].t[state.lang.key];
    strip.appendChild(div);
  }

  state.reelRow = n; // start in the second repeat so there's room to spin
  setStripY(state.reelRow, false);

  const diff = DIFFS.find((d) => d.id === state.diff);
  $("reelSub").textContent = `${state.lang.name} · ${diff.label} (${diff.cefr})`;
  $("spinActions").classList.remove("hidden");
  $("spunActions").classList.add("hidden");
}

function spinReel() {
  if (state.spinning) return;
  state.spinning = true;
  const seq = ++spinSeq;
  $("spinActions").classList.add("hidden");
  $("spunActions").classList.add("hidden");

  const n = state.reelOrder.length;
  const strip = $("reelStrip");
  strip.querySelectorAll(".reel-row.active").forEach((el) => el.classList.remove("active"));

  // draw the next topic without repeats; reshuffle once all are used
  if (state.drawPos >= state.drawOrder.length) {
    state.drawOrder = shuffle(state.drawOrder);
    state.drawPos = 0;
  }
  const targetIdx = state.drawOrder[state.drawPos++];
  const targetSlot = state.reelOrder.indexOf(targetIdx);

  // normalise into the second-repeat zone so the strip never runs out
  state.reelRow = (state.reelRow % n) + n;
  setStripY(state.reelRow, false);

  const advance = ((targetSlot - (state.reelRow % n)) + n) % n + n * (3 + Math.floor(Math.random() * 2));
  state.reelRow += advance;

  const landedRow = state.reelRow;
  const finish = () => {
    if (seq !== spinSeq) return; // reel rebuilt or a new spin started
    strip.classList.remove("spinning");
    state.topicIdx = targetIdx;
    if (strip.children[landedRow]) strip.children[landedRow].classList.add("active");
    const win = $("screen-reel").querySelector(".reel-window");
    win.classList.remove("landed");
    void win.offsetWidth; // restart the window pulse
    win.classList.add("landed");
    if (navigator.vibrate) navigator.vibrate(10);
    $("spunActions").classList.remove("hidden");
    state.spinning = false;
  };

  if (reducedMotion) {
    setStripY(state.reelRow, false);
    finish();
    return;
  }

  playReelSound(advance, 3.0);
  strip.classList.add("spinning");
  requestAnimationFrame(() => setStripY(state.reelRow, true));
  setTimeout(() => { if (seq === spinSeq) strip.classList.remove("spinning"); }, 2300);
  setTimeout(finish, 3050);
}

// ── Timer ring ───────────────────────────────────────────────────────────────
const RING_LEN = 2 * Math.PI * 94;
function setRing(el, frac) {
  el.style.strokeDasharray = RING_LEN;
  el.style.strokeDashoffset = RING_LEN * (1 - frac);
  el.classList.toggle("warn", frac <= 0.35 && frac > 0.15);
  el.classList.toggle("crit", frac <= 0.15);
}

let timerRaf = null;
function runTimer(totalSec, ringEl, numEl, onDone, onTick) {
  const start = performance.now();
  let lastSec = Math.ceil(totalSec);
  cancelAnimationFrame(timerRaf);
  function tick(now) {
    const elapsed = (now - start) / 1000;
    const left = Math.max(0, totalSec - elapsed);
    const cur = Math.ceil(left);
    numEl.textContent = cur;
    setRing(ringEl, left / totalSec);
    if (cur !== lastSec) { lastSec = cur; if (onTick) onTick(cur); }
    if (left <= 0) { onDone(); return; }
    timerRaf = requestAnimationFrame(tick);
  }
  timerRaf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(timerRaf);
}
let stopTimer = null;

// ── Prep ─────────────────────────────────────────────────────────────────────
function startPrep() {
  if (state.spinning || state.topicIdx < 0) return;
  const topic = state.topics[state.topicIdx];
  $("prepTopic").textContent = topic.t[state.lang.key];
  const hints = $("hintsList");
  hints.innerHTML = "";
  topic.h[state.lang.key].forEach((h) => {
    const li = document.createElement("li");
    li.textContent = h;
    hints.appendChild(li);
  });
  show("prep");
  setRing($("prepRing"), 1);
  $("prepNum").textContent = PREP_SEC;
  stopTimer = runTimer(PREP_SEC, $("prepRing"), $("prepNum"), startSpeaking, (s) => {
    if (s <= 3 && s > 0) playTick();
  });
}

// ── Speaking: recognition + mic ──────────────────────────────────────────────
let recognition = null;
let recActive = false;
let audioCtx = null, analyser = null, micStream = null, volRaf = null;

async function setupMic() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    return true;
  } catch (e) {
    return false;
  }
}

function watchVolume() {
  const data = new Uint8Array(analyser.fftSize);
  const glow = $("micGlow");
  function loop() {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    if (rms > 0.025) state.activity.push(performance.now());
    const level = Math.min(1, rms * 7);
    glow.style.opacity = 0.25 + level * 0.75;
    glow.style.transform = `scale(${0.85 + level * 0.5})`;
    volRaf = requestAnimationFrame(loop);
  }
  volRaf = requestAnimationFrame(loop);
}

function startRecognition() {
  if (!SR) return;
  recognition = new SR();
  recognition.lang = state.lang.code;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onresult = (e) => {
    state.activity.push(performance.now());
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) state.transcript += r[0].transcript + " ";
      else interim += r[0].transcript;
    }
    state.interim = interim;
    const shown = (state.transcript + interim).trim();
    $("liveLine").textContent = shown ? "…" + shown.slice(-90) : "Speak — I'm listening…";
  };
  recognition.onend = () => { if (recActive) { try { recognition.start(); } catch (e) {} } };
  recognition.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      recActive = false;
      state.noAnalysis = true;
      $("liveLine").textContent = "Microphone unavailable — practising without analysis.";
    }
  };
  recActive = true;
  try { recognition.start(); } catch (e) {}
}

function stopRecognition() {
  recActive = false;
  if (recognition) { try { recognition.stop(); } catch (e) {} recognition = null; }
  cancelAnimationFrame(volRaf);
  if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
  if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
}

async function startSpeaking() {
  if (stopTimer) stopTimer();
  playStart();
  const topic = state.topics[state.topicIdx];
  $("speakTopic").textContent = topic.t[state.lang.key];
  $("liveLine").textContent = "Speak — I'm listening…";
  show("speak");

  state.transcript = "";
  state.interim = "";
  state.activity = [];
  state.noAnalysis = !SR;

  const micOk = await setupMic();
  if (micOk) watchVolume();
  if (SR && micOk) startRecognition();
  else if (SR && !micOk) { state.noAnalysis = true; $("liveLine").textContent = "Microphone unavailable — practising without analysis."; }

  state.speakStartTs = performance.now();
  setRing($("speakRing"), 1);
  $("speakNum").textContent = SPEAK_SEC;
  stopTimer = runTimer(SPEAK_SEC, $("speakRing"), $("speakNum"), finishSpeaking, (s) => {
    if (s <= 5 && s > 0) playTick();
  });
}

function finishSpeaking() {
  if (stopTimer) stopTimer();
  state.speakElapsed = Math.min(SPEAK_SEC, (performance.now() - state.speakStartTs) / 1000);
  stopRecognition();
  playChime();
  // give recognition a moment to flush final results
  setTimeout(showResults, 600);
}

// ── Local analysis ────────────────────────────────────────────────────────────
function tokenize(text) {
  return text.toLowerCase().replace(/[.,!?;:()"«»„"]/g, " ").split(/\s+/).filter(Boolean);
}

function countPhrases(text, phrases) {
  const norm = " " + text.toLowerCase().replace(/[.,!?;:()"«»„"]/g, " ").replace(/\s+/g, " ") + " ";
  const found = {};
  let total = 0;
  phrases.forEach((p) => {
    let idx = 0, c = 0;
    const needle = " " + p + " ";
    while ((idx = norm.indexOf(needle, idx)) !== -1) { c++; idx += needle.length - 1; }
    if (c > 0) { found[p] = c; total += c; }
  });
  return { total, found };
}

function analyze() {
  const langKey = state.lang.key;
  const text = state.transcript.trim();
  const words = tokenize(text);
  const wordCount = words.length;
  const unique = new Set(words).size;
  const ttr = wordCount ? unique / wordCount : 0;
  const duration = Math.max(10, state.speakElapsed);
  const wpm = Math.round(wordCount / (duration / 60));

  const fillers = countPhrases(text, FILLERS[langKey]);
  const connectors = countPhrases(text, CONNECTORS[langKey]);
  const fillersPer100 = wordCount ? (fillers.total / wordCount) * 100 : 0;

  // pauses: gaps > 2.5s between activity markers
  let longPauses = 0, speakingCoverage = 1;
  if (state.activity.length > 1) {
    const start = state.speakStartTs;
    const end = start + duration * 1000;
    const pts = [start, ...state.activity.filter((t) => t <= end), end];
    let silent = 0;
    for (let i = 1; i < pts.length; i++) {
      const gap = pts[i] - pts[i - 1];
      if (gap > 2500) { longPauses++; silent += gap - 800; }
    }
    speakingCoverage = Math.max(0, Math.min(1, 1 - silent / (duration * 1000)));
  } else if (!wordCount) {
    speakingCoverage = 0;
  }

  const sFluency = Math.min(30, (wordCount / 120) * 30);
  const sLexis = Math.min(20, ttr * 25 * Math.min(1, wordCount / 60));
  const cConn = connectors.total;
  const sCoherence = cConn >= 4 ? 15 : [0, 6, 10, 13][cConn];
  const sDelivery = Math.max(0, Math.min(20, speakingCoverage * 20 - longPauses * 1.5));
  const sClean = fillersPer100 === 0 && wordCount > 20 ? 15
    : fillersPer100 <= 3 ? 12 : fillersPer100 <= 6 ? 8 : fillersPer100 <= 10 ? 4 : 1;
  const score = Math.round(sFluency + sLexis + sCoherence + sDelivery + (wordCount ? sClean : 0));

  let cefr =
    score < 22 ? "A1" : score < 38 ? "A2" : score < 52 ? "B1" :
    score < 66 ? "B2" : score < 80 ? "C1" : "C2";
  const capOrder = ["A1", "A2", "B1", "B2", "C1", "C2"];
  let cap = "C2";
  if (wordCount < 25) cap = "A1";
  else if (wordCount < 45) cap = "A2";
  else if (wordCount < 70) cap = "B1";
  else if (wordCount < 90) cap = "B2";
  if (capOrder.indexOf(cefr) > capOrder.indexOf(cap)) cefr = cap;

  return {
    wordCount, unique, ttr, wpm, duration,
    fillers, connectors, fillersPer100, longPauses, speakingCoverage,
    parts: { sFluency, sLexis, sCoherence, sDelivery, sClean: wordCount ? sClean : 0 },
    score, cefr,
  };
}

function buildTips(a) {
  const tips = [];
  const langKey = state.lang.key;
  if (state.noAnalysis) {
    tips.push("Your minute of practice counts. To get analysis and a score, open the site in Chrome or Edge and allow microphone access.");
    return tips;
  }
  if (a.wordCount === 0) {
    tips.push("I didn't hear a single word. Check your microphone and try speaking louder and closer to it.");
    return tips;
  }
  if (a.wordCount < 60) tips.push(`You said ${a.wordCount} words in ${Math.round(a.duration)}s. Aim for 90–120 words per minute of talk. Don't fear simple sentences — the key is to keep going.`);
  if (a.fillers.total > 0) {
    const list = Object.entries(a.fillers.found).map(([w, c]) => `“${w}” ×${c}`).join(", ");
    tips.push(`Filler words (${a.fillers.total}): ${list}. Try a short pause instead — it sounds more confident.`);
  }
  if (a.connectors.total < 2) tips.push(`Add links between your ideas (e.g. ${CONNECTORS[langKey].slice(0, 3).map((c) => `“${c}”`).join(", ")}). They instantly make your speech more structured.`);
  if (a.longPauses > 1) tips.push(`There were ${a.longPauses} long pauses (over 2.5s). If you lose your train of thought, rephrase your last sentence — it keeps the pace.`);
  if (a.ttr < 0.5 && a.wordCount >= 40) tips.push(`Only ${Math.round(a.ttr * 100)}% of your words were unique — lots of repetition. Try synonyms for the words you repeat most.`);
  if (a.wpm > 170) tips.push(`Your pace was ${a.wpm} words/min — very fast. Slow down: clarity beats speed.`);
  if (tips.length === 0) tips.push("Great talk. Try a harder difficulty or a new language to keep growing.");
  return tips;
}

function highlightTranscript(text, fillerPhrases) {
  if (!text) return "";
  let safe = escapeHtml(text);
  const sorted = fillerPhrases.slice().sort((x, y) => y.length - x.length);
  sorted.forEach((p) => {
    const esc = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    safe = safe.replace(new RegExp(`(^|[\\s.,!?;:])(${esc})(?=$|[\\s.,!?;:])`, "gi"), "$1<mark>$2</mark>");
  });
  return safe;
}

// ── Claude analysis ───────────────────────────────────────────────────────────
const AI_SCHEMA = {
  type: "object",
  properties: {
    cefr: { type: "string", enum: ["A1", "A2", "B1", "B2", "C1", "C2"] },
    summary: { type: "string", description: "Summary of the talk, 2-3 sentences" },
    errors: {
      type: "array",
      description: "Up to 6 concrete language mistakes from the transcript",
      items: {
        type: "object",
        properties: {
          quote: { type: "string", description: "Exact quote containing the mistake" },
          fix: { type: "string", description: "Corrected version" },
          note: { type: "string", description: "Short explanation" },
        },
        required: ["quote", "fix", "note"],
        additionalProperties: false,
      },
    },
    upgrades: {
      type: "array",
      description: "2-3 places that could be said more naturally or richly",
      items: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
        },
        required: ["from", "to"],
        additionalProperties: false,
      },
    },
  },
  required: ["cefr", "summary", "errors", "upgrades"],
  additionalProperties: false,
};

async function runAiAnalysis(a, topic) {
  const card = $("aiCard");
  card.classList.remove("hidden");
  $("aiBody").innerHTML = `<p class="ai-loading">Claude is analysing your talk</p>`;

  const prompt =
    `Language of the talk: ${state.lang.name} (${state.lang.code}). Topic: “${topic.t[state.lang.key]}”. ` +
    `Duration: ${Math.round(a.duration)}s, ${a.wordCount} words.\n\n` +
    `Transcript of the talk:\n"""\n${state.transcript.trim()}\n"""\n\n` +
    `Estimate the CEFR level of this spoken talk, find up to 6 concrete language mistakes ` +
    `(exact quote, correction, short explanation), suggest 2-3 more natural or richer phrasings, ` +
    `and give a short summary (2-3 sentences): what went well and what to train next.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": getApiKey(),
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 6000,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium", format: { type: "json_schema", schema: AI_SCHEMA } },
        system:
          "You are an experienced CEFR examiner and a friendly language coach. Rate honestly and specifically. Write every explanation in English. " +
          "The transcript comes from automatic speech recognition: there is no punctuation or capitalisation — do NOT comment on those. " +
          "Odd or illogical words may be recognition errors rather than the speaker's — treat them cautiously and don't count them as mistakes unless you're sure.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      const msg = err && err.error && err.error.message ? err.error.message : `HTTP ${res.status}`;
      if (res.status === 401) throw new Error("key was rejected. Check it on the home screen.");
      if (res.status === 429) throw new Error("too many requests — try again in a minute.");
      throw new Error(msg);
    }

    const msg = await res.json();
    if (msg.stop_reason === "refusal") throw new Error("Claude declined this request.");
    const textBlock = msg.content.find((b) => b.type === "text");
    if (!textBlock) throw new Error("empty response.");
    renderAi(JSON.parse(textBlock.text));
  } catch (e) {
    $("aiBody").innerHTML = `<p class="ai-error">Couldn't get the analysis: ${escapeHtml(e.message)}</p>`;
  }
}

function renderAi(data) {
  // Claude's estimate is sharper than the local heuristic — show it on the dial
  $("cefrChip").textContent = data.cefr;
  $("cefrNote").textContent = "CEFR level set by Claude after a full check of grammar and vocabulary.";

  let html = `<p class="ai-summary">${escapeHtml(data.summary)}</p>`;

  if (data.errors && data.errors.length) {
    html += `<p class="ai-sub">Mistakes and fixes</p><ul class="ai-err-list">`;
    data.errors.forEach((e) => {
      html += `<li><span class="ai-quote">${escapeHtml(e.quote)}</span> → <span class="ai-fix">${escapeHtml(e.fix)}</span><span class="ai-note">${escapeHtml(e.note)}</span></li>`;
    });
    html += `</ul>`;
  } else {
    html += `<p class="ai-ok">Claude found no notable grammar mistakes.</p>`;
  }

  if (data.upgrades && data.upgrades.length) {
    html += `<p class="ai-sub">Say it stronger</p><ul class="ai-up-list">`;
    data.upgrades.forEach((u) => {
      html += `<li>${escapeHtml(u.from)} → <span class="ai-fix">${escapeHtml(u.to)}</span></li>`;
    });
    html += `</ul>`;
  }

  $("aiBody").innerHTML = html;
}

// ── Result screen ─────────────────────────────────────────────────────────────
const DIAL_LEN = Math.PI * 80;

function animateCount(el, to, dur) {
  el.textContent = to; // guaranteed final value even if rAF never runs (hidden tab)
  if (reducedMotion) return;
  const start = performance.now();
  function step(now) {
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(to * eased);
    if (p < 1) requestAnimationFrame(step); else el.textContent = to;
  }
  requestAnimationFrame(step);
}

function showResults() {
  const topic = state.topics[state.topicIdx];
  const a = analyze();
  show("result");

  $("resultTopicLine").textContent = `${topic.t[state.lang.key]} · ${state.lang.name}`;

  const scored = !state.noAnalysis;
  const arc = $("dialArc");
  const arcTarget = DIAL_LEN * (1 - (scored ? a.score : 0) / 100);
  arc.style.transition = "none";
  arc.style.strokeDashoffset = DIAL_LEN;
  // setTimeout (unlike rAF) still fires on hidden tabs, so the final state is never lost
  setTimeout(() => {
    arc.style.transition = reducedMotion ? "none" : "stroke-dashoffset 0.9s cubic-bezier(0.2,0.8,0.2,1)";
    arc.style.strokeDashoffset = arcTarget;
  }, 20);
  if (scored) animateCount($("scoreNum"), a.score, 900); else $("scoreNum").textContent = "—";
  $("cefrChip").textContent = scored ? `≈ ${a.cefr}` : "no analysis";
  $("cefrNote").textContent = "An approximate estimate based on speech metrics: pace, vocabulary, coherence and fluency. Grammar is not checked.";

  $("metricGrid").classList.toggle("hidden", !scored);
  $("barsBox").parentElement.classList.toggle("hidden", !scored);
  const m = $("metricGrid");
  m.innerHTML = "";
  [
    [a.wordCount, "words spoken"],
    [a.wpm, "words / min"],
    [`${Math.round(a.ttr * 100)}%`, "unique words"],
    [a.fillers.total, "filler words"],
  ].forEach(([v, label]) => {
    const t = document.createElement("div");
    t.className = "glass metric-tile";
    t.innerHTML = `<b>${v}</b><span>${label}</span>`;
    m.appendChild(t);
  });

  const bars = $("barsBox");
  bars.innerHTML = "";
  [
    ["Volume", a.parts.sFluency, 30],
    ["Vocabulary", a.parts.sLexis, 20],
    ["Coherence", a.parts.sCoherence, 15],
    ["Fluency", a.parts.sDelivery, 20],
    ["Cleanness", a.parts.sClean, 15],
  ].forEach(([label, val, max]) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `<span class="bar-label">${label}</span><div class="bar-track"><div class="bar-fill" style="width:0%"></div></div><span class="bar-val">${Math.round(val)}/${max}</span>`;
    bars.appendChild(row);
    const pct = `${(val / max) * 100}%`;
    setTimeout(() => { row.querySelector(".bar-fill").style.width = pct; }, 20);
  });

  const tb = $("transcriptBox");
  if (state.noAnalysis) {
    tb.innerHTML = `<span class="transcript-empty">Recognition wasn't available, so there's no transcript. But your minute of practice counts.</span>`;
  } else if (!state.transcript.trim()) {
    tb.innerHTML = `<span class="transcript-empty">I didn't hear anything. Check that the microphone is allowed and try again.</span>`;
  } else {
    tb.innerHTML = highlightTranscript(state.transcript.trim(), FILLERS[state.lang.key]);
  }

  const tl = $("tipsList");
  tl.innerHTML = "";
  buildTips(a).forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    tl.appendChild(li);
  });

  // Claude analysis — only with a key and a real transcript
  const aiCard = $("aiCard");
  if (scored && state.transcript.trim() && getApiKey()) {
    runAiAnalysis(a, topic);
  } else {
    aiCard.classList.add("hidden");
  }

  updateStreak();
  store.sessions.push({
    date: new Date().toISOString(),
    lang: state.lang.key,
    diff: state.diff,
    topic: topic.t[state.lang.key],
    score: state.noAnalysis ? null : a.score,
    cefr: state.noAnalysis ? "—" : a.cefr,
    words: a.wordCount,
  });
  const newBadges = checkBadges(a);
  saveStore();
  renderStreak();
  renderWeek();
  if (newBadges.length) showBadgeToast(newBadges[0]);
}

function checkBadges(a) {
  const earned = [];
  const has = (id) => store.badges.includes(id);
  const give = (id) => { if (!has(id)) { store.badges.push(id); earned.push(id); } };
  const n = store.sessions.length;
  if (n >= 1) give("first");
  if (n >= 5) give("five");
  if (n >= 20) give("twenty");
  if (store.streak >= 3) give("streak3");
  if (store.streak >= 7) give("streak7");
  if (a.wordCount >= 100) give("words100");
  if (!state.noAnalysis && (a.cefr === "C1" || a.cefr === "C2")) give("clevel");
  if (new Set(store.sessions.map((s) => s.lang)).size >= 3) give("polyglot");
  return earned;
}

function showBadgeToast(id) {
  const b = BADGES.find((x) => x.id === id);
  if (!b) return;
  const el = document.createElement("div");
  el.className = "glass badge-toast";
  el.textContent = `New achievement: ${b.name}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── History ──────────────────────────────────────────────────────────────────
function renderHistory() {
  const chart = $("chartBox");
  const sessions = store.sessions;
  const scoredSessions = sessions.filter((s) => typeof s.score === "number");
  if (!scoredSessions.length) {
    chart.innerHTML = `<p class="chart-empty">Your score chart will appear here. Do your first talk.</p>`;
  } else {
    const last = scoredSessions.slice(-20);
    const w = 560, h = 120, pad = 8;
    const stepX = last.length > 1 ? (w - pad * 2) / (last.length - 1) : 0;
    const pts = last.map((s, i) => [
      last.length === 1 ? w / 2 : pad + i * stepX,
      pad + (1 - s.score / 100) * (h - pad * 2),
    ]);
    const line = pts.map((p, i) => `${i ? "L" : "M"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
    const dots = pts.map((p, i) =>
      `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" fill="var(--primary)"><title>${last[i].score} · ${last[i].cefr}</title></circle>`).join("");
    const area = pts.length > 1
      ? `<path d="${line} L ${pts[pts.length - 1][0].toFixed(1)} ${h - pad} L ${pts[0][0].toFixed(1)} ${h - pad} Z" fill="url(#chartGrad)"/>`
      : "";
    chart.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" width="100%" style="display:block" role="img" aria-label="Chart of recent talk scores">
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="oklch(0.45 0.1 152)" stop-opacity="0.18"/>
            <stop offset="1" stop-color="oklch(0.45 0.1 152)" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${area}
        <path d="${line}" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${dots}
      </svg>`;
  }

  const bg = $("badgesGrid");
  bg.innerHTML = "";
  BADGES.forEach((b) => {
    const owned = store.badges.includes(b.id);
    const cell = document.createElement("div");
    cell.className = "glass badge-cell" + (owned ? "" : " locked");
    cell.innerHTML = `<div class="badge-mark">${b.mark}</div><div class="b-name">${b.name}</div><div class="b-desc">${b.desc}</div>`;
    bg.appendChild(cell);
  });

  const list = $("sessionList");
  list.innerHTML = "";
  sessions.slice().reverse().slice(0, 30).forEach((s) => {
    const lang = LANGS.find((l) => l.key === s.lang);
    const d = new Date(s.date);
    const row = document.createElement("div");
    row.className = "glass session-row";
    row.innerHTML = `
      <span class="s-lang">${lang ? lang.short : "—"}</span>
      <span class="s-main">
        <div class="s-topic">${escapeHtml(s.topic)}</div>
        <div class="s-meta">${d.toLocaleDateString("en-US")} · ${s.words} words</div>
      </span>
      <span class="s-cefr">${s.cefr}</span>
      <span class="s-score">${typeof s.score === "number" ? s.score : "—"}</span>`;
    list.appendChild(row);
  });

  // Orchestrated reveal: badges pop in, the chart line draws itself, rows slide in
  if (gsapReady()) {
    gsap.from("#badgesGrid .badge-cell", { autoAlpha: 0, scale: 0.85, y: 10, duration: 0.42, stagger: 0.04, ease: "back.out(1.5)" });
    gsap.from("#sessionList .session-row", { autoAlpha: 0, x: -16, duration: 0.42, stagger: 0.05, ease: "power3.out" });
    const linePath = chart.querySelector("path[stroke]");
    if (linePath) {
      const len = linePath.getTotalLength();
      gsap.fromTo(linePath, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.0, ease: "power2.inOut" });
      gsap.from(chart.querySelectorAll("circle"), { scale: 0, transformOrigin: "center", duration: 0.32, stagger: 0.05, delay: 0.35, ease: "back.out(2)" });
    }
  }
}

function exportProgress() {
  const data = {
    app: "Riff",
    exportedAt: new Date().toISOString(),
    streak: store.streak,
    weeklyGoal: store.weeklyGoal,
    badges: store.badges,
    sessions: store.sessions,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "riff-progress.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Handlers ──────────────────────────────────────────────────────────────────
$("btnStart").onclick = () => { buildReel(); show("reel"); };
$("btnSpin").onclick = spinReel;
$("btnRespin").onclick = spinReel;
$("btnAccept").onclick = startPrep;
$("btnReelBack").onclick = () => show("home");
$("btnSkipPrep").onclick = () => { if (stopTimer) stopTimer(); startSpeaking(); };
$("btnPrepCancel").onclick = () => { if (stopTimer) stopTimer(); show("reel"); };
$("btnFinishEarly").onclick = finishSpeaking;
$("btnAgain").onclick = () => { buildReel(); show("reel"); };
$("btnResultHome").onclick = () => { renderHome(); show("home"); };
$("navHome").onclick = () => { renderHome(); show("home"); };
$("navHistory").onclick = () => { renderHistory(); show("history"); };
$("btnHistoryBack").onclick = () => { renderHome(); show("home"); };
$("btnExport").onclick = exportProgress;

// ── Start ─────────────────────────────────────────────────────────────────────
renderHome();
initMotion();
// quick hash navigation: /#play opens the reel, /#history opens progress
if (location.hash === "#play" || location.hash === "#deck") { buildReel(); show("reel"); }
else if (location.hash === "#history") { renderHistory(); show("history"); }
