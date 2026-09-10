// The phrase and topic tables in data.js — run with `node --test`.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const D = JSON.parse(JSON.stringify(vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, "..", "data.js"), "utf8") +
    "\n;({ LANGS, DIFFS, TOPICS, FILLERS, CONNECTORS })"
)));
const KEYS = D.LANGS.map((l) => l.key);

test("every language has fillers and connectors", () => {
  for (const k of KEYS) {
    assert.ok(D.FILLERS[k]?.length, `no fillers for ${k}`);
    assert.ok(D.CONNECTORS[k]?.length, `no connectors for ${k}`);
  }
});

test("phrases are lowercase and unique, otherwise they never match", () => {
  for (const table of [D.FILLERS, D.CONNECTORS]) {
    for (const k of KEYS) {
      const list = table[k];
      for (const p of list) assert.equal(p, p.toLowerCase(), `${k}: "${p}" has capitals`);
      assert.equal(new Set(list).size, list.length, `${k}: a phrase is listed twice`);
    }
  }
});

test("every topic is translated, with three hints per language", () => {
  assert.deepEqual(Object.keys(D.TOPICS).sort(), D.DIFFS.map((d) => d.id).sort());
  for (const [diff, topics] of Object.entries(D.TOPICS)) {
    topics.forEach((topic, i) => {
      for (const k of KEYS) {
        assert.ok(topic.t[k], `${diff} #${i}: no title in ${k}`);
        assert.equal(topic.h[k]?.length, 3, `${diff} #${i}: hints in ${k}`);
      }
    });
  }
});
