# Product

## Register

product

## Users

Language learners (A1–C2) who want daily speaking practice without a partner. Context: at home or on the go, a few minutes at a time, microphone available, often practicing a language they study (English, German, Spanish, French, Italian, Polish, Ukrainian). UI language is Ukrainian (primary user is a Ukrainian speaker).

## Product Purpose

"Хвилинка" (1minconvo) — a single-page web game: spin a glass wheel to get a random topic, 30 seconds to prepare (with hint phrases), 60 seconds to speak. The browser transcribes speech (Web Speech API, no server, no keys) and the app produces an honest, metric-based analysis: words, pace, lexical variety, connectors, filler words, pauses — combined into a 0–100 score and an *approximate* CEFR estimate (A1–C2). History, progress chart, daily streak and badges keep practice going. Success = the user speaks every day and sees the trend improve.

## Brand Personality

Calm, encouraging, honest. Like a friendly coach: celebrates effort, points out concrete things to improve, never shames. Three words: light, focused, supportive.

## Anti-references

- Duolingo-style loud gamification (mascots, aggressive streak guilt).
- Casino-style prize wheels (gold, red, flashing lights) — the wheel is elegant frosted glass, not Vegas.
- Fake precision: never claim exact grammar analysis; the CEFR estimate is clearly labelled approximate.

## Design Principles

1. **Glass with purpose** — glassmorphism is the user-chosen identity; glass panels mark the *active* surface (wheel hub, timers, result card), everything else stays quiet.
2. **One thing per screen** — setup → wheel → prep → speak → result is a strict linear flow; each screen has exactly one primary action.
3. **The timer is the hero** — during prep/speaking the countdown ring dominates; nothing competes with it.
4. **Honest numbers** — every score is explained by visible metrics; the CEFR label always carries the "орієнтовно" caveat.
5. **Encourage the next minute** — every result screen ends with a clear invitation to spin again.

## Accessibility & Inclusion

- WCAG AA contrast (≥4.5:1 body text) despite the light glass aesthetic.
- Full `prefers-reduced-motion` alternatives (no spin easing theatrics, instant transitions).
- Speech recognition requires Chrome/Edge; the app detects unsupported browsers and offers a timer-only practice mode instead of breaking.
- Keyboard operable: all actions are real buttons.
