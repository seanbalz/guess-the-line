// NBA's four Prism tabs (milestone N1; mockups 03, 04, 05, 07 and 09): Home (Tonight, Needs your result, this month),
// Play (held until Guess the Spread), Bets (Open and History, private tickets) and Research › Games (the BALLDONTLIE
// board). Sport content only: the header, sport switch, menu, offline banner and tab bar are the shell's. Reads are the
// existing /nba/read and /nba/games; nothing here writes (the Track bet and Confirm result sheets save).
import './prism-nba.css';
import { useMemo } from 'react';
import { useShell } from '../shell/context.js';
import { Button, Card, Chip, Icon, IconButton, Pill, Segmented, Skeleton } from '../ui/index.js';
import { fmtTime, ZONE_LABEL } from '../format.js';
import { NBA_TRADEMARK_NOTICE } from '../../teamLogoRegistry.js';
import { formatNbaPrice, nbaNoSuggestionReason } from '../../../../shared/nba-grade.mjs';
import { nbaTeam } from '../../../../shared/nba-teams.mjs';
import { normalizeNbaTicket } from '../../../../shared/nba-bets.mjs';
import { NbaMatchup } from './NbaMatchup.jsx';
import { nbaApi } from './api.js';
import { displayUnits, nbaReadFilters, nbaView, NBA_HISTORY_STATUSES, NBA_MARKET_FILTERS, today } from './route.js';
import { useNbaData, useNbaGrades } from './useNbaData.js';

export const NBA_COPY = Object.freeze({
  tabs: { home: 'Home', play: 'Play', bets: 'Bets', research: 'Research' },
  source: 'BALLDONTLIE (unofficial)',
  safe: 'Your tickets are safe.',
  suggestionRule: 'A suggestion never settles a ticket. You confirm every result.',
  playHeld: 'NBA Guess the Spread is coming',
});

const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const timeLabel = iso => iso && Number.isFinite(Date.parse(iso)) ? `${fmtTime(iso)} ${ZONE_LABEL}` : null;
const shiftDate = (date, days) => { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };
const longDate = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
const shortDay = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short' });
const minutesAgo = (iso, now = Date.now()) => Math.max(0, Math.floor((now - Date.parse(iso)) / 60000));
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const OUTCOME_WORDS = Object.freeze({ pending: 'Open', win: 'Won', loss: 'Lost', push: 'Push', void: 'Void' });
const OUTCOME_TONES = Object.freeze({ pending: 'pending', win: 'win', loss: 'loss', push: 'neutral', void: 'neutral' });
const RESULT_WORDS = Object.freeze({ win: 'Win', loss: 'Loss', push: 'Push' });
export const resultWord = outcome => RESULT_WORDS[outcome] ?? OUTCOME_WORDS[outcome] ?? outcome;

// Exact 8-decimal unit strings (as the server sends them), added without binary floating point.
const toScaled = value => { const [whole, fraction = ''] = String(value).replace(/^-/, '').split('.'); const scaled = BigInt(whole || '0') * 100000000n + BigInt((fraction + '00000000').slice(0, 8)); return String(value).startsWith('-') ? -scaled : scaled; };
const fromScaled = scaled => { const sign = scaled < 0n ? '-' : ''; const digits = (scaled < 0n ? -scaled : scaled).toString().padStart(9, '0'); return `${sign}${digits.slice(0, -8)}.${digits.slice(-8)}`; };
/** A unit string rounded half away from zero to `places` decimals for a large tile ("2.02040816" → "2.02"). */
export function roundUnits(value, places = 2) {
  if (value == null) return '—';
  const scaled = toScaled(value), step = 10n ** BigInt(8 - places), sign = scaled < 0n ? -1n : 1n;
  const rounded = ((scaled * sign + step / 2n) / step) * step * sign;
  return displayUnits(fromScaled(rounded));
}
/** "+1.02", "−1.1" or "0": exact digits, or rounded to `places` for a large tile. */
export const signedUnits = (value, places) => { const text = places === undefined ? displayUnits(value) : roundUnits(value, places); return text === '—' ? text : text.startsWith('-') ? `−${text.slice(1)}` : Number(text) > 0 ? `+${text}` : text; };
const toneOf = value => value == null ? undefined : String(value).startsWith('-') ? 'loss' : /[1-9]/.test(String(value)) ? 'win' : undefined;

