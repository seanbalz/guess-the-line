import { useEffect, useRef, useState } from "react";
import {
  Button,
  Icon,
  InfoButton,
  Segmented,
  TeamMark,
  teamName,
} from "../ui/index.js";
import { TrendDetail } from "../charts/TrendDetail.jsx";
import { fmtNum } from "../format.js";
import { pickComparison } from "../ui/pickScorecard.js";
import { gapRecordView } from "./gapRecordView.js";
import { useGapPeriod } from "./useGapPeriod.js";
import { GapPeriodControl } from "./GapPeriodControl.jsx";
import { Skeleton } from "../ui/Skeleton.jsx";
import "./gapRecord.css";
import { GAP_WIN_UNITS } from "../../../../shared/recommended-bets.mjs";
import { TRENDS_LINKS } from "../info.js";
import { GAP_SCALE_NOTES } from "../../../../shared/nfl-gap-scale.mjs";

const outcomes = {
  win: ["W", "Win"],
  loss: ["L", "Loss"],
  push: ["P", "Push"],
};
const amount = (n) =>
  `${n < 0 ? "−" : n > 0 ? "+" : ""}${Math.abs(n).toFixed(2)}U`;
const tally = (s) => `${s.wins}–${s.losses}–${s.pushes}`;
const selection = (row, value) =>
  row.market === "total"
    ? `${fmtNum(value)} total points`
    : value === 0
      ? "Pick'em"
      : `${teamName(value < 0 ? row.game?.homeCode : row.game?.awayCode)} −${fmtNum(Math.abs(value))}`;
function Matchup({ game }) {
  return (
    <div
      className="gx-gap-matchup"
      aria-label={`${teamName(game?.awayCode)} at ${teamName(game?.homeCode)}`}
    >
      <span>
        <TeamMark code={game?.awayCode} size={48} decorative />
        <strong>{teamName(game?.awayCode)}</strong>
      </span>
      <span className="gx-t-meta gx-c-2">at</span>
      <span>
        <TeamMark code={game?.homeCode} size={48} decorative />
        <strong>{teamName(game?.homeCode)}</strong>
      </span>
    </div>
  );
}
function Pair({ row }) {
  return (
    <div className="gx-gap-pair">
      <div>
        <small>Closing reference</small>
        <strong>{selection(row, row.line)}</strong>
      </div>
      <div>
        <small>Your locked guess</small>
        <strong>{selection(row, row.guess)}</strong>
      </div>
    </div>
  );
}

