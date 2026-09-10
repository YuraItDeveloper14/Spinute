// Speech analysis — run with `node --test`, no dependencies.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const A = require("../analysis.js");

// data.js is a browser script of top-level consts: evaluate it, then copy the
// tables into this realm so deep comparisons see ordinary arrays and objects.
const D = JSON.parse(JSON.stringify(vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "..", "data.js"), "utf8") +
    "\n;({ FILLERS, CONNECTORS })"
)));

const LONG =
  "My favourite place is the city where I grew up because it has a lot of green parks. " +
  "However, it is also very busy in the morning. For example, the metro is full of people " +
  "going to work. In my opinion, the best time to walk there is in the evening, when the " +
  "streets are quiet and the lights come on. On the other hand, summer weekends can be " +
  "crowded near the river. First of all, I like the old buildings. In addition, there are " +
  "many small cafes with good coffee. As a result, I often meet my friends there after " +
  "school. Finally, I think every visitor should see the view from the hill at sunset.";
const FAST = Array(5)
  .fill("I like to play football with my friends after school every day")
  .join(" ");

function run(text, { lang = "en", elapsed = 60, activity = [], startTs = 0 } = {}) {
  return A.analyzeSpeech({ text, elapsed, activity, startTs }, D.FILLERS[lang], D.CONNECTORS[lang]);
}

test("tokenize lowercases and drops punctuation", () => {
  assert.deepEqual(A.tokenize("Hello, World! «Привіт»"), ["hello", "world", "привіт"]);
});

test("countPhrases matches whole words and multi-word phrases", () => {
  const r = A.countPhrases("Um, I mean the umbrella, um.", ["um", "i mean"]);
  assert.equal(r.total, 3);
  assert.deepEqual(r.found, { um: 2, "i mean": 1 });
});

test("silence scores zero", () => {
  const a = run("");
  assert.equal(a.wordCount, 0);
  assert.equal(a.score, 0);
  assert.equal(a.cefr, "A1");
  assert.equal(a.speakingCoverage, 0);
});

test("fillers are counted per hundred words", () => {
  const a = run("Um, I think, uh, my family is, you know, big.", { elapsed: 20 });
  assert.equal(a.wordCount, 10);
  assert.equal(a.fillers.total, 3);
  assert.ok(Math.abs(a.fillersPer100 - 30) < 1e-9);
});

test("a short answer is capped at A1 whatever the score", () => {
  const a = run("Um, I think, uh, my family is, you know, big.", { elapsed: 20 });
  assert.ok(a.score >= 22, "the score alone would give A2");
  assert.equal(a.cefr, "A1");
});

test("a long, linked answer with pauses", () => {
  const a = run(LONG, { activity: [1500, 2000, 6000, 6500, 12000, 13000], startTs: 1000 });
  assert.equal(a.wordCount, 116);
  assert.equal(a.connectors.total, 9);
  assert.equal(a.longPauses, 3);
  assert.equal(a.score, 77);
  assert.equal(a.cefr, "C1");
});

test("pace is words per minute of talk", () => {
  const a = run(FAST, { elapsed: 15 });
  assert.equal(a.wpm, 240);
  assert.equal(a.cefr, "B1"); // 60 words cap the level at B1
});

test("tips react to what happened", () => {
  const ctx = { noAnalysis: false, connectors: D.CONNECTORS.en };
  assert.match(A.buildTips(run(""), ctx)[0], /didn't hear/);
  assert.match(A.buildTips(run("anything"), { ...ctx, noAnalysis: true })[0], /Chrome or Edge/);
  assert.ok(A.buildTips(run(FAST, { elapsed: 15 }), ctx).some((t) => /words\/min/.test(t)));
});

test("highlightTranscript escapes HTML and marks fillers", () => {
  assert.equal(
    A.highlightTranscript("um <b>ok</b>, you know", ["um", "you know"]),
    "<mark>um</mark> &lt;b&gt;ok&lt;/b&gt;, <mark>you know</mark>"
  );
});

test("escapeHtml", () => {
  assert.equal(A.escapeHtml('<a href="x">&</a>'), "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
});