/** What a winning ticket returns (stake plus winnings), exact, from the ticket's own terms. */
export function toReturn(ticket) {
  try {
    const terms = normalizeNbaTicket({ id: ticket.id, season: ticket.season, eventDate: ticket.eventDate, kind: ticket.kind, label: ticket.label,
      legs: ticket.legs, priceInput: ticket.priceInput ?? { format: 'american', value: ticket.odds }, stakeUnits: ticket.stakeUnits, outcome: 'win' });
    return fromScaled(toScaled(terms.netUnits) + toScaled(Number(ticket.stakeUnits).toFixed(8)));
  } catch { return null; }
}

/** The original price as entered: "49.5% Novig" or "−110.1234 American"; imported tickets show their stored terms. */
export function originalPrice(ticket) {
  const input = ticket.priceInput;
  if (input?.format === 'probability') return `${input.value}% Novig`;
  const value = input?.value ?? ticket.odds;
  const text = `${value < 0 ? '−' : ''}${Math.abs(value)} American`;
  return input ? text : `Imported terms · ${text}`;
}

/** "PHI at MIA" or a typed matchup; legs from the board name two NBA codes, which draw as badges. */
function matchupCodes(leg) {
  const match = /^([A-Za-z]{2,4}) at ([A-Za-z]{2,4})$/.exec(leg?.matchup?.trim() ?? '');
  return match && nbaTeam(match[1]) && nbaTeam(match[2]) ? [nbaTeam(match[1]).code, nbaTeam(match[2]).code] : null;
}
const lineText = line => line === undefined || line === null ? '' : line > 0 ? `+${line}` : line < 0 ? `−${Math.abs(line)}` : 'PK';
/** One leg in words: "PHI", "BOS −4.5", "Under 221.5". */
export function legSelection(leg) {
  if (leg.market === 'total') return `${leg.side === 'under' ? 'Under' : 'Over'} ${leg.line}`;
  return leg.market === 'spread' ? `${leg.team} ${lineText(leg.line)}` : leg.team;
}
const MARKET_WORDS = Object.freeze({ moneyline: 'Moneyline', spread: 'Spread', total: 'Game total' });

/** Final score words for a chip: "Final PHI 112–108" (the winner first). */
export function finalWords(game) {
  if (!game || !Number.isSafeInteger(game.homeScore) || !Number.isSafeInteger(game.awayScore)) return null;
  const homeWon = game.homeScore >= game.awayScore;
  const [code, high, low] = homeWon ? [game.home.abbreviation, game.homeScore, game.awayScore] : [game.away.abbreviation, game.awayScore, game.homeScore];
  return `Final ${code} ${high}–${low}`;
}

/** Where a pending ticket stands for the result queue: `suggested`, `manual` (confirm by hand), `waiting` or null. */
export function queueState(ticket, suggestion, games, todayDate) {
  if (ticket.outcome !== 'pending') return null;
  if (suggestion) return 'suggested';
  const reason = nbaNoSuggestionReason(ticket, games);
  if (reason === 'waiting') return 'waiting';
  return ticket.eventDate < todayDate ? 'manual' : null;
}

function ResultChip({ ticket, suggestion, games, todayDate, onConfirm, onChoose }) {
  const state = queueState(ticket, suggestion, games, todayDate);
  if (state === 'suggested') {
    const game = suggestion.legs[0]?.game;
    return <div className="gx-nba-result">
      <span className="gx-nba-chip gx-nba-chip--win"><Icon icon="check" size={16}/>{ticket.kind === 'single' && finalWords(game) ? `${finalWords(game)} · ` : 'All finals in · '}Suggested: {resultWord(suggestion.outcome)}</span>
      <Button block onClick={onConfirm}>Confirm result</Button>
    </div>;
  }
  if (state === 'manual') return <div className="gx-nba-result">
    <span className="gx-nba-chip"><Icon icon="pencil" size={16}/>Confirm by hand · game not linked</span>
    <Button block onClick={onChoose}>Choose result</Button>
  </div>;
  if (state === 'waiting') {
    const waiting = ticket.legs.length > 1 ? `Waiting for ${ticket.legs.length} finals` : 'Waiting for final';
    return <div className="gx-nba-result"><span className="gx-nba-chip gx-nba-chip--wait"><Icon icon="clock" size={16}/>{waiting}</span></div>;
  }
  return null;
}

