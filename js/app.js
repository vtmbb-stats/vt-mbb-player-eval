// Player Evaluation SPA: roster menu of tabs -> per-player breakdown.
// All content is driven by data/roster.json + data/players/<id>.json,
// written/updated by scraper/fetch-stats.js plus manual edits.

const tabBar = document.getElementById("tab-bar");
const app = document.getElementById("app");

let roster = [];
const playerCache = new Map();

// Curated column set shown in the career-by-season table. Season values
// come from that season's `stats` (ESPN per-game averages); the career
// row pulls from the separately-computed `career.stats` shape.
const TABLE_COLUMNS = [
  { label: "GP", season: (s) => s.stats.gamesPlayed, career: (c) => c.gamesPlayed },
  { label: "GS", season: (s) => s.stats.gamesStarted, career: (c) => c.gamesStarted },
  { label: "MIN", season: (s) => s.stats.avgMinutes, career: () => "—" },
  { label: "PTS", season: (s) => s.stats.avgPoints, career: (c) => c.perGame.points },
  { label: "REB", season: (s) => s.stats.avgRebounds, career: (c) => c.perGame.totalRebounds },
  { label: "AST", season: (s) => s.stats.avgAssists, career: (c) => c.perGame.assists },
  { label: "STL", season: (s) => s.stats.avgSteals, career: (c) => c.perGame.steals },
  { label: "BLK", season: (s) => s.stats.avgBlocks, career: (c) => c.perGame.blocks },
  { label: "FG%", season: (s) => s.stats.fieldGoalPct, career: (c) => c.totals.fieldGoalPct },
  { label: "3P%", season: (s) => s.stats.threePointFieldGoalPct, career: (c) => c.totals.threePointFieldGoalPct },
  { label: "FT%", season: (s) => s.stats.freeThrowPct, career: (c) => c.totals.freeThrowPct },
];

// Compact stat strip shown inside each season breakdown block.
const SEASON_STRIP = [
  { label: "MIN", key: "avgMinutes" },
  { label: "PTS", key: "avgPoints" },
  { label: "REB", key: "avgRebounds" },
  { label: "AST", key: "avgAssists" },
  { label: "STL", key: "avgSteals" },
  { label: "BLK", key: "avgBlocks" },
  { label: "FG%", key: "fieldGoalPct" },
  { label: "3P%", key: "threePointFieldGoalPct" },
  { label: "FT%", key: "freeThrowPct" },
];

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function val(v, fallback = "—") {
  return v === undefined || v === null || v === "" ? fallback : v;
}

function initials(name) {
  return String(name).split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function avatarHtml(name, headshot, className) {
  if (headshot) {
    return `<img class="${className}" src="${escapeHtml(headshot)}" alt="" onerror="this.outerHTML='<div class=&quot;${className} avatar-fallback&quot;>${escapeHtml(initials(name))}</div>'">`;
  }
  return `<div class="${className} avatar-fallback">${escapeHtml(initials(name))}</div>`;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return res.json();
}

async function getPlayer(id) {
  if (playerCache.has(id)) return playerCache.get(id);
  const player = await fetchJson(`data/players/${id}.json`);
  playerCache.set(id, player);
  return player;
}

function setActiveTab(view) {
  tabBar.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
}

function buildTabs() {
  roster.forEach((p) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab";
    btn.dataset.view = p.id;
    btn.textContent = p.jersey ? `#${p.jersey} ${p.name}` : p.name;
    btn.addEventListener("click", () => {
      location.hash = `player/${p.id}`;
    });
    tabBar.appendChild(btn);
  });
}

