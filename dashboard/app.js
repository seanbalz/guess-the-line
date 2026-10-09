"use strict";

const $ = (id) => document.getElementById(id);
const formatNumber = (value) => Number(value.toFixed(2)).toString();
const signed = (value) => `${value > 0 ? "+" : ""}${formatNumber(value)}`;
const pacific = (value) => new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short",
}).format(new Date(value)) + " PT";
let audit = null;

function row(parent, values) {
  const tr = document.createElement("tr");
  for (const value of values) {
    const td = document.createElement("td");
    td.textContent = value;
    tr.append(td);
  }
  parent.append(tr);
  return tr;
}

function drawChart(snapshots) {
  const svg = $("chart");
  svg.querySelectorAll("polyline, circle, text").forEach((node) => node.remove());
  const ns = "http://www.w3.org/2000/svg";
  const start = Date.parse(snapshots[0].recorded_at);
  const span = Date.parse(snapshots.at(-1).recorded_at) - start || 1;
  const max = snapshots.at(-1).max_points;
  const points = snapshots.map((item) => [40 + (Date.parse(item.recorded_at) - start) / span * 620,
    168 - item.total_points / max * 120]);
  const line = document.createElementNS(ns, "polyline");
  line.setAttribute("points", points.map((p) => p.join(",")).join(" "));
  line.setAttribute("class", "trend");
  svg.append(line);
  points.forEach(([x, y], index) => {
    const dot = document.createElementNS(ns, "circle");
    dot.setAttribute("cx", x); dot.setAttribute("cy", y); dot.setAttribute("r", 5);
    dot.setAttribute("class", index === points.length - 1 ? "dot latest" : "dot");
    const title = document.createElementNS(ns, "title");
    title.textContent = `${pacific(snapshots[index].recorded_at)}: ${formatNumber(snapshots[index].total_points)}`;
    dot.append(title); svg.append(dot);
    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", x); label.setAttribute("y", y - 16);
    label.setAttribute("text-anchor", "middle"); label.setAttribute("class", "chart-label");
    label.textContent = formatNumber(snapshots[index].total_points); svg.append(label);
  });
}

function render(data) {
  const latest = data.latest;
  $("player").textContent = data.config.player;
  $("score").textContent = formatNumber(latest.total_points);
  $("maximum").textContent = `of ${latest.max_points} possible`;
  $("delta").textContent = latest.total_point_delta === undefined ? "—" : signed(latest.total_point_delta);
  $("priced").textContent = `${latest.games.length} / ${latest.max_points / 10}`;
  $("captured").textContent = `${pacific(latest.recorded_at)} · ${latest.time_basis} time`;
  $("published").textContent = pacific(latest.published_at);
  $("source").textContent = latest.source;
  $("source").href = latest.source_url;
  $("freshness").textContent = `${data.page_quote_stale ? "STALE" : "Saved page quote"} · ${data.page_quote_age_hours.toFixed(1)} hours old at refresh`;
  $("freshness").className = data.page_quote_stale ? "pending" : "";
  $("verification").textContent = "Stored scores and changes checked against repository predictions. Source pages, schedule, and individual sportsbook timestamps have not been independently reverified by this viewer.";
  $("games").replaceChildren();
  for (const game of latest.games) {
    const tr = row($("games"), [game.matchup, signed(game.predicted_home_spread), signed(game.consensus_home_spread),
      formatNumber(game.points), game.point_delta === undefined ? "—" : signed(game.point_delta)]);
    tr.lastElementChild.className = game.point_delta > 0 ? "positive" : game.point_delta < 0 ? "negative" : "";
  }
  $("history").replaceChildren();
  for (const item of data.snapshots) {
    row($("history"), [pacific(item.recorded_at), item.time_basis, formatNumber(item.total_points),
      item.total_point_delta === undefined ? "—" : signed(item.total_point_delta)]);
  }
  $("conversation").href = data.config.source_conversation.url;
  $("conversation").textContent = data.config.source_conversation.title;
  $("repository").href = data.config.repository;
  drawChart(data.snapshots);
  $("content").hidden = false;
}

async function refresh() {
  $("refresh").disabled = true;
  $("export").disabled = true;
  $("content").hidden = true;
  audit = null;
  $("message").className = "";
  $("message").textContent = "Checking saved repository snapshots…";
  try {
    const response = await fetch("/api/snapshots", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Saved snapshots unavailable");
    render(data);
    audit = data;
    $("export").disabled = false;
    $("message").textContent = `Loaded ${data.snapshots.length} saved snapshots. Last checked ${pacific(data.checked_at)}. Refresh reads local files; it does not fetch new market lines.`;
  } catch (error) {
    $("content").hidden = true;
    $("message").className = "error";
    $("message").textContent = `Saved data unavailable: ${error.message}. Start the local viewer with python3 scripts/snapshots.py serve. No fallback scores are displayed.`;
  } finally {
    $("refresh").disabled = false;
  }
}

$("refresh").addEventListener("click", refresh);
$("export").addEventListener("click", () => {
  if (!audit) return;
  const blob = new Blob([JSON.stringify(audit, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${audit.config.season}-week-${String(audit.config.week).padStart(2, "0")}-saved-audit.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
refresh();