const auditTerms = terms => `${resultWord(terms.outcome)}, ${formatNbaPrice(terms.odds)}, ${displayUnits(terms.stakeUnits)} U${terms.netUnits == null ? '' : `, net ${signedUnits(terms.netUnits)} U`}`;

/** One private ticket in the Prism receipt (mockups 05 and 07). */
export function NbaTicket({ ticket, suggestion = null, games = new Map(), todayDate, onConfirm, onEdit, expanded = false }) {
  const single = ticket.kind === 'single', leg = ticket.legs[0];
  const codes = ticket.legs.map(matchupCodes);
  const typed = single && !codes[0] && leg?.matchup;
  const pending = ticket.outcome === 'pending';
  const returned = pending ? toReturn(ticket) : null;
  return <Card as="article" className="gx-nba-ticket" aria-label={`${ticket.label}, ${OUTCOME_WORDS[ticket.outcome] ?? ticket.outcome}`}>
    <div className="gx-nba-ticket-top">
      <span className="gx-nba-meta">{shortDay(ticket.eventDate)} · {single ? 'Single' : `${ticket.legs.length}-leg parlay`}{typed ? ' · typed matchup' : ''}</span>
      <Pill tone={OUTCOME_TONES[ticket.outcome]}>{OUTCOME_WORDS[ticket.outcome] ?? ticket.outcome}</Pill>
    </div>
    <div className="gx-nba-ticket-title">
      <h3>{ticket.label}</h3>
      <IconButton icon="chevronRight" label={`Edit ${ticket.label}`} onClick={() => onEdit(ticket)}/>
    </div>
    <p className="gx-nba-selection">{single ? <>{legSelection(leg)} <span>· {formatNbaPrice(ticket.odds)}</span></> : formatNbaPrice(ticket.odds)}</p>
    {codes.some(Boolean) ? <div className="gx-nba-legs">{codes.map((pair, index) => pair ? <NbaMatchup key={index} away={pair[0]} home={pair[1]}/> : null)}</div>
      : typed ? <p className="gx-nba-meta">{leg.matchup}</p> : null}
    <div className="gx-nba-money">
      <div><span className="gx-nba-meta">Risk</span><strong>{displayUnits(ticket.stakeUnits)}U</strong></div>
      <Icon icon="chevronRight" size={20} className="gx-nba-arrow" aria-hidden="true"/>
      {pending ? <div><span className="gx-nba-meta">To return</span><strong>{returned ? `${roundUnits(returned)}U` : '—'}</strong></div>
        : <div><span className="gx-nba-meta">Net units</span><strong className={toneOf(ticket.netUnits) ? `gx-c-${toneOf(ticket.netUnits)}` : undefined}>{signedUnits(ticket.netUnits, 2)}U</strong></div>}
    </div>
    {pending ? <ResultChip ticket={ticket} suggestion={suggestion} games={games} todayDate={todayDate} onConfirm={() => onConfirm(ticket, suggestion)} onChoose={() => onEdit(ticket)}/> : null}
    <details className="gx-nba-details" open={expanded || undefined}>
      <summary>Ticket details and correction history</summary>
      <ul>{ticket.legs.map((value, index) => <li key={index}>{value.matchup || 'Matchup unavailable'} · {MARKET_WORDS[value.market] ?? value.market} · {legSelection(value)}</li>)}</ul>
      <p>Original price: {originalPrice(ticket)} (shown as {formatNbaPrice(ticket.odds)}) · stored value unchanged</p>
      {!pending ? <p>Net units, exact: {signedUnits(ticket.netUnits)} U</p> : null}
      <p>Revision {ticket.revision}</p>
      {ticket.audit.map(row => <div key={row.operationId} className="gx-nba-audit">
        <p>Revision {row.revision} · {row.reason || 'Original entry'}</p>
        {row.before ? <p>Before: {auditTerms(row.before)}</p> : null}
        <p>After: {auditTerms(row.after)}</p>
      </div>)}
      <Button block icon="pencil" onClick={() => onEdit(ticket)}>Edit terms or confirm result</Button>
    </details>
  </Card>;
}

function ErrorCard({ title, onRetry, busy }) {
  return <Card className="gx-nba-state" role="alert">
    <Icon icon="alert" size={24}/>
    <p className="gx-t-body">{title} {NBA_COPY.safe}</p>
    <Button icon="refresh" disabled={busy} onClick={() => onRetry()}>Try again</Button>
  </Card>;
}