function renderRosterGrid() {
  setActiveTab("roster");
  const grid = document.createElement("div");
  grid.className = "roster-grid";
  roster.forEach((p) => {
    const card = document.createElement("div");
    card.className = "player-card";
    card.innerHTML = `
      ${avatarHtml(p.name, p.headshot, "card-avatar")}
      <div class="name">${escapeHtml(p.name)}</div>
      <div class="meta">${escapeHtml(p.position || "")}${p.jersey ? ` · #${escapeHtml(p.jersey)}` : ""}${p.classYear ? ` · ${escapeHtml(p.classYear)}` : ""}</div>
    `;
    card.addEventListener("click", () => {
      location.hash = `player/${p.id}`;
    });
    grid.appendChild(card);
  });
  app.innerHTML = "";
  app.appendChild(grid);
}

function statTile(label, value) {
  return `<div class="stat"><span class="val">${escapeHtml(val(value))}</span><span class="label">${escapeHtml(label)}</span></div>`;
}

// Per-stat trend arrow comparing this season's value to the same stat the
// prior season, rather than one blanket improved/declined verdict.
function statTileWithTrend(label, value, prevValue) {
  const cur = parseFloat(value);
  const prev = parseFloat(prevValue);
  let arrow = "";
  if (!Number.isNaN(cur) && !Number.isNaN(prev)) {
    if (cur > prev) arrow = `<span class="stat-trend up">▲</span>`;
    else if (cur < prev) arrow = `<span class="stat-trend down">▼</span>`;
    else arrow = `<span class="stat-trend same">–</span>`;
  }
  return `<div class="stat"><span class="val">${escapeHtml(val(value))}${arrow}</span><span class="label">${escapeHtml(label)}</span></div>`;
}

function renderCareerTable(player) {
  const rows = player.seasons.map((s) => {
    const cells = TABLE_COLUMNS.map((col) => `<td>${escapeHtml(val(col.season(s)))}</td>`).join("");
    return `<tr><td>${escapeHtml(s.year)}<div class="team">${escapeHtml(s.team)}</div></td>${cells}</tr>`;
  }).join("");

  const careerCells = TABLE_COLUMNS.map((col) => `<td>${escapeHtml(val(col.career(player.career.stats)))}</td>`).join("");
  const careerRow = player.seasons.length
    ? `<tr class="career-row"><td>Career</td>${careerCells}</tr>`
    : "";

  const header = `<tr><th>Season</th>${TABLE_COLUMNS.map((c) => `<th>${c.label}</th>`).join("")}</tr>`;

  if (!player.seasons.length) {
    return `<div class="placeholder">No college stats yet — likely a true freshman awaiting their first game.</div>`;
  }

  return `
    <div class="stat-table-wrap">
      <table class="stat-table">
        <thead>${header}</thead>
        <tbody>${rows}${careerRow}</tbody>
      </table>
    </div>
  `;
}

function statEntryLine(item) {
  return `${item.freq !== undefined ? `Freq ${escapeHtml(item.freq)}` : ""}${item.ppp !== undefined ? ` · PPP ${escapeHtml(item.ppp)}` : ""}${item.pps !== undefined ? ` · PPS ${escapeHtml(item.pps)}` : ""}${item.fgPct !== undefined ? ` · FG% ${escapeHtml(item.fgPct)}` : ""}${item.percentile !== undefined ? ` · ${escapeHtml(item.percentile)}th pct` : ""}${item.rating ? ` · ${escapeHtml(item.rating)}` : ""}`;
}

// Renders one titled group of stat entries (play types, shot types, shot
// distances, drive direction, ...). Any entry can carry a `subTypes` array
// (e.g. High/Left/Right P&R) straight from Synergy's expandable sub-rows,
// rendered as a native <details> disclosure so it stays compact by default.
function renderStatGroup(title, items, { placeholderIfEmpty = false } = {}) {
  if (!items || !items.length) {
    if (!placeholderIfEmpty) return "";
    return `<div class="placeholder">Play-type data not added yet.</div>`;
  }
  const chips = items.map((item) => {
    const header = `
      <span class="pt-name">${escapeHtml(item.type)}</span>
      <span class="pt-stats">${statEntryLine(item)}</span>
    `;
    if (!item.subTypes || !item.subTypes.length) {
      return `<div class="play-type-chip">${header}</div>`;
    }
    const subRows = item.subTypes.map((sub) => `
      <li>
        <span class="pt-name">${escapeHtml(sub.type)}</span>
        <span class="pt-stats">${statEntryLine(sub)}</span>
      </li>
    `).join("");
    return `
      <details class="play-type-chip play-type-chip-expandable">
        <summary>${header}</summary>
        <ul class="pt-subtypes">${subRows}</ul>
      </details>
    `;
  }).join("");

  return `
    <div class="stat-group">
      ${title ? `<div class="stat-group-title">${escapeHtml(title)}</div>` : ""}
      <div class="play-type-list">${chips}</div>
    </div>
  `;
}

function metricValue(item) {
  const raw = item.pps !== undefined ? item.pps : item.ppp;
  const num = parseFloat(raw);
  return { raw, num: Number.isNaN(num) ? -Infinity : num };
}

function sortByMetricDesc(items) {
  return [...items].sort((a, b) => metricValue(b).num - metricValue(a).num);
}

// Career stat groups render as a table sorted by points per shot/possession
// (highest first), rather than the chip layout used for single seasons —
// the point of the career view is ranking what's most efficient overall.
function renderStatTable(title, items, { placeholderIfEmpty = false } = {}) {
  if (!items || !items.length) {
    if (!placeholderIfEmpty) return "";
    return `<div class="placeholder">Play-type data not added yet.</div>`;
  }
  const metricLabel = items.some((i) => i.pps !== undefined) ? "PPS" : "PPP";
  const showFgPct = items.some((i) => i.fgPct !== undefined);

  const typeCell = (item) => {
    if (!item.subTypes || !item.subTypes.length) {
      return escapeHtml(item.type);
    }
    const subRows = sortByMetricDesc(item.subTypes).map((sub) => `
      <li>
        <span class="pt-name">${escapeHtml(sub.type)}</span>
        <span class="pt-stats">Freq ${escapeHtml(sub.freq ?? "—")} · ${metricLabel} ${escapeHtml(metricValue(sub).raw ?? "—")}${sub.fgPct !== undefined ? ` · FG% ${escapeHtml(sub.fgPct)}` : ""}</span>
      </li>
    `).join("");
    return `
      <details class="stat-table-expandable">
        <summary>${escapeHtml(item.type)}</summary>
        <ul class="pt-subtypes">${subRows}</ul>
      </details>
    `;
  };

  const rows = sortByMetricDesc(items).map((item) => `
    <tr>
      <td>${typeCell(item)}</td>
      <td>${escapeHtml(item.freq ?? "—")}</td>
      <td>${escapeHtml(metricValue(item).raw ?? "—")}</td>
      ${showFgPct ? `<td>${escapeHtml(item.fgPct ?? "—")}</td>` : ""}
    </tr>
  `).join("");

  return `
    <div class="stat-group">
      ${title ? `<div class="stat-group-title">${escapeHtml(title)}</div>` : ""}
      <div class="stat-table-wrap">
        <table class="stat-table career-stat-table">
          <thead><tr><th>Type</th><th>Freq</th><th>${metricLabel}</th>${showFgPct ? "<th>FG%</th>" : ""}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderShotChart(path, label) {
  return `
    <div class="shot-chart">
      <img src="${escapeHtml(path)}" alt="${escapeHtml(label)} shot chart"
        onerror="this.closest('.shot-chart').innerHTML='&lt;div class=&quot;placeholder&quot;&gt;Shot chart not added yet.&lt;/div&gt;'">
    </div>
  `;
}

function renderSeasonBlock(season, index, seasons) {
  const prevSeason = index > 0 ? seasons[index - 1] : null;
  const strip = SEASON_STRIP.map((s) => statTileWithTrend(s.label, season.stats[s.key], prevSeason?.stats?.[s.key])).join("");
  return `
    <div class="season-block">
      <div class="season-block-header">
        <h3>${escapeHtml(season.year)} <span class="team">${escapeHtml(season.team)}</span></h3>
      </div>
      <div class="season-body">
        ${renderShotChart(season.shotChart, season.year)}
        <div>
          <div class="season-stat-line">${strip}</div>
          ${renderStatGroup("Play Types", season.playTypes, { placeholderIfEmpty: true })}
          ${renderStatGroup("Shot Types", season.shotTypes)}
          ${renderStatGroup("Shot Distances", season.shotDistances)}
          ${renderStatGroup("Drive Direction", season.driveDirection)}
          ${season.trend?.note ? `<div class="trend-note">${escapeHtml(season.trend.note)}</div>` : ""}
        </div>
      </div>
    </div>
  `;
}

// My (AI-drafted) read on the player — kept separate from the coach's own
// notes below it so the two opinions stay distinguishable rather than blended.
function renderAiReview(player) {
  const s = player.aiReview?.strengths || {};
  const w = player.aiReview?.weaknesses || {};
  const hasStrength = s.bestArea || s.bestPlayType || s.overallStrength;
  const hasWeakness = w.worstArea || w.worstPlayType || w.overallWeakness || w.developmentTarget;

  return `
    <div class="sw-grid">
      <div class="sw-card strength">
        <h4>Strength</h4>
        ${hasStrength ? `
          <dl>
            <dt>Best area</dt><dd>${escapeHtml(val(s.bestArea))}</dd>
            <dt>Best play type</dt><dd>${escapeHtml(val(s.bestPlayType))}</dd>
            <dt>Overall strength</dt><dd>${escapeHtml(val(s.overallStrength))}</dd>
          </dl>` : `<div class="placeholder">Not added yet.</div>`}
      </div>
      <div class="sw-card weakness">
        <h4>Development Target</h4>
        ${hasWeakness ? `
          <dl>
            <dt>Worst area</dt><dd>${escapeHtml(val(w.worstArea))}</dd>
            <dt>Worst play type</dt><dd>${escapeHtml(val(w.worstPlayType))}</dd>
            <dt>Overall weakness</dt><dd>${escapeHtml(val(w.overallWeakness))}</dd>
            <dt>Development target</dt><dd>${escapeHtml(val(w.developmentTarget))}</dd>
          </dl>` : `<div class="placeholder">Not added yet.</div>`}
      </div>
    </div>
  `;
}

// The coach's own notes, kept as freeform text below the AI review.
function renderCoachReview(player) {
  const text = player.coachReview || "";
  if (!text.trim()) {
    return `<div class="placeholder">Coach review not added yet.</div>`;
  }
  return `<div class="coach-review-text">${escapeHtml(text)}</div>`;
}

async function renderPlayerPage(id) {
  setActiveTab(id);
  app.innerHTML = `<p class="loading">Loading player…</p>`;
  let player;
  try {
    player = await getPlayer(id);
  } catch (err) {
    app.innerHTML = `<p class="error">Couldn't load this player's data.</p>`;
    return;
  }

  app.innerHTML = `
    <a class="back-link" id="back-link">← Back to Roster</a>

    <div class="player-header">
      ${avatarHtml(player.name, player.headshot, "header-avatar")}
      <div>
        <h2>${escapeHtml(player.name)}</h2>
        <div class="meta">${escapeHtml(player.position || "")}${player.jersey ? ` · #${escapeHtml(player.jersey)}` : ""}${player.classYear ? ` · ${escapeHtml(player.classYear)}` : ""}</div>
      </div>
    </div>

    <div class="section">
      <h3 class="section-title">Career Stats by Season</h3>
      ${renderCareerTable(player)}
    </div>

    <div class="section">
      <h3 class="section-title">Career Play Types</h3>
      ${player.career.playTypesNote ? `<div class="career-note">${escapeHtml(player.career.playTypesNote)}</div>` : ""}
      ${renderStatTable("Play Types", player.career.playTypes, { placeholderIfEmpty: true })}
      ${renderStatTable("Shot Types", player.career.shotTypes)}
      ${renderStatTable("Shot Distances", player.career.shotDistances)}
      ${renderStatTable("Drive Direction", player.career.driveDirection)}
    </div>

    <div class="section">
      <h3 class="section-title">Season Breakdowns</h3>
      ${player.seasons.length
        ? player.seasons.map((s, i) => renderSeasonBlock(s, i, player.seasons)).join("")
        : `<div class="placeholder">No season breakdowns yet.</div>`}
    </div>

    <div class="section">
      <h3 class="section-title">AI Review</h3>
      ${renderAiReview(player)}
    </div>

    <!-- Coach Review section hidden for now (data/rendering still intact — see renderCoachReview) -->
  `;

  document.getElementById("back-link").addEventListener("click", () => {
    location.hash = "";
  });
}

function route() {
  const hash = location.hash.replace(/^#/, "");
  const match = hash.match(/^player\/(.+)$/);
  if (match) {
    renderPlayerPage(match[1]);
  } else {
    renderRosterGrid();
  }
}

async function init() {
  try {
    roster = await fetchJson("data/roster.json");
  } catch (err) {
    app.innerHTML = `<p class="error">Couldn't load the roster. Run the scraper (scraper/fetch-stats.js) to generate data/roster.json.</p>`;
    return;
  }
  roster.sort((a, b) => (parseInt(a.jersey, 10) || 0) - (parseInt(b.jersey, 10) || 0));
  buildTabs();
  window.addEventListener("hashchange", route);
  route();
}

init();
