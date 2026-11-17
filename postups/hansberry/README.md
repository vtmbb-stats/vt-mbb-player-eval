# Amani Hansberry post-up report

Public link (GitHub Pages, send this to players/coaches):
https://vtmbb-stats.github.io/vt-mbb-player-eval/amani/

Claude dashboard (private): https://claude.ai/artifact/DsCyrx4a4Y7qEC9vT5c5Eu
Two views: **This season** (default) and **VT career**.

## After each game

```
node postups/hansberry/update.js --push
```

`--push` commits `amani/index.html` and pushes to GitHub, so the public link
updates within a minute or two. Leave it off to rebuild locally only.

This pulls every finished Virginia Tech game this season from ESPN (shot
locations, shot types, minutes) and rebuilds:

- `data.json`: all the report's data (earlier seasons are never touched)
- `../../Amani Hansberry Post-Ups.html`: standalone offline copy
- `out/`: the five data files and the page for the live dashboard

Then ask Claude to "push the Amani update". It uploads `out/*.json` to the
dashboard and points the datasets at them. The link stays the same.

If ESPN hasn't posted play-by-play for a game yet (common for a few hours
after late games), the script says so and the page notes it. Run it again
later and those shots get filled in.

## Synergy numbers (manual)

Post-ups by spot, PPP, share of plays, percentile and drive direction come
from Synergy, which has no public feed. After a new export, edit
`synergy.json` for the current season (`games` = games the export covers,
`through` = date of the last one), then run the update. The page shows how
many games the Synergy numbers cover, so stale numbers are never mistaken
for current ones.

## Files

- `update.js`: ESPN pull + build
- `template.html`: the page. Everything from `<style>\n.hx {` down is the
  dashboard's page; the head above it is a standalone-only stand-in for the
  dashboard runtime.
- `synergy.json`: hand-entered Synergy numbers for the current season
- `data.json`: the data, all seasons