// ---------- Home ----------
function gameRank(game) { return game.status === 'in_progress' ? 0 : game.status === 'scheduled' ? 1 : game.status === 'final' ? 3 : 2; }
function gameSide(game) {
  if (game.status === 'in_progress') return 'In progress';
  if (game.status === 'final') return /\/\d*ot/i.test(game.statusText ?? '') ? 'Final · OT' : 'Final';
  if (game.status === 'scheduled') return timeLabel(game.startTime) ?? 'Time unavailable';
  return game.statusText || game.status;
}
function Tonight({ board, onAllGames }) {
  const { data, loading, error, refresh } = board;
  if (loading && !data) return <Skeleton label="Loading tonight’s games…" shape="cards" count={1}/>;
  if (error && !data) return <ErrorCard title="NBA games couldn’t load." onRetry={refresh} busy={loading}/>;
  const games = data?.games ?? [];
  if (data?.unavailable && !games.length) return <Card className="gx-nba-state"><p className="gx-t-body">Games are unavailable right now. The source connection or refresh is pending.</p><Button icon="refresh" disabled={loading} onClick={() => refresh()}>Refresh games</Button></Card>;
  if (!games.length) return <Card className="gx-nba-tonight"><h2 className="gx-nba-h2">No NBA games today</h2><Button block iconEnd="chevronRight" onClick={onAllGames}>See the games board</Button></Card>;
  const starts = games.map(game => game.startTime).filter(Boolean).sort();
  const counts = ['final', 'in_progress', 'scheduled'].map(status => games.filter(game => game.status === status).length);
  const rows = [...games].sort((a, b) => gameRank(a) - gameRank(b) || (a.startTime ?? '').localeCompare(b.startTime ?? '')).slice(0, 3);
  return <Card className="gx-nba-tonight" aria-labelledby="nba-tonight">
    <div className="gx-nba-row"><h2 className="gx-nba-h2" id="nba-tonight">Tonight</h2><Pill tone="data">{plural(games.length, 'game')}</Pill></div>
    {starts.length ? <p className="gx-nba-strong">First tip {timeLabel(starts[0])}</p> : null}
    <p className="gx-nba-meta">{counts[0]} final · {counts[1]} in progress · {counts[2]} to come</p>
    {data.stale || error ? <p className="gx-nba-chip gx-nba-chip--wait"><Icon icon="clock" size={16}/>Observed {minutesAgo(data.observedAt)} min ago</p> : null}
    <ul className="gx-nba-rows">{rows.map(game => <li key={game.id}><NbaMatchup away={game.away.abbreviation} home={game.home.abbreviation}/><span className="gx-nba-meta">{gameSide(game)}</span></li>)}</ul>
    <Button block iconEnd="chevronRight" onClick={onAllGames}>See all games</Button>
  </Card>;
}
function NeedsResult({ pending, grades, todayDate, onConfirm, onEdit }) {
  const tickets = (pending.data?.tickets ?? []).filter(ticket => ['suggested', 'manual'].includes(queueState(ticket, grades.suggestions.get(ticket.id), grades.games, todayDate)));
  if (!tickets.length) return null;
  return <Card className="gx-nba-queue" aria-labelledby="nba-queue">
    <div className="gx-nba-row"><h2 className="gx-nba-h2" id="nba-queue">Needs your result</h2><Pill tone="pending">{tickets.length}</Pill></div>
    {tickets.map(ticket => <div key={ticket.id} className="gx-nba-queue-item">
      <p className="gx-nba-strong">{ticket.label} · {formatNbaPrice(ticket.odds)} · {displayUnits(ticket.stakeUnits)} U</p>
      <ResultChip ticket={ticket} suggestion={grades.suggestions.get(ticket.id)} games={grades.games} todayDate={todayDate} onConfirm={() => onConfirm(ticket, grades.suggestions.get(ticket.id))} onChoose={() => onEdit(ticket)}/>
    </div>)}
    <p className="gx-nba-meta">{NBA_COPY.suggestionRule}</p>
  </Card>;
}
function NbaHome({ api, timeZone, todayDate, ...rest }) {
  const board = useNbaData('games', { date: todayDate, timeZone }, { api, poll: true });
  const pending = useNbaData('read', { filters: { status: 'pending' } }, { api });
  const month = useNbaData('read', { filters: { status: 'settled', from: `${todayDate.slice(0, 8)}01`, to: todayDate } }, { api });
  const grades = useNbaGrades(pending.data?.tickets, { timeZone, todayDate, api });
  return <NbaHomeBody board={board} pending={pending} month={month} grades={grades} todayDate={todayDate} {...rest}/>;
}
/** Home's body from its three reads and the queue's grades (`{ data, loading, error, refresh }` each). */
export function NbaHomeBody({ board, pending, month, grades, todayDate, onTab, onConfirm, onEdit, onTrack }) {
  const weekday = new Date(`${todayDate}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long' });
  const summary = pending.data?.summary, monthly = month.data?.summary;
  const noTickets = summary && monthly && summary.count === 0 && monthly.count === 0;
  return <div className="gx-screen gx-nba-home" data-nba-tab="home">
    <h1 className="gx-t-title">NBA</h1>
    <p className="gx-nba-meta">{weekday} · times in Pacific time</p>
    <Tonight board={board} onAllGames={() => onTab('research', { date: undefined })}/>
    {pending.error ? <ErrorCard title="NBA tickets couldn’t load." onRetry={pending.refresh} busy={pending.loading}/> : null}
    <NeedsResult pending={pending} grades={grades} todayDate={todayDate} onConfirm={onConfirm} onEdit={onEdit}/>
    {noTickets ? <Card className="gx-nba-state"><h2 className="gx-nba-h2">Track your first NBA bet</h2><p className="gx-t-body">Record a ticket you placed elsewhere. It stays private.</p><Button variant="primary" block icon="plus" onClick={onTrack}>Track a bet</Button></Card>
      : <div className="gx-nba-tiles">
        <Card className="gx-nba-tile"><span className="gx-nba-meta">This month · net</span>{monthly ? <><strong className={toneOf(monthly.netUnits) ? `gx-c-${toneOf(monthly.netUnits)}` : undefined}>{signedUnits(monthly.netUnits, 2)} U</strong><span className="gx-nba-meta">{monthly.count} settled</span></> : month.error ? <span className="gx-nba-meta">Unavailable</span> : <Skeleton label="Loading this month…" shape="lines" count={1}/>}</Card>
        <Card className="gx-nba-tile"><span className="gx-nba-meta">Open tickets</span>{summary ? <><strong>{summary.count}</strong><span className="gx-nba-meta">{roundUnits(summary.pendingStakeUnits)} U pending</span></> : pending.error ? <span className="gx-nba-meta">Unavailable</span> : <Skeleton label="Loading open tickets…" shape="lines" count={1}/>}</Card>
      </div>}
    <Card className="gx-nba-coming"><div className="gx-nba-row"><h2 className="gx-nba-h2">Coming to Play</h2><Icon icon="target" size={24}/></div><p className="gx-t-body">NBA Guess the Spread is coming. Your tickets are in Bets.</p></Card>
  </div>;
}

// ---------- Play ----------
export function NbaPlay({ onTab }) {
  return <div className="gx-screen gx-nba-play" data-nba-tab="play">
    <h1 className="gx-t-title">Play</h1>
    <Card className="gx-nba-held">
      <Icon icon="target" size={32}/>
      <h2 className="gx-nba-h2">{NBA_COPY.playHeld}</h2>
      <p className="gx-t-body">Your tickets are in Bets.</p>
      <Button variant="primary" block iconEnd="chevronRight" onClick={() => onTab('bets', { pane: 'open' })}>Go to Bets</Button>
    </Card>
  </div>;
}

// ---------- Bets ----------
const STATUS_WORDS = Object.freeze({ settled: 'Settled', win: 'Win', loss: 'Loss', push: 'Push', void: 'Void', all: 'All' });
function Filters({ view, onView }) {
  const set = patch => onView({ ...view, ...patch });
  return <div className="gx-nba-filters">
    <label className="gx-nba-field">Result<select value={view.status ?? 'settled'} onChange={event => set({ status: event.target.value === 'settled' ? undefined : event.target.value })}>{NBA_HISTORY_STATUSES.map(value => <option key={value} value={value}>{STATUS_WORDS[value]}</option>)}</select></label>
    <label className="gx-nba-field">Market<select value={view.market ?? ''} onChange={event => set({ market: event.target.value || undefined })}><option value="">All markets</option>{NBA_MARKET_FILTERS.map(value => <option key={value} value={value}>{MARKET_WORDS[value]}</option>)}</select></label>
    <label className="gx-nba-field">From<input type="date" value={view.from ?? ''} onChange={event => set({ from: event.target.value || undefined })}/></label>
    <label className="gx-nba-field">To<input type="date" value={view.to ?? ''} onChange={event => set({ to: event.target.value || undefined })}/></label>
    <Button block className="gx-nba-wide" onClick={() => set({ from: undefined, to: undefined })}>All dates</Button>
  </div>;
}
function Totals({ summary }) {
  return <Card className="gx-nba-totals" aria-label="Filtered totals">
    <h2 className="gx-nba-h2">Filtered totals · {plural(summary.count, 'ticket')}</h2>
    <p className="gx-t-body">{plural(summary.wins, 'win')} · {plural(summary.losses, 'loss', 'losses')} · {plural(summary.pushes, 'push', 'pushes')} · {plural(summary.voids, 'void')}</p>
    <div className="gx-nba-tiles">
      <div className="gx-nba-tile"><span className="gx-nba-meta">Net</span><strong className={toneOf(summary.netUnits) ? `gx-c-${toneOf(summary.netUnits)}` : undefined}>{signedUnits(summary.netUnits, 2)} U</strong></div>
      <div className="gx-nba-tile"><span className="gx-nba-meta">ROI</span><strong>{summary.roi == null ? '—' : `${signedUnits(summary.roi, 1)}%`}</strong></div>
      <div className="gx-nba-tile"><span className="gx-nba-meta">Settled risk</span><strong>{roundUnits(summary.riskUnits)} U</strong></div>
      <div className="gx-nba-tile"><span className="gx-nba-meta">Pending stake</span><strong>{roundUnits(summary.pendingStakeUnits)} U</strong><span className="gx-nba-meta">{summary.pending} pending</span></div>
    </div>
    {/* Tiles round for reading; the server's exact totals are never recomputed or rounded away. */}
    <p className="gx-nba-meta">Exact: net {signedUnits(summary.netUnits)} U · ROI {summary.roi == null ? '—' : `${signedUnits(summary.roi)}%`} · settled risk {displayUnits(summary.riskUnits)} U · pending stake {displayUnits(summary.pendingStakeUnits)} U</p>
  </Card>;
}
function NbaBets({ api, view, timeZone, todayDate, ...rest }) {
  const data = useNbaData('read', { filters: nbaReadFilters(view) }, { api });
  const grades = useNbaGrades(view.pane === 'history' ? [] : data.data?.tickets, { timeZone, todayDate, api });
  return <NbaBetsBody data={data} grades={grades} view={view} todayDate={todayDate} {...rest}/>;
}
/** Bets' body: `data` is the /nba/read state for this pane and its filters. */
export function NbaBetsBody({ data, grades, view, todayDate, onView, onTrack, onConfirm, onEdit }) {
  const history = view.pane === 'history';
  const tickets = data.data?.tickets ?? [];
  const filtered = Boolean(view.market || view.from || view.to || (history && view.status));
  return <div className="gx-screen gx-nba-bets" data-nba-tab="bets" data-nba-pane={view.pane}>
    <h1 className="gx-t-title">NBA bets</h1>
    <Segmented label="Bets view" value={view.pane} options={[{ value: 'open', label: 'Open' }, { value: 'history', label: 'History' }]}
      onChange={pane => onView({ pane, status: undefined, market: undefined, from: undefined, to: undefined })}/>
    {history ? <Filters view={view} onView={onView}/> : <Button variant="primary" block icon="plus" onClick={onTrack}>Track a bet</Button>}
    {!history && view.market ? <p className="gx-nba-meta">Showing {MARKET_WORDS[view.market]} only. <Button variant="ghost" onClick={() => onView({ ...view, market: undefined })}>Show all markets</Button></p> : null}
    {data.error ? <ErrorCard title={history ? 'History couldn’t load. Your filters are kept.' : 'Tickets couldn’t load.'} onRetry={data.refresh} busy={data.loading}/> : null}
    {data.loading && !data.data ? <Skeleton label="Loading tickets…" shape="rows" count={3}/> : null}
    {history && data.data?.summary ? <Totals summary={data.data.summary}/> : null}
    {data.data && !tickets.length && !data.error ? <Card className="gx-nba-state">
      {filtered ? <><p className="gx-t-body">No tickets match these filters.</p><Button block onClick={() => onView({ pane: view.pane })}>Clear filters</Button></>
        : history ? <p className="gx-t-body">No settled NBA tickets yet.</p>
        : <><h2 className="gx-nba-h2">No open NBA tickets</h2><p className="gx-t-body">Track a bet you placed elsewhere. Only you see it.</p></>}
    </Card> : null}
    {tickets.map(ticket => <NbaTicket key={ticket.id} ticket={ticket} suggestion={grades.suggestions.get(ticket.id)} games={grades.games} todayDate={todayDate} onConfirm={onConfirm} onEdit={onEdit}/>)}
    {data.data?.nextCursor ? <Button block disabled={data.loading} onClick={() => data.refresh(data.data.nextCursor)}>{data.loading ? 'Loading more…' : 'Load more tickets'}</Button> : null}
    {data.data ? <Button variant="ghost" icon="refresh" disabled={data.loading} onClick={() => data.refresh()}>Refresh tickets</Button> : null}
    {!history ? <p className="gx-nba-meta">Prices show as whole American odds. Your original input (for example 49.5% Novig) is kept in the ticket details.</p> : null}
  </div>;
}

// ---------- Research › Games ----------
const GROUPS = Object.freeze({ in_progress: 'In progress', scheduled: 'Scheduled', final: 'Final', other: 'Schedule updates' });
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
/** The status pill: LIVE only while in progress; a scheduled game's provider ISO time shows as a Pacific label. */
export const statusLabel = game => game.status === 'in_progress' ? 'LIVE' : game.status === 'scheduled' && (game.startTime || ISO_TIME.test(game.statusText ?? '')) ? timeLabel(game.startTime || game.statusText) : game.status === 'final' ? (/\/\d*ot/i.test(game.statusText ?? '') ? 'Final · OT' : 'Final') : game.statusText || game.status;
function GameCard({ game, onTrack }) {
  const scored = ['in_progress', 'final'].includes(game.status);
  const live = game.status === 'in_progress';
  return <Card as="article" className="gx-nba-game" aria-label={`${nbaTeam(game.away.abbreviation)?.name ?? game.away.name} at ${nbaTeam(game.home.abbreviation)?.name ?? game.home.name}`}>
    <div className="gx-nba-row"><NbaMatchup away={game.away.abbreviation} home={game.home.abbreviation} size={32}/><Pill tone={live ? 'live' : 'neutral'} dot={live || undefined}>{statusLabel(game)}</Pill></div>
    <div className="gx-nba-score">
      <span><b>{game.away.abbreviation}</b> <strong>{scored ? game.awayScore ?? '—' : '—'}</strong></span>
      <span><b>{game.home.abbreviation}</b> <strong>{scored ? game.homeScore ?? '—' : '—'}</strong></span>
    </div>
    <p className="gx-nba-meta">{game.status === 'in_progress' ? `In progress · ${game.statusText} · ` : game.status !== 'scheduled' && game.status !== 'final' ? `${game.statusText || game.status} · ` : ''}{game.startTime ? `Start ${timeLabel(game.startTime)}` : `${game.sourceDate} · Time unavailable`}</p>
    <Button block onClick={() => onTrack(game)}>Track bet</Button>
  </Card>;
}
function NbaResearch({ api, view, timeZone, todayDate, ...rest }) {
  const board = useNbaData('games', { date: view.date ?? todayDate, timeZone }, { api, poll: true });
  return <NbaGamesBoard board={board} view={view} todayDate={todayDate} {...rest}/>;
}
/** Research › Games from the /nba/games state for the chosen date. */
export function NbaGamesBoard({ board, view, todayDate, onView, onTrack }) {
  const date = view.date ?? todayDate;
  const data = board.data;
  const groups = Object.keys(GROUPS).map(key => [key, (data?.games ?? []).filter(game => (['scheduled', 'in_progress', 'final'].includes(game.status) ? game.status : 'other') === key)]);
  const pick = value => onView({ date: value === todayDate ? undefined : value });
  const chips = [['Yesterday', shiftDate(todayDate, -1)], ['Today', todayDate], ['Tomorrow', shiftDate(todayDate, 1)]];
  const failure = board.error;
  const statusText = board.loading ? '' : failure ? `${failure.status === 401 ? 'Sign in again. ' : ''}Couldn’t refresh.${data?.observedAt ? ` Showing the board from ${timeLabel(data.observedAt)}.` : ''} ${failure.message ?? ''}`.trim()
    : data?.unavailable ? 'Games are unavailable. The source connection or refresh is pending.' : '';
  return <div className="gx-screen gx-nba-research" data-nba-tab="research">
    <h1 className="gx-t-title">NBA games</h1>
    <div className="gx-nba-dates" role="group" aria-label="Game day">{chips.map(([label, value]) => <Chip key={label} text selected={date === value} onClick={() => pick(value)}>{label}</Chip>)}</div>
    <label className="gx-nba-field">Game date<input type="date" value={date} onChange={event => event.target.value && pick(event.target.value)}/></label>
    <div className="gx-nba-row gx-nba-observed">
      {data?.observedAt ? <p className="gx-nba-meta">{board.error || data.stale ? 'Cached' : 'Observed'} · {timeLabel(data.observedAt)} · {minutesAgo(data.observedAt)} min ago · {NBA_COPY.source}</p> : null}
      <Button variant="ghost" icon="refresh" disabled={board.loading} onClick={() => board.refresh()}>Refresh games</Button>
    </div>
    {/* One status region stays mounted while games load and after, so a refresh's outcome is announced; the Skeleton
        carries the loading words. */}
    <div role="status" className="gx-nba-meta">{statusText}</div>
    {board.loading && !data ? <Skeleton label="Loading games…" shape="cards" count={3}/> : null}
    {board.error ? <Card className="gx-nba-state"><Icon icon="alert" size={24}/><p className="gx-t-body">{data?.observedAt ? 'Your last board stays below.' : 'No board to show yet.'}</p><Button icon="refresh" onClick={() => board.refresh()}>Try again</Button></Card> : null}
    {data && !data.unavailable && !data.games.length ? <Card className="gx-nba-state"><p className="gx-t-body">No NBA games on {longDate(date)}.</p><Button block iconEnd="chevronRight" onClick={() => pick(shiftDate(date, 1))}>Go to {longDate(shiftDate(date, 1)).split(',')[0]}</Button></Card> : null}
    {groups.map(([key, games]) => games.length ? <section className="gx-nba-group" key={key} aria-label={GROUPS[key]}>
      <h2 className="gx-nba-h2">{GROUPS[key]}</h2>
      {games.map(game => <GameCard key={game.id} game={game} onTrack={onTrack}/>)}
    </section> : null)}
    <p className="gx-nba-meta gx-nba-notice">Scores and schedule from {NBA_COPY.source}, with each observation time. {NBA_TRADEMARK_NOTICE}</p>
  </div>;
}

/** Sport content only; the frame, menus and tab bar are the shell's. Keyed by account, so nothing crosses owners. */
export function NbaView({ tab, view, api = nbaApi, timeZone = deviceZone(), todayDate = today(timeZone), onTab, onView, onTrack, onConfirm, onEdit }) {
  const props = { api, timeZone, todayDate, onTab, onView, onConfirm, onEdit };
  if (tab === 'play') return <NbaPlay onTab={onTab}/>;
  if (tab === 'bets') return <NbaBets {...props} view={nbaView('bets', view)} onTrack={() => onTrack({ selectedDate: todayDate })}/>;
  if (tab === 'research') return <NbaResearch {...props} view={nbaView('research', view)} onTrack={game => onTrack({ game, selectedDate: view?.date ?? todayDate })}/>;
  return <NbaHome {...props} onTrack={() => onTrack({ selectedDate: todayDate })}/>;
}

export function NbaScreen() {
  const shell = useShell(), tab = shell.state.tab;
  const view = shell.state.views[tab];
  const timeZone = useMemo(deviceZone, []);
  // Tab roots only: moving to another tab with values sets them on that root (no Back bar, no trail).
  const onTab = (next, patch) => { shell.tab(next); if (patch) shell.setView(next, patch); };
  return <NbaView key={shell.you.id} tab={tab} view={view} timeZone={timeZone}
    onTab={onTab} onView={patch => shell.setView(tab, nbaView(tab, patch))}
    onTrack={args => shell.openSheet('sh.nbaTrack', args)}
    onEdit={ticket => shell.openSheet('sh.nbaTrack', { ticket })}
    onConfirm={(ticket, suggestion) => shell.openSheet('sh.nbaConfirm', { ticket, suggestion })}/>;
}
