# Shot chart images

Create a folder per player named with their ESPN athlete id (matches the `id`
field in `data/players/<id>.json` and the folder name shown on that player's
card in the roster menu). Inside it, drop in one `<season>.png` per season,
named exactly like the season's `year` field in that player's JSON, e.g.
`2025-26.png`.

Example for a player with ESPN id `5177040`:

```
images/shotcharts/5177040/2023-24.png
images/shotcharts/5177040/2024-25.png
images/shotcharts/5177040/2025-26.png
```

The site links to these paths automatically from each player's JSON file
(`seasons[].shotChart`) — no code changes needed, just drop the image in
place with the right name. If a file isn't there yet, the site shows a "shot
chart not added yet" placeholder instead of a broken image.

There's no career shot chart — Synergy doesn't export a combined
multi-season chart, so the Career section only shows the computed play
type / shot type / shot distance / drive direction numbers (see the main
README's "Career play type..." section for how those are calculated).
