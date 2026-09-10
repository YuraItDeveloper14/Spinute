// ── Speech analysis ─────────────────────────────────────────────────────────────
// Pure functions: no DOM, no state, no storage. The page loads this file before
// app.js and reads it as window.SpinuteAnalysis; the tests load the same file
// through module.exports, so the numbers on screen are the numbers under test.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SpinuteAnalysis = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function tokenize(text) {
    return text.toLowerCase().replace(/[.,!?;:()"«»„"]/g, " ").split(/\s+/).filter(Boolean);
  }

  function countPhrases(text, phrases) {
    const norm = " " + text.toLowerCase().replace(/[.,!?;:()"«»„"]/g, " ").replace(/\s+/g, " ") + " ";
    // Longest phrases first, and every match is blanked out, so "тому що" is not
    // counted a second time as "тому". The result keeps the order of the list.
    let rest = norm;
    const counts = {};
    phrases.slice().sort((x, y) => y.length - x.length).forEach((p) => {
      let idx = 0, c = 0;
      const needle = " " + p + " ";
      while ((idx = rest.indexOf(needle, idx)) !== -1) {
        c++;
        rest = rest.slice(0, idx + 1) + "\u0000".repeat(p.length) + rest.slice(idx + needle.length - 1);
        idx += needle.length - 1;
      }
      counts[p] = c;
    });
    const found = {};
    let total = 0;
    phrases.forEach((p) => {
      if (counts[p] > 0) { found[p] = counts[p]; total += counts[p]; }
    });
    return { total, found };
  }

  function analyzeSpeech(input, fillerList, connectorList) {
    const text = (input.text || "").trim();
    const words = tokenize(text);
    const wordCount = words.length;
    const unique = new Set(words).size;
    const ttr = wordCount ? unique / wordCount : 0;
    const duration = Math.max(10, input.elapsed);
    const wpm = Math.round(wordCount / (duration / 60));

    const fillers = countPhrases(text, fillerList);
    const connectors = countPhrases(text, connectorList);
    const fillersPer100 = wordCount ? (fillers.total / wordCount) * 100 : 0;

    // pauses: gaps > 2.5s between activity markers
    let longPauses = 0, speakingCoverage = 1;
    if (input.activity.length > 1) {
      const start = input.startTs;
      const end = start + duration * 1000;
      const pts = [start, ...input.activity.filter((t) => t <= end), end];
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

  function buildTips(a, ctx) {
    const tips = [];
    if (ctx.noAnalysis) {
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
    if (a.connectors.total < 2) tips.push(`Add links between your ideas (e.g. ${ctx.connectors.slice(0, 3).map((c) => `“${c}”`).join(", ")}). They instantly make your speech more structured.`);
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

  return { escapeHtml, tokenize, countPhrases, analyzeSpeech, buildTips, highlightTranscript };
});
