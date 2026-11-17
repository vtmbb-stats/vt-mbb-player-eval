// Rebuilds "Amani Hansberry Post-Ups.html" after each game.
//
//   node postups/hansberry/update.js          (rebuild locally)
//   node postups/hansberry/update.js --push   (rebuild + publish to GitHub Pages)
//
// Public link: https://vtmbb-stats.github.io/vt-mbb-player-eval/amani/
//
// What it does:
//   1. Pulls Virginia Tech's schedule for the current season from ESPN.
//   2. For every finished game, pulls the play-by-play and box score and
//      rebuilds Amani's 2-point attempts (location, zone, side, shot type)
//      and minutes. Earlier seasons in data.json are left exactly as they are
//      (their shot types were hand-labeled from VT stats).
//   3. Writes postups/hansberry/data.json and regenerates the page from
//      postups/hansberry/template.html.
//
// What it can't do: Synergy numbers (post-ups by spot, PPP, share of plays,
// drive direction) have no public feed. Paste them into synergy.json for the
// current season whenever you export them; the page labels how many games the
// Synergy numbers cover so they're never mistaken for up to date.
//
// Requires Node 18+ (built-in fetch). No npm install.

const fs = require("fs");
const path = require("path");

const PLAYER_ID = "4685673"; // Amani Hansberry on ESPN
const TEAM_ID = "259"; // Virginia Tech
const API = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball";

