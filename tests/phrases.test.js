// A phrase inside a longer one must be counted once — run with `node --test`.
const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../analysis.js");

test("'тому що' is not counted again as 'тому'", () => {
  const r = A.countPhrases("Я вдома, тому що дощ.", ["тому що", "тому"]);
  assert.deepEqual(r.found, { "тому що": 1 });
  assert.equal(r.total, 1);
});

test("'tipo assim' is not counted again as 'tipo'", () => {
  const r = A.countPhrases("Foi tipo assim, sabe?", ["tipo", "tipo assim", "sabe"]);
  assert.deepEqual(r.found, { "tipo assim": 1, sabe: 1 });
});

test("a short phrase on its own still counts", () => {
  assert.equal(A.countPhrases("Тому я пішов додому.", ["тому що", "тому"]).found["тому"], 1);
});

test("results keep the order of the phrase list", () => {
  const r = A.countPhrases("you know, um, uh", ["um", "uh", "you know"]);
  assert.deepEqual(Object.keys(r.found), ["um", "uh", "you know"]);
});
