// Pulls each player's season-by-season college stats from ESPN's public
// (undocumented) API for the roster defined in scraper/players.json, and
// writes/merges them into data/roster.json + data/players/<id>.json.
//
// The roster is a curated list rather than "team X's current roster" since
// it's meant to track an incoming/target roster spanning multiple schools
// (returning players + transfers). Edit scraper/players.json to add, remove,
// or change players:
//   [{ "name": "Full Name", "teamId": "197", "jersey": "4", "classYear": "Junior", "position": "F" }, ...]
// `teamId` is just the ESPN team whose roster page we search to resolve the
// player's ESPN athlete id (typically the school they played for last) -
// their pulled stats independently include their full multi-school history.
// `jersey`, `classYear`, and `position` are optional and override whatever
// ESPN shows on that roster page (useful for transfers who wear a different
// number at their new school, list a position that doesn't match how the
// team actually uses them, or once a new season starts and ESPN's roster
// page hasn't caught up to everyone's advanced class year yet).
// Find team ids at:
//   site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams
//
// Safe to re-run any time (e.g. after a game) - manual fields (shotChart,
// playTypes, aiReview, coachReview, trend.note) are preserved on re-run.
//
// Usage: node scraper/fetch-stats.js

const fs = require("fs");
const path = require("path");

const SPORT_PATH = "basketball/mens-college-basketball";

const ROOT_DIR = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const PLAYERS_DIR = path.join(DATA_DIR, "players");
const PLAYERS_CONFIG_PATH = path.join(__dirname, "players.json");

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`Request failed (${res.status}): ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function rosterUrl(teamId) {
  return `https://site.api.espn.com/apis/site/v2/sports/${SPORT_PATH}/teams/${teamId}/roster`;
}

function athleteStatsUrl(athleteId) {
  return `https://site.web.api.espn.com/apis/common/v3/sports/${SPORT_PATH}/athletes/${athleteId}/stats`;
}

// Turns a category's parallel labels/names/statistics arrays into
// [{ year, teamSlug, stats: { name: value, ... } }, ...] and a name->label map.
function rowsFromCategory(category, teamsBySlug) {
  if (!category) return { rows: [], labels: {} };
  const labels = {};
  category.names.forEach((name, i) => {
    labels[name] = category.labels[i];
  });
  const rows = category.statistics.map((stat) => {
    const values = {};
    category.names.forEach((name, i) => {
      values[name] = stat.stats[i];
    });
    const team = teamsBySlug[stat.teamSlug];
    return {
      year: stat.season.displayName,
      seasonYear: stat.season.year,
      team: team ? team.displayName : stat.teamSlug,
      teamSlug: stat.teamSlug,
      values,
    };
  });
  return { rows, labels };
}

// "126-326" -> [126, 326]
function splitMadeAttempted(value) {
  if (typeof value !== "string" || !value.includes("-")) return null;
  const [made, attempted] = value.split("-").map(Number);
  if (Number.isNaN(made) || Number.isNaN(attempted)) return null;
  return [made, attempted];
}

function pct(made, attempted) {
  if (!attempted) return "0.0";
  return ((made / attempted) * 100).toFixed(1);
}

