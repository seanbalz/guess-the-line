import { TeamMark } from "./TeamMark.jsx";
import { teamName } from "./Matchup.jsx";
import { fmtNum } from "../format.js";
import { pickComparison } from "./pickScorecard.js";
import "./pickScorecard.css";

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const signed = (value) => (value < 0 ? `−${fmtNum(-value)}` : fmtNum(value));

/** Pick-focused saved Guess presentation. Never use for a sportsbook ticket or paper bet result. */
export function PickScorecard({
  game,
  mode,
  guess,
  line,
  points,
  status = "Locked in",
  own = true,
  hidden = false,
  comparisonLabel = "Saved scoring line",
}) {
  const total = mode === "guess_total";
  // Defence in depth: a withheld row cannot acquire values from a stale caller.
  const g = !hidden && finite(guess) ? guess : null,
    l = !hidden && finite(line) ? line : null;
  const p = !hidden && finite(points) ? points : null,
    chart = pickComparison(g, l);
  const home = total || g === null || g <= 0;
  const code = home ? game?.homeCode : game?.awayCode,
    opponent = home ? game?.awayCode : game?.homeCode;
  const name = teamName(code),
    parts = name.split(" "),
    nickname = parts.pop(),
    location = parts.join(" ");
  const chartCaption = total
    ? "Combined points"
    : `${teamName(game?.homeCode)} signed spread`;
  const share = p === null ? 0 : Math.max(0, Math.min(1, p / 10));
  const statusWord = hidden ? "Hidden" : status;
  return (
    <article
      className="gx-pick-scorecard"
      aria-label={`${total ? "Guess the Total" : "Guess the Spread"} scorecard`}
      data-pick-scorecard=""
    >
      <div className="gx-pc-top">
        <div className="gx-vstack gx-gap-8">
          <h3 className="gx-t-strong">
            {total ? "Guess the Total" : "Guess the Spread"}
          </h3>
          <span className="gx-pc-status">{statusWord}</span>
        </div>
        <div
          className="gx-pc-points"
          role="img"
          aria-label={
            p === null ? "Points unavailable" : `${fmtNum(p)} of 10 points`
          }
        >
          <svg viewBox="0 0 76 76" aria-hidden="true">
            <circle cx="38" cy="38" r="33" />
            <circle
              className="gx-pc-fill"
              cx="38"
              cy="38"
              r="33"
              pathLength="100"
              strokeDasharray={`${share * 100} 100`}
            />
          </svg>
          <span>
            <strong>{p === null ? "—" : fmtNum(p)} / 10</strong>
            <small>POINTS</small>
          </span>
        </div>
      </div>
      <div className="gx-pc-opponent">
        <TeamMark code={opponent} size={32} decorative />
        <div>
          <span className="gx-t-meta gx-c-2">
            {total ? "Away team" : "Opponent"}
          </span>
          <strong>{teamName(opponent)}</strong>
        </div>
      </div>
      <div className="gx-pc-pick">
        <div className="gx-pc-team">
          <TeamMark code={code} size={48} decorative />
          <strong>{nickname}</strong>
          {location && <span className="gx-t-meta gx-c-2">{location}</span>}
        </div>
        <div className="gx-pc-value">
          <span className="gx-t-meta gx-c-2">
            {own ? "Your saved guess" : "Saved guess"}
          </span>
          <strong>
            {g === null
              ? "—"
              : total
                ? fmtNum(g)
                : g === 0
                  ? "Pick'em"
                  : `−${fmtNum(Math.abs(g))}`}
          </strong>
          {total && <span className="gx-t-meta gx-c-2">Combined points</span>}
        </div>
      </div>
      <div className="gx-pc-stats">
        <div>
          <span className="gx-t-meta gx-c-2">{comparisonLabel}</span>
          <strong>{l === null ? "—" : signed(l)}</strong>
          <span className="gx-t-meta gx-c-2">
            {total ? "Combined points" : teamName(game?.homeCode)}
          </span>
        </div>
        <div>
          <span className="gx-t-meta gx-c-2">Point difference</span>
          <strong>{chart ? fmtNum(chart.difference) : "—"}</strong>
          <span className="gx-t-meta gx-c-2">
            {chart
              ? "from saved line"
              : hidden
                ? "Hidden"
                : "Comparison unavailable"}
          </span>
        </div>
      </div>
      {chart ? (
        <figure className="gx-pc-chart" aria-label="Saved guess comparison">
          <figcaption className="gx-t-meta gx-c-2">
            {chartCaption} · {signed(chart.from)} to {signed(chart.to)}
          </figcaption>
          <div
            className="gx-pc-axis"
            role="img"
            aria-label={`Saved line ${signed(l)}, saved guess ${signed(g)}, difference ${fmtNum(chart.difference)} points on a scale from ${signed(chart.from)} to ${signed(chart.to)}`}
          >
            <span className="gx-pc-axis-track" />
            <span
              className="gx-pc-axis-gap"
              style={{
                left: `${Math.min(chart.guessAt, chart.lineAt)}%`,
                width: `${Math.abs(chart.guessAt - chart.lineAt)}%`,
              }}
            />
            <span
              className="gx-pc-axis-reference"
              style={{ left: `${chart.lineAt}%` }}
            />
            <span
              className="gx-pc-axis-guess"
              style={{ left: `${chart.guessAt}%` }}
            />
          </div>
          <div className="gx-pc-chart-key gx-t-meta">
            <span>● Saved line {signed(l)}</span>
            <span>◆ Guess {signed(g)}</span>
          </div>
        </figure>
      ) : null}
    </article>
  );
}