const DIR = __dirname;
const ROOT = path.join(DIR, "..", "..");
const DATA_PATH = path.join(DIR, "data.json");
const SYNERGY_PATH = path.join(DIR, "synergy.json");
const TEMPLATE_PATH = path.join(DIR, "template.html");
const OUT_PATH = path.join(ROOT, "Amani Hansberry Post-Ups.html");
const OUT_DIR = path.join(DIR, "out");
const PAGES_PATH = path.join(ROOT, "amani", "index.html"); // GitHub Pages copy
const PAGES_URL = "https://vtmbb-stats.github.io/vt-mbb-player-eval/amani/";

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN request failed (${res.status}): ${url}`);
  return res.json();
}

// Game date in Eastern time (ESPN gives UTC, which pushes night games a day late).
function easternDate(iso) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

// --- Shot classification (same rules the page's Definitions section lists) ---
function locate(x, y) {
  const dx = x - 25;
  const dist = Math.round(Math.hypot(dx, y) * 10) / 10;
  const side = dx >= 2 ? "Left" : dx <= -2 ? "Right" : "Middle";
  let zone = "Other 2";
  if (dist <= 4) zone = "At rim";
  else if (dist <= 11 && y <= 10) zone = "Short paint";
  else if (Math.abs(dx) <= 7 && y >= 10 && y <= 17) zone = "Nail / high post";
  return { dist_ft: dist, side, zone };
}

function shotKind(text) {
  const t = text.toLowerCase();
  if (t.includes("dunk")) return "Dunk";
  if (t.includes("tip")) return "Tip-in";
  if (t.includes("hook")) return "Hook";
  if (t.includes("turnaround") || t.includes("fadeaway")) return "Turnaround";
  if (t.includes("floater") || t.includes("floating")) return "Floater";
  if (t.includes("layup") || t.includes("finger roll")) return "Layup";
  if (t.includes("jumper") || t.includes("jump shot")) return "Jumper";
  return "Unlabeled";
}

function shotsFromGame(summary, game) {
  const out = [];
  let n = 0;
  for (const p of summary.plays || []) {
    if (!p.shootingPlay || p.scoreValue !== 2) continue;
    const shooter = p.participants && p.participants[0] && p.participants[0].athlete && p.participants[0].athlete.id;
    if (shooter !== PLAYER_ID) continue;
    n += 1;
    const c = p.coordinate || {};
    const hasLoc = Number.isFinite(c.x) && Number.isFinite(c.y) && c.x >= 0 && c.y >= 0;
    const loc = hasLoc ? locate(c.x, c.y) : { dist_ft: null, side: "", zone: "No location" };
    const kind = shotKind(p.text || "");
    out.push({
      shot_id: `${game.game_id}-${n}`,
      season: game.season,
      date: game.date,
      opponent: game.opponent,
      team: "VT",
      half: p.period && p.period.number === 1 ? "1st" : p.period && p.period.number === 2 ? "2nd" : "OT",
      clock: (p.clock && p.clock.displayValue) || "",
      x: hasLoc ? c.x : null,
      y: hasLoc ? c.y : null,
      dist_ft: loc.dist_ft,
      made: p.scoringPlay ? 1 : 0,
      side: loc.side,
      zone: loc.zone,
      post_move: kind === "Hook" || kind === "Turnaround" ? kind : "",
      play: (p.text || "").replace(/^Amani Hansberry\s+/, ""),
      kind,
      type_source: "ESPN",
    });
  }
  return out;
}

function minutesFromBox(summary) {
  for (const team of (summary.boxscore && summary.boxscore.players) || []) {
    for (const group of team.statistics || []) {
      const i = (group.names || group.labels || []).indexOf("MIN");
      const a = (group.athletes || []).find((x) => x.athlete && x.athlete.id === PLAYER_ID);
      if (a && i >= 0) return Number(a.stats[i]) || 0;
    }
  }
  return null; // did not play
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const synergy = JSON.parse(fs.readFileSync(SYNERGY_PATH, "utf8"));

  const sched = await getJson(`${API}/teams/${TEAM_ID}/schedule`);
  const season = sched.season.displayName; // e.g. "2026-27"
  const finals = (sched.events || []).filter((e) => e.competitions[0].status.type.completed);

  const games = [];
  const shots = [];
  for (const e of finals) {
    const comp = e.competitions[0];
    const opp = comp.competitors.find((c) => c.team.id !== TEAM_ID);
    const summary = await getJson(`${API}/summary?event=${e.id}`);
    const minutes = minutesFromBox(summary);
    if (minutes == null) { console.log(`  ${easternDate(e.date)} vs ${opp.team.displayName}: did not play`); continue; }
    const hasPbp = (summary.plays || []).length > 0;
    const game = { game_id: e.id, season, date: easternDate(e.date), opponent: opp.team.displayName, team: "VT", minutes, detailed_pbp: hasPbp ? 1 : 0 };
    const gs = hasPbp ? shotsFromGame(summary, game) : [];
    games.push(game);
    shots.push(...gs);
    console.log(`  ${game.date} vs ${game.opponent}: ${minutes} min, ` + (hasPbp ? `${gs.length} two-point attempts` : "NO PLAY-BY-PLAY YET (ESPN hasn't posted it; re-run later)"));
  }

  // Replace the current season wholesale; keep earlier seasons untouched.
  data.games = [...data.games.filter((g) => g.season !== season), ...games];
  data.shots = [...data.shots.filter((s) => s.season !== season), ...shots];

  // Synergy-driven pieces come from synergy.json.
  const syn = synergy[season] || {};
  const keepOld = (rows) => rows.filter((r) => r.season !== season);
  data.postups = [...keepOld(data.postups), ...(syn.postups || []).map((r) => ({ season, ...r }))];
  data.drives = [...keepOld(data.drives), ...(syn.drives || []).map((r) => ({ season, ...r }))];
  data.seasons = [
    ...keepOld(data.seasons),
    { season, team: "Virginia Tech", games: syn.games || 0, minutes: games.reduce((a, g) => a + g.minutes, 0), postup_share: syn.postup_share ?? null, percentile: syn.percentile ?? null, through: syn.through || null },
  ];
  const pending = games.filter((g) => !g.detailed_pbp).map((g) => ({ date: g.date, opponent: g.opponent }));
  delete data.meta;

  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 1));

  const tpl = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const marker = "/*__HX_DATA__*/";
  if (!tpl.includes(marker)) throw new Error("template.html is missing the data marker");
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const page = tpl.replace(marker, json);
  fs.writeFileSync(OUT_PATH, page);
  fs.mkdirSync(path.dirname(PAGES_PATH), { recursive: true });
  fs.writeFileSync(PAGES_PATH, page);

  // Files for the live dashboard on claude.ai: one JSON per dataset, plus the page.
  // The page is the same body as the standalone copy, minus the standalone-only head.
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const id of ["shots", "games", "seasons", "postups", "drives"]) {
    fs.writeFileSync(path.join(OUT_DIR, id + ".json"), JSON.stringify(data[id]));
  }
  const start = tpl.indexOf("<style>\n.hx {");
  const end = tpl.lastIndexOf("</body>");
  if (start < 0 || end < 0) throw new Error("template.html: couldn't find the dashboard body");
  fs.writeFileSync(path.join(OUT_DIR, "index.html"), '<meta name="dash-one-writer">\n' + tpl.slice(start, end).trimEnd() + "\n");

  console.log(`\n${season}: ${games.length} games from ESPN, ${shots.length} two-point attempts.`);
  if (pending.length) console.log(`Play-by-play missing for ${pending.map((g) => g.opponent).join(", ")}. Re-run this later to fill in those shots.`);
  if ((syn.games || 0) < games.length) {
    console.log(`Synergy numbers cover ${syn.games || 0} of ${games.length} games. Update postups/hansberry/synergy.json when you export the next batch.`);
  }
  console.log(`Wrote ${path.relative(ROOT, OUT_PATH)}, ${path.relative(ROOT, PAGES_PATH)} and the dashboard files in ${path.relative(ROOT, OUT_DIR)}/`);

  if (process.argv.includes("--push")) publish(season, games.length);
}

// Commits the GitHub Pages copy (and its sources) and pushes, so the public link
// updates within a minute or two.
function publish(season, gameCount) {
  const { execFileSync } = require("child_process");
  const git = (...args) => execFileSync("git", args, { cwd: ROOT, stdio: "pipe" }).toString().trim();
  git("add", "--", "amani/index.html", "postups/hansberry");
  if (!git("diff", "--cached", "--name-only")) {
    console.log("Nothing changed since the last push.");
    return;
  }
  git("commit", "-m", `Update Amani post-up report (${season}, ${gameCount} games)`);
  git("push");
  console.log(`Pushed. ${PAGES_URL} updates within a minute or two.`);
}

if (require.main === module) main().catch((err) => { console.error(err); process.exit(1); });
module.exports = { locate, shotKind, shotsFromGame, minutesFromBox, getJson, easternDate, API };