/** D-77 paper record. Existing reader, week and market controls remain authoritative. */
export function GapRecord(props) {
  const period = useGapPeriod(props);
  const { week } = props;
  const record = period.record ?? { wins: 0, losses: 0, pushes: 0, netUnits: 0, roi: null,
    favorable: { wins: 0, losses: 0, pushes: 0 }, graded: [], even: 0, notGraded: { noFinal: 0, noLine: 0 } };
  const board = period.board ?? { games: [] };
  const [tier, setTier] = useState("all"),
    [limit, setLimit] = useState(6),
    [selected, setSelected] = useState(null);
  const root = useRef(null),
    restore = useRef(null),
    buttons = useRef(new Map()),
    backButton = useRef(null);
  const view = gapRecordView(record, board, tier),
    s = view.summary,
    chosen = view.rows.find((row) => row.key === selected);
  const selectionPresent = Boolean(chosen);
  useEffect(() => {
    if (selected && !selectionPresent) setSelected(null);
  }, [selected, selectionPresent]);
  const waiting = record.notGraded.noFinal + record.notGraded.noLine,
    decided = s.wins + s.losses;
  const rate = decided ? `${((s.wins / decided) * 100).toFixed(1)}%` : "—";
  function open(row) {
    restore.current = { key: row.key, scroll: window.scrollY };
    setSelected(row.key);
    requestAnimationFrame(() => {
      backButton.current?.focus({ preventScroll: true });
      root.current?.scrollIntoView({ block: "start" });
    });
  }
  function back() {
    setSelected(null);
    requestAnimationFrame(() => {
      buttons.current.get(restore.current?.key)?.focus({ preventScroll: true });
      if (restore.current) window.scrollTo(0, restore.current.scroll);
    });
  }
  const about = (
    <InfoButton
      title="About your gaps"
      body={[
        "Each locked guess that differed from the last qualifying three-book line before kickoff, graded on the side your guess favored: a paper record, not bets placed. Drafts, sit-outs, even guesses and absent evidence do not become graded gaps.",
        `1U per gap at the standard −110 convention, not actual sportsbook prices or placed bets. Win rate is wins divided by wins plus losses. ${waiting} not graded yet.`,
        ...GAP_SCALE_NOTES,
        "The historical Large gaps filter reclassifies past gaps with this fixed baseline; the outcomes, guesses and lines stay unchanged. It is not a point-in-time strategy backtest.",
      ]}
      links={TRENDS_LINKS}
    />
  );
  const line = {
    values: [0, ...view.points],
    formatValue: amount,
    start: "Start",
    end: `Gap ${view.rows.length}`,
    label: `Cumulative paper units at standard minus 110 for ${view.rows.length} graded gaps`,
    headline: {
      value: amount(s.netUnits),
      sub: `${view.rows.length} graded gaps · paper −110`,
    },
    tiles: [
      { label: "Record", value: tally(s), sub: "W–L–P" },
      {
        label: "Paper ROI",
        value: s.roi == null ? "—" : `${fmtNum(s.roi)}%`,
        sub: "Standard −110",
      },
      { label: "Gaps", value: view.rows.length, sub: "Selected filter" },
    ],
    tip: (i) => ({
      value: amount(i ? view.points[i - 1] : 0),
      label: i
        ? `Gap ${i} · ${view.rows[i - 1].market} · ${outcomes[view.rows[i - 1].outcome][1]}`
        : "Start · no gaps graded",
    }),
  };
  return (
    <section
      className="gx-gap-record"
      ref={root}
      aria-label="Your gaps vs. closing lines"
      data-paper-negative={s.netUnits < 0}
    >
      {chosen ? (
        <div className="gx-vstack gx-gap-16">
          <button
            type="button"
            className="gx-btn gx-btn--ghost"
            ref={backButton}
            onClick={back}
          >
            <Icon icon="chevronLeft" size={20} />
            Back to gaps
          </button>
          <article className="gx-card gx-gap-detail">
            <div className="gx-between gx-gap-8">
              <h3 className="gx-t-strong">
                {chosen.market === "spread" ? "Spread" : "Total"} · {chosen.season ?? props.season} Week {chosen.week ?? week}
              </h3>
              {about}
            </div>
            <Matchup game={chosen.game} />
            <span className="gx-gap-outcome" data-outcome={chosen.outcome}>
              {outcomes[chosen.outcome][1]} · paper result
            </span>
            <Pair row={chosen} />
            <GapAxis row={chosen} />
            <div className="gx-gap-detail-stats">
              <p>
                <span>Gap side</span>
                <strong>
                  {chosen.market === "total"
                    ? `${chosen.side === "over" ? "Over" : "Under"} ${fmtNum(chosen.line)}`
                    : `${teamName(chosen.side === "home" ? chosen.game?.homeCode : chosen.game?.awayCode)} ${chosen.side === "home" ? (chosen.line > 0 ? "+" : "") : -chosen.line > 0 ? "+" : ""}${fmtNum(chosen.side === "home" ? chosen.line : -chosen.line)}`}
                </strong>
              </p>
              <p>
                <span>Point difference</span>
                <strong>{fmtNum(Math.abs(chosen.guess - chosen.line))}</strong>
              </p>
              <p>
                <span>Paper units · −110</span>
                <strong>
                  {amount(
                    chosen.outcome === "win"
                      ? GAP_WIN_UNITS
                      : chosen.outcome === "loss"
                        ? -1
                        : 0,
                  )}
                </strong>
              </p>
            </div>
            <div className="gx-gap-final">
              <h4 className="gx-t-strong">Recorded final</h4>
              <p>
                {teamName(chosen.game?.awayCode)}{" "}
                <strong>{chosen.game?.final?.away ?? "—"}</strong>
              </p>
              <p>
                {teamName(chosen.game?.homeCode)}{" "}
                <strong>{chosen.game?.final?.home ?? "—"}</strong>
              </p>
            </div>
          </article>
        </div>
      ) : null}
      <div className="gx-gap-overview" hidden={!!chosen}>
        <div className="gx-between gx-gap-8">
          <h3 className="gx-t-strong">Your gaps · {period.title}</h3>
          {period.status === 'ready' && about}
        </div>
        <GapPeriodControl period={period.period} weeks={period.weeks} range={period.range}
          onPeriod={period.setPeriod} onApply={period.applyRange}/>
        <p className="gx-t-meta gx-c-2">{period.coverage}</p>
        {period.status === 'loading' ? <Skeleton label="Loading every selected week…" shape="panels" count={1}/>
          : period.status === 'error' ? <div role="alert" className="gx-vstack gx-gap-8">
            <p className="gx-t-body">{period.error}</p><Button onClick={period.retry}>Retry gap records</Button></div>
          : period.status === 'choose' ? <p className="gx-t-body">Choose From and To, then apply the range.</p>
          : <>
        <details className="gx-gap-options">
          <summary>Gap size filter{tier === "large" ? " · Large gaps" : ""}</summary>
          <Segmented
            label="Gap size"
            options={[
              { value: "all", label: "All gaps" },
              { value: "large", label: "Large gaps" },
            ]}
            value={tier}
            onChange={(value) => {
              setTier(value);
              setLimit(6);
            }}
          />
        </details>
        <div className="gx-card gx-gap-hero">
          <div className="gx-gap-rate">
            <svg
              viewBox="0 0 84 84"
              role="img"
              aria-label={
                decided
                  ? `${rate} paper win rate`
                  : "Paper win rate unavailable"
              }
            >
              <circle cx="42" cy="42" r="35" />
              <circle
                className="gx-gap-rate-fill"
                cx="42"
                cy="42"
                r="35"
                pathLength="100"
                strokeDasharray={`${decided ? (s.wins / decided) * 100 : 0} 100`}
              />
            </svg>
            <div>
              <strong>{rate}</strong>
              <span>Gap win rate</span>
            </div>
          </div>
          <p className="gx-t-meta gx-c-2">
            {tally(s)} W–L–P · {view.rows.length} graded gaps
          </p>
        </div>
        <p className="gx-t-meta gx-c-2">{record.even} even guesses excluded · {waiting} not graded. Pushes are excluded from win rate.</p>
        {view.rows.length ? (
          <TrendDetail title="Paper units" line={line}>
            {(selectionState) => (
              <>
                <ol
                  className="gx-gap-blocks"
                  aria-label="Each gap, in kickoff order"
                >
                  {view.rows.map((row, i) => (
                    <li key={row.key}>
                      <button
                        type="button"
                        data-outcome={row.outcome}
                        aria-label={`Select gap ${i + 1}: ${teamName(row.game?.awayCode)} at ${teamName(row.game?.homeCode)}, ${row.market}, ${outcomes[row.outcome][1]}`}
                        aria-pressed={selectionState.index === i + 1}
                        onClick={() => selectionState.onSelect(i + 1)}
                      >
                        {outcomes[row.outcome][0]}
                      </button>
                    </li>
                  ))}
                </ol>
                <h4 className="gx-t-strong">Each gap · kickoff order</h4>
                <ol className="gx-gap-list">
                  {view.rows.slice(0, limit).map((row, i) => (
                    <li
                      className="gx-card gx-gap-row"
                      key={row.key}
                      data-current={selectionState.index === i + 1}
                    >
                      <div className="gx-between">
                        <span className="gx-t-meta">
                          Gap {i + 1} ·{" "}
                          {row.market === "spread" ? "Spread" : "Total"}
                          {period.period !== 'week' && ` · ${row.season} Week ${row.week}`}
                        </span>
                        <span
                          className="gx-gap-outcome"
                          data-outcome={row.outcome}
                        >
                          {outcomes[row.outcome][1]}
                        </span>
                      </div>
                      <Matchup game={row.game} />
                      <Pair row={row} />
                      <div className="gx-gap-actions">
                        <Button
                          aria-pressed={selectionState.index === i + 1}
                          onClick={() => selectionState.onSelect(i + 1)}
                        >
                          {selectionState.index === i + 1 ? "✓ " : ""}Chart
                          point
                        </Button>
                        <Button
                          ref={(el) => {
                            if (el) buttons.current.set(row.key, el);
                            else buttons.current.delete(row.key);
                          }}
                          onClick={() => open(row)}
                        >
                          Gap details
                          <Icon icon="chevronRight" size={16} />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ol>
                {view.rows.length > 6 ? (
                  <Button
                    onClick={() =>
                      setLimit((n) => (n === 6 ? view.rows.length : 6))
                    }
                  >
                    {limit === 6
                      ? `Show all ${view.rows.length} gaps`
                      : "Show first 6"}
                  </Button>
                ) : null}
              </>
            )}
          </TrendDetail>
        ) : (
          <p className="gx-t-body">{tier === 'large' ? 'No finished games with a large gap yet.' : 'No finished games with a gap yet.'}</p>
        )}
        </>}
      </div>
    </section>
  );
}
function GapAxis({ row }) {
  const chart = pickComparison(row.guess, row.line);
  if (!chart) return null;
  return (
    <div
      className="gx-gap-axis"
      role="img"
      aria-label={`Closing reference ${selection(row, row.line)}; locked guess ${selection(row, row.guess)}; difference ${fmtNum(chart.difference)} points`}
    >
      <p className="gx-t-meta gx-c-2">
        {row.market === "total"
          ? "Combined points"
          : `${teamName(row.game?.homeCode)} signed spread`}{" "}
        · {fmtNum(chart.from)} to {fmtNum(chart.to)}
      </p>
      <div>
        <span className="gx-gap-axis-track" />
        <i style={{ left: `${chart.lineAt}%` }} />
        <b style={{ left: `${chart.guessAt}%` }} />
      </div>
      <p className="gx-t-meta">● Closing reference · ◆ Your guess</p>
    </div>
  );
}
