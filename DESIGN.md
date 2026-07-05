# Design

## Theme

Light frosted-glass minimalism. A near-white surface with three large, softly-drifting color blobs (sage, teal, apricot) behind translucent glass panels (`backdrop-filter: blur`). Mood: "morning light through a frosted conservatory window — calm focus before speaking."

## Color (OKLCH)

- `--bg`: oklch(0.99 0.004 150) — near-pure white base
- `--ink`: oklch(0.24 0.02 150) — body text, ≥7:1 on bg
- `--muted`: oklch(0.44 0.025 150) — secondary text, ≥4.5:1
- `--primary`: oklch(0.52 0.11 150) — deep sage; primary buttons, active states; white text on fills
- `--accent`: oklch(0.68 0.13 60) — apricot; streak/badges/highlights; dark-amber text on pale tints, never body text
- Glass: rgba(255,255,255,0.55–0.7) + blur(20–28px) + 1px rgba(255,255,255,0.75) border
- Wheel segments: 8 pastel translucent tints (sage, mint, sky, lilac, peach, sand, rose, teal), L≈0.9, alpha≈0.55

Strategy: Restrained. Color lives in the background blobs and the wheel; panels and text stay neutral.

## Typography

- **Manrope** (500/600/700/800) for UI + **Playfair Display** (700/800, italic 700) for display: headings, wordmark (italic), hero accent (italic), reel topics, timer topic, badge monograms. The owner explicitly loves this serif — keep it. Labels, buttons, and data stay Manrope.
- No ampersands in content: topic titles use "and"/"und"/"і" — ornate `&` glyphs read as noise.
- Fixed rem scale, ratio ≈1.2. Timer digits are the only display-size element (tabular-nums).
- `text-wrap: balance` on headings.

## Components

- **Glass panel**: rounded 24px, blur, white hairline border, soft shadow `0 8px 32px rgba(30,50,40,.08)`.
- **Chips** (language, difficulty): pill, glass, 2px primary ring when selected.
- **Primary button**: filled `--primary`, white text, rounded-full; hover lifts 1px + deepens; focus-visible 3px outline.
- **Ghost button**: transparent, ink text, hairline border.
- **Timer ring**: SVG circle, primary stroke draining clockwise; digits centered.
- **Topic reel**: a frameless vertical slot reel that blends into the page — no panel, no box. Rows fade into the background via `mask-image`; the center window is marked only by two short hairlines. Spinning blurs the strip and eases out over ~3s; the landed row darkens and grows slightly. Topics draw without repeats until exhausted (silently — no counter shown). NO emoji or pictograms anywhere in the UI; badges are typographic monograms in thin rings; the streak pill reads "1 день / 3 дні / 7 днів" with a stroke SVG flame and hides at zero.
- **Home screen sections**: no card boxes — sections separated by hairlines and whitespace (identical stacked cards are an AI tell). Panels remain only on functional surfaces (results, history).
- **Score dial**: SVG arc 0–100 + CEFR chip.
- **Metric tiles / score bars**: quiet white-glass tiles, no side-stripes, no gradient text.

## Motion

- Wheel spin: 4.2s `cubic-bezier(.12,.8,.12,1)` rotation; reduced-motion → instant result fade.
- Screen transitions: 200ms fade/slide-up.
- Background blobs: 40s slow drift loop; disabled under reduced-motion.
- Volume feedback while speaking: soft glow scale tied to mic RMS.

## Sound & haptics

- Reel spin plays synthesized Web Audio (no files): quiet 1900 Hz triangle ticks that thin out with the ease-out deceleration (inverse ease-out-cubic scheduling), then a soft 300→140 Hz sine thud on landing; the window hairlines pulse once. `navigator.vibrate(10)` on supporting phones. All skipped under reduced motion.

## Layout

Single centered column, max-width 640px, 16–24px gutters. Top bar: wordmark left, streak + history right. Mobile-first; wheel scales to viewport width (max 420px).