// Sums the raw "totals" rows across seasons and recomputes career
// shooting percentages + per-game averages (weighted by games played).
function computeCareerStats(totalsRows, averagesRows) {
  const totalsSum = {};
  const splitFields = new Set();

  totalsRows.forEach((row) => {
    Object.entries(row.values).forEach(([name, value]) => {
      const split = splitMadeAttempted(value);
      if (split) {
        splitFields.add(name);
        totalsSum[name] = totalsSum[name] || [0, 0];
        totalsSum[name][0] += split[0];
        totalsSum[name][1] += split[1];
      } else if (!name.toLowerCase().includes("pct")) {
        const num = Number(value);
        if (!Number.isNaN(num)) {
          totalsSum[name] = (totalsSum[name] || 0) + num;
        }
      }
    });
  });

  const careerTotals = {};
  Object.entries(totalsSum).forEach(([name, value]) => {
    if (splitFields.has(name)) {
      const [made, attempted] = value;
      careerTotals[name] = `${made}-${attempted}`;
    } else {
      careerTotals[name] = String(value);
    }
  });
  // recompute the three shooting percentages explicitly
  if (totalsSum["fieldGoalsMade-fieldGoalsAttempted"]) {
    const [m, a] = totalsSum["fieldGoalsMade-fieldGoalsAttempted"];
    careerTotals.fieldGoalPct = pct(m, a);
  }
  if (totalsSum["threePointFieldGoalsMade-threePointFieldGoalsAttempted"]) {
    const [m, a] = totalsSum["threePointFieldGoalsMade-threePointFieldGoalsAttempted"];
    careerTotals.threePointFieldGoalPct = pct(m, a);
  }
  if (totalsSum["freeThrowsMade-freeThrowsAttempted"]) {
    const [m, a] = totalsSum["freeThrowsMade-freeThrowsAttempted"];
    careerTotals.freeThrowPct = pct(m, a);
  }

  const gamesPlayed = averagesRows.reduce((sum, r) => sum + (Number(r.values.gamesPlayed) || 0), 0);
  const gamesStarted = averagesRows.reduce((sum, r) => sum + (Number(r.values.gamesStarted) || 0), 0);

  const perGame = {};
  ["points", "totalRebounds", "assists", "blocks", "steals", "turnovers", "fouls", "offensiveRebounds", "defensiveRebounds"].forEach((name) => {
    if (typeof totalsSum[name] === "number" && gamesPlayed) {
      perGame[name] = (totalsSum[name] / gamesPlayed).toFixed(1);
    }
  });

  return {
    gamesPlayed: String(gamesPlayed),
    gamesStarted: String(gamesStarted),
    totals: careerTotals,
    perGame,
  };
}

