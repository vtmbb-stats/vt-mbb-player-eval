# VT Men's Basketball — Player Evaluation

A static, no-build-step site for evaluating Virginia Tech Men's Basketball
players: a roster menu across the top, and per-player pages with career
stats by season, shot charts, play types, an AI-drafted review, and a coach
review below it. Built to run on GitHub Pages as-is.

## Structure

```
index.html            Page shell (header + tab bar + content area)
css/styles.css         Styling
js/app.js              All rendering logic (fetches the JSON below and builds the UI)
data/roster.json        Roster list used for the tab bar / roster grid
data/players/<id>.json  One file per player: stats, shot charts, play types, AI review, coach review
images/shotcharts/<id>/ Shot chart images you upload per player
scraper/fetch-stats.js  Node script that (re)pulls stats from ESPN's API
```

## Updating stats from ESPN

```
node scraper/fetch-stats.js
```

Pulls season-by-season college stats (including prior schools for transfers)
for the players listed in `scraper/players.json`, and writes `data/roster.json`
+ `data/players/<id>.json`. Safe to re-run anytime, e.g. after a game — it
merges in fresh stats without touching anything you entered by hand (shot
charts, play types, AI review, coach review).

The roster is a curated list rather than a single team's live roster, since
it's meant to track a specific incoming/target roster spanning multiple
schools. To add, remove, or change players, edit `scraper/players.json`:

```json
[{ "name": "Full Name", "teamId": "197" }]
```

`teamId` is just the ESPN team whose roster page gets searched to resolve the
player's ESPN athlete id (typically the school they played for last) — the
stats that get pulled independently include their full multi-school career
history. Find team ids at
`site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams`.
Re-running the scraper after editing the list also removes any
`data/players/<id>.json` file for a player no longer in `players.json`.

Requires Node 18+ (uses the built-in `fetch`). No `npm install` needed.

## Adding shot chart images

See `images/shotcharts/README.md`. Short version: put images at
`images/shotcharts/<espnId>/<season>.png`, matching the `year` field in that
player's JSON. The site links to these paths automatically — no code changes
needed. Missing images show a "not added yet" placeholder instead of a
broken image. There's no career shot chart (Synergy doesn't export one) —
the Career section shows computed play type / shot type / shot distance
numbers instead, see below.

## Adding play types (Synergy) and review notes

Open a player's file in `data/players/<id>.json` and fill in:

- `seasons[].playTypes` / `career.playTypes` — array of
  `{ "type": "Spot Up", "freq": "22%", "ppp": "1.05", "percentile": "78", "rating": "Good" }`
  objects (any subset of `freq`/`ppp`/`pps`/`percentile`/`fgPct`/`rating` is
  fine — use `ppp` for play types, `pps` for shot types, whichever Synergy's
  export gives you). Add an optional `subTypes` array on any entry for
  Synergy's nested breakdowns (e.g. High/Left/Right P&R) — same shape as the
  parent, rendered as an expandable dropdown under that entry on the player
  page.
- `seasons[].shotTypes` / `career.shotTypes` — same shape as `playTypes`, for
  Synergy's shot-type breakdown (Jump Shot/Catch-and-Shoot/Guarded-Unguarded,
  Dribble Jumper, Runner, At Rim/Layup/Dunk, etc).
- `seasons[].shotDistances` / `career.shotDistances` — same shape again, for
  Synergy's short/medium/long shot-distance buckets.
- `seasons[].driveDirection` — optional array of
  `{ "type": "Drives Left", "freq": "64.9%", "fgPct": "45.0%", "ppp": "0.917" }`
  objects for a season's overall drive-direction split (separate from any
  per-play-type drive splits under `subTypes`).
- `seasons[].trend.note` — optional short text shown under that season's stat
  line. Each individual stat in that line (PTS, REB, AST, etc.) already gets
  its own ▲/▼ arrow auto-computed against the prior season — this note is
  for freeform commentary, not an overall verdict.
- `aiReview` — the AI-drafted read on the player, shown in the "AI Review"
  section at the bottom of the player page. `aiReview.strengths` —
  `bestArea`, `bestPlayType`, `overallStrength`; `aiReview.weaknesses` —
  `worstArea`, `worstPlayType`, `overallWeakness`, `developmentTarget`.
- `coachReview` — a plain freeform string, shown in the "Coach Review"
  section right below the AI Review. This is where the coach's own notes go,
  kept deliberately separate from the AI-drafted read rather than merged
  into it. Newlines are preserved.

These fields are preserved when you re-run the scraper.

### Career play type / shot type / shot distance / drive direction numbers

Synergy doesn't expose a combined career view for these, only per-season. The
`career.playTypes` / `career.shotTypes` / `career.shotDistances` /
`career.driveDirection` fields are computed by weighting each season's
numbers by actual possessions or attempts (not by averaging the season
percentages, which would over-weight low-volume seasons). Percentile/rating
are season-relative rankings with no valid career equivalent, so they're left
off the computed career entries — an optional `career.playTypesNote` string
is shown above the career Play Types list to explain that. When you send a
new player's season-by-season Synergy exports, ask me to do this same
weighted rollup once all seasons are in.

## Previewing locally

Any static file server works, e.g.:

```
npx serve .
```

then open the printed localhost URL. (Opening `index.html` directly via
`file://` won't work — the `fetch()` calls for the JSON data need an
actual HTTP server.)

## Deploying to GitHub Pages

1. `git init`, commit, push to a GitHub repo.
2. In the repo's Settings → Pages, set the source to the `main` branch, root
   folder.
3. The site is static and lives at the repo root, so no build step or
   `docs/` folder is needed.
