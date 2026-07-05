# Riff — one-minute speaking practice

Draw a random topic, get 30 seconds to prepare and one minute to speak in the
language you're learning, then get an honest breakdown of how you spoke — pace,
vocabulary, coherence, fluency, filler words — plus an approximate CEFR level.
Optionally, paste an Anthropic API key to get a deep grammar-and-phrasing review
from **Claude** after each talk.

Everything runs in the browser. There is **no build step and no backend** — just
static HTML, CSS and JavaScript.

## Features

- **8 practice languages** — English, Deutsch, Español, Français, Italiano,
  Português, Polski, Українська.
- **72 topics** across three difficulty levels (A1–A2 / B1–B2 / C1–C2), drawn on
  a frameless slot reel with sound and no repeats until the pool is exhausted.
- **In-browser speech analysis** via the Web Speech API (works in Chrome / Edge).
- **Optional Claude analysis** — CEFR level, concrete mistakes with fixes, and
  richer-phrasing suggestions. Your API key is stored only in `localStorage` and
  is sent directly to `api.anthropic.com` from your browser — never anywhere else.
- **Progress** — daily streak, weekly goal ring, score history chart,
  achievements, and one-click JSON export.

## Run locally

Any static file server works:

```bash
npx http-server -p 8123 .
# then open http://localhost:8123
```

## Deploy to Vercel

This is a static site, so Vercel needs zero configuration.

1. Push this folder to a GitHub repository (see below).
2. Go to [vercel.com/new](https://vercel.com/new), **Import** that repository.
3. Framework preset: **Other**. Build command: *(leave empty)*. Output
   directory: `.` (root). Click **Deploy**.

That's it — Vercel serves `index.html` directly.

### Push to GitHub

```bash
git remote add origin https://github.com/<your-username>/riff.git
git branch -M main
git push -u origin main
```

## About the analysis

- The score (0–100) and its CEFR estimate are heuristic — based on measurable
  speech metrics, not grammar. It is clearly labelled *approximate*.
- With a Claude API key, the CEFR level and mistake list come from
  `claude-opus-4-8` reviewing your transcript. API usage is billed to your
  Anthropic **API credits** (pay-as-you-go), which are separate from any
  Claude Pro/Max subscription. A typical review costs a few cents.