function readExisting(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

// Preserve manually-entered fields across re-runs.
function mergeSeason(freshSeason, existingSeasons) {
  const prior = (existingSeasons || []).find((s) => s.year === freshSeason.year);
  return {
    ...freshSeason,
    shotChart: prior?.shotChart ?? `images/shotcharts/${freshSeason.playerId}/${freshSeason.year}.png`,
    playTypes: prior?.playTypes ?? [],
    trend: prior?.trend ?? { direction: null, note: "" },
  };
}

const rosterCache = new Map();

async function fetchTeamRoster(teamId) {
  if (!rosterCache.has(teamId)) {
    rosterCache.set(teamId, fetchJson(rosterUrl(teamId)));
  }
  return rosterCache.get(teamId);
}

// Finds a player's athlete record (id, position, jersey, headshot,
// experience) by searching the roster of the team they're configured
// against in scraper/players.json.
async function resolveAthlete(target) {
  const rosterResponse = await fetchTeamRoster(target.teamId);
  const athletes = rosterResponse.athletes || [];
  const wanted = target.name.trim().toLowerCase();
  const exact = athletes.filter((a) => a.fullName.trim().toLowerCase() === wanted);
  const matches = exact.length ? exact : athletes.filter((a) => a.fullName.trim().toLowerCase().includes(wanted));

  if (matches.length === 0) {
    throw new Error(`No player named "${target.name}" found on team ${target.teamId}'s roster.`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple players matching "${target.name}" found on team ${target.teamId}'s roster: ${matches.map((m) => m.fullName).join(", ")}`
    );
  }
  return matches[0];
}

async function buildPlayer(athlete) {
  const id = String(athlete.id);
  let stats;
  try {
    stats = await fetchJson(athleteStatsUrl(id));
  } catch (err) {
    if (err.status === 404) {
      // No college stats yet (e.g. a true freshman before their first game).
      stats = { teams: {}, categories: [] };
    } else {
      throw err;
    }
  }
  const teamsBySlug = stats.teams || {};

  const averagesCategory = stats.categories?.find((c) => c.name === "averages");
  const totalsCategory = stats.categories?.find((c) => c.name === "totals");
  const { rows: averagesRows, labels: averagesLabels } = rowsFromCategory(averagesCategory, teamsBySlug);
  const { rows: totalsRows } = rowsFromCategory(totalsCategory, teamsBySlug);

  averagesRows.sort((a, b) => a.seasonYear - b.seasonYear);

  const existingPath = path.join(PLAYERS_DIR, `${id}.json`);
  const existing = readExisting(existingPath);

  const seasons = averagesRows.map((row) => {
    const totalsRow = totalsRows.find((t) => t.year === row.year && t.teamSlug === row.teamSlug);
    const fresh = {
      playerId: id,
      year: row.year,
      team: row.team,
      stats: row.values,
      totals: totalsRow ? totalsRow.values : {},
    };
    const merged = mergeSeason(fresh, existing?.seasons);
    delete merged.playerId;
    return merged;
  });

  const career = computeCareerStats(totalsRows, averagesRows);

  const headshot = athlete.headshot?.href || existing?.headshot || "";

  return {
    id,
    name: athlete.fullName,
    position: athlete.position?.abbreviation || "",
    jersey: athlete.jersey || "",
    classYear: athlete.experience?.displayValue || "",
    headshot,
    statLabels: averagesLabels,
    seasons,
    career: {
      stats: career,
      playTypes: existing?.career?.playTypes ?? [],
      shotTypes: existing?.career?.shotTypes ?? [],
      shotDistances: existing?.career?.shotDistances ?? [],
      driveDirection: existing?.career?.driveDirection ?? [],
      ...(existing?.career?.playTypesNote ? { playTypesNote: existing.career.playTypesNote } : {}),
    },
    aiReview: existing?.aiReview ?? {
      strengths: { bestArea: "", bestPlayType: "", overallStrength: "" },
      weaknesses: { worstArea: "", worstPlayType: "", overallWeakness: "", developmentTarget: "" },
    },
    coachReview: existing?.coachReview ?? "",
  };
}

async function main() {
  fs.mkdirSync(PLAYERS_DIR, { recursive: true });

  const targets = JSON.parse(fs.readFileSync(PLAYERS_CONFIG_PATH, "utf8"));
  console.log(`Resolving ${targets.length} players from scraper/players.json...`);

  const rosterEntries = [];
  const keptIds = new Set();

  for (const target of targets) {
    try {
      const athlete = await resolveAthlete(target);
      if (target.jersey) athlete.jersey = target.jersey;
      if (target.classYear) athlete.experience = { displayValue: target.classYear };
      if (target.position) athlete.position = { abbreviation: target.position };
      console.log(`  - ${athlete.fullName} (${athlete.id})`);
      const player = await buildPlayer(athlete);
      fs.writeFileSync(path.join(PLAYERS_DIR, `${player.id}.json`), JSON.stringify(player, null, 2));
      keptIds.add(player.id);
      rosterEntries.push({
        id: player.id,
        name: player.name,
        position: player.position,
        jersey: player.jersey,
        classYear: player.classYear,
        headshot: player.headshot,
      });
    } catch (err) {
      console.error(`    failed (${target.name}): ${err.message}`);
    }
  }

  // Remove player files that are no longer in scraper/players.json.
  for (const file of fs.readdirSync(PLAYERS_DIR)) {
    const id = file.replace(/\.json$/, "");
    if (file.endsWith(".json") && !keptIds.has(id)) {
      fs.unlinkSync(path.join(PLAYERS_DIR, file));
      console.log(`  removed stale data/players/${file} (no longer in players.json)`);
    }
  }

  rosterEntries.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(path.join(DATA_DIR, "roster.json"), JSON.stringify(rosterEntries, null, 2));

  console.log(`\nWrote data/roster.json and ${rosterEntries.length} player file(s) in data/players/.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
