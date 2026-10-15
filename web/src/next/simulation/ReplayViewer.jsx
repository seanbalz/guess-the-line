// Presentation only. The caller supplies an immutable, validated simulation ledger. This module does not
// generate outcomes, load inputs, read account data, persist playback or contact a service.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Icon, Pill, Text } from '../ui/index.js';
import './replay.css';

const SPEEDS = Object.freeze([0.5, 1, 2]);
const EVENT_MS = 2400;
const STAT_KEYS = Object.freeze(['passingYards', 'rushingYards', 'receivingYards', 'passingTD', 'rushingTD', 'receivingTD', 'receptions']);
const text = value => typeof value === 'string' && value.trim().length > 0;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const optional = (value, valid) => value === null || valid(value);

// A display-shape check, not a substitute for the upstream model/data validator. Fail closed instead of showing
// zero scores, unknown players or a partly usable ledger as validated simulation output.
export function isRenderableReplay(replay) {
  if (!replay || !text(replay.id) || replay.simulationLabel !== 'Simulation' || !text(replay.modelVersion)
    || !text(replay.inputAsOf) || !Number.isFinite(Date.parse(replay.inputAsOf))
    || !(text(replay.seed) || finite(replay.seed)) || !['incomplete', 'complete', 'overtime_required'].includes(replay.status)) return false;
  const { home, away } = replay.teams ?? {};
  if (![home, away].every(team => team && text(team.id) && text(team.name) && text(team.abbreviation)) || home.id === away.id) return false;
  const teamIds = new Set([home.id, away.id]);
  if (!Array.isArray(replay.events) || !replay.events.length) return false;
  const ids = new Set();
  return replay.events.every(event => {
    if (!event || !text(event.id) || ids.has(event.id)) return false;
    ids.add(event.id);
    if (!Number.isInteger(event.quarter) || event.quarter < 1 || event.quarter > 4
      || !Number.isInteger(event.clockSeconds) || event.clockSeconds < 0 || event.clockSeconds > 900
      || !optional(event.possessionTeamId, id => teamIds.has(id))
      || !optional(event.fieldPosition, n => finite(n) && n >= 0 && n <= 100)
      || !optional(event.down, n => Number.isInteger(n) && n >= 1 && n <= 4)
      || !optional(event.distance, n => finite(n) && n >= 0 && n <= 100)
      || ![event.score?.home, event.score?.away].every(n => Number.isInteger(n) && n >= 0)
      || !text(event.caption) || !Array.isArray(event.playerStats)) return false;
    const playerIds = new Set();
    return event.playerStats.every(player => {
      if (!player || !text(player.id) || playerIds.has(player.id) || !text(player.name) || !teamIds.has(player.teamId)) return false;
      playerIds.add(player.id);
      return STAT_KEYS.every(key => finite(player[key]) && (key.endsWith('Yards') || (Number.isInteger(player[key]) && player[key] >= 0)));
    });
  });
}

export const replayClock = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const spot = position => position === null ? 'Field position unavailable' : position === 0 ? 'Own goal line' : position === 100 ? 'Opponent goal line' : position === 50 ? 'Midfield' : position < 50 ? `Own ${position}` : `Opponent ${100 - position}`;
const ending = status => status === 'overtime_required' ? 'End of regulation — overtime not supported' : status === 'complete' ? 'Replay complete' : 'End of supplied events — replay incomplete';
const initial = replay => ({ replay, index: 0, playing: false, speed: 1, announcement: '' });

function usePlaybackEnvironment(ref) {
  const [environment, setEnvironment] = useState({ reduced: false, hidden: false });
  useLayoutEffect(() => {
    const root = ref.current?.closest('.gx');
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const read = () => setEnvironment({ reduced: media.matches || root?.dataset.motion === 'reduce', hidden: document.hidden });
    read();
    media.addEventListener('change', read);
    document.addEventListener('visibilitychange', read);
    const observer = new MutationObserver(read);
    if (root) observer.observe(root, { attributes: true, attributeFilter: ['data-motion'] });
    return () => { media.removeEventListener('change', read); document.removeEventListener('visibilitychange', read); observer.disconnect(); };
  }, [ref]);
  return environment;
}

function Field({ event, possession }) {
  const position = event.fieldPosition;
  const x = position === null ? null : 40 + position * 3.2;
  return <div className="gx-sim-field-block">
    <div className="gx-sim-field-caption"><Text variant="strong">{possession ? `${possession.abbreviation} possession` : 'Possession unavailable'}</Text><Text variant="meta">Offense moves right <Icon icon="chevronRight" size={16}/></Text></div>
    <svg className="gx-sim-field" viewBox="0 0 400 180" role="img" aria-label={`${spot(position)}. ${possession ? `${possession.name} possession.` : 'No possession supplied.'} Field is oriented toward the opponent’s goal on the right.`}>
      <rect className="gx-sim-turf" x="1" y="1" width="398" height="178" rx="10"/>
      <path className="gx-sim-endzone" d="M40 1V179M360 1V179"/>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(yard => <path key={yard} className="gx-sim-yardline" d={`M${40 + yard * 32} 1V179`}/>)}
      {Array.from({ length: 19 }, (_, index) => 56 + index * 16).map(yard => <path key={yard} className="gx-sim-hash" d={`M${yard} 56v8m0 52v8`}/>)}
      <path className="gx-sim-direction" d="M173 146H227m-9-8 9 8-9 8"/>
      {x !== null && <g className="gx-sim-ball" style={{ transform: `translate(${x}px, 90px)` }}>
        <path className="gx-sim-line-of-scrimmage" d="M0-65V65"/>
        <ellipse className="gx-sim-ball-shape" rx="10" ry="7"/>
        <path className="gx-sim-ball-laces" d="M-5 0H5m-3-3v6m-4-6v6"/>
      </g>}
    </svg>
    <div className="gx-sim-position"><Text variant="body">{position !== null && position > 0 && position < 100 && position !== 50 ? <>{position < 50 ? 'Own ' : 'Opponent '}<span className="gx-n-xs">{position < 50 ? position : 100 - position}</span></> : spot(position)}</Text><Text variant="body">{event.down === null ? 'Down unavailable' : <><span className="gx-n-xs">{event.down}</span>{['', 'st', 'nd', 'rd', 'th'][event.down]} &amp; {event.distance === null ? '—' : <span className="gx-n-xs">{event.distance}</span>}</>}</Text></div>
  </div>;
}

function PlayerStats({ players, teams }) {
  const id = useId();
  return <section className="gx-sim-stats" aria-labelledby={id}>
    <div className="gx-sim-section-heading"><Text as="h3" variant="section" id={id}>Player stats</Text><Text variant="meta">Through this play</Text></div>
    {!players.length ? <Text as="p" tone={2}>No player statistics recorded yet.</Text> : <div className="gx-sim-player-list">
      {players.map(player => <details key={player.id} className="gx-sim-player">
        <summary><span className="gx-sim-player-heading"><Text variant="strong">{player.name}</Text><span className="gx-sim-player-team"><Text variant="team">{teams.home.id === player.teamId ? teams.home.abbreviation : teams.away.abbreviation}</Text><Icon icon="chevronDown" size={16}/></span></span>
          <span className="gx-sim-yard-stats">{[['Pass', 'passingYards'], ['Rush', 'rushingYards'], ['Rec', 'receivingYards']].map(([label, key]) => <span key={key}><Text variant="meta">{label} yards</Text><Text variant="n-s">{player[key]}</Text></span>)}</span>
        </summary>
        <dl className="gx-sim-extra-stats">{[['Passing TD', 'passingTD'], ['Rushing TD', 'rushingTD'], ['Receiving TD', 'receivingTD'], ['Receptions', 'receptions']].map(([label, key]) => <div key={key}><dt>{label}</dt><dd className="gx-n-s">{player[key]}</dd></div>)}</dl>
      </details>)}
    </div>}
  </section>;
}

function ReplaySession({ replay, active }) {
  const ref = useRef(null);
  const title = useId(), captionId = useId(), motionId = useId();
  const environment = usePlaybackEnvironment(ref);
  const [state, setState] = useState(() => initial(replay));
  // Replacing the immutable ledger is a new session, even when its public ID is unchanged. React restarts this
  // render before committing children, so a frame from the previous ledger is never displayed under new metadata.
  if (state.replay !== replay) setState(initial(replay));
  const current = state.replay === replay ? state : initial(replay);
  const { index, speed } = current;
  const event = replay.events[index], last = replay.events.length - 1;
  const canPlay = active && !environment.hidden && !environment.reduced;
  const playing = current.playing && canPlay && index < last;
  const possession = [replay.teams.home, replay.teams.away].find(team => team.id === event.possessionTeamId);
  useEffect(() => {
    if (!canPlay) setState(previous => previous.playing ? { ...previous, playing: false } : previous);
  }, [canPlay]);
  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setTimeout(() => {
      // Recheck before advancing: a visibility/motion event may occur just before the pending timer callback.
      if (document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches || ref.current?.closest('.gx')?.dataset.motion === 'reduce') {
        setState(previous => ({ ...previous, playing: false }));
        return;
      }
      setState(previous => {
        if (previous.replay !== replay) return previous;
        const next = Math.min(previous.index + 1, last);
        const play = `Play ${next + 1} of ${replay.events.length}. ${replay.events[next].caption}`;
        return { ...previous, index: next, playing: next < last, announcement: next === last ? `${ending(replay.status)}. ${play}` : play };
      });
    }, EVENT_MS / speed);
    return () => window.clearTimeout(timer);
  }, [playing, index, speed, replay, last]);
  const move = next => setState(previous => ({ ...previous, playing: false, index: next, announcement: `Play ${next + 1} of ${replay.events.length}. ${replay.events[next].caption}` }));
  const toggle = () => {
    if (!canPlay || index === last) return;
    setState(previous => ({ ...previous, playing: !previous.playing, announcement: previous.playing ? 'Replay paused.' : 'Replay playing.' }));
  };
  const stateLabel = index === last ? ending(replay.status) : playing ? 'Playing' : index === 0 ? 'Ready to play' : 'Paused';
  return <section ref={ref} className="gx-sim-replay" aria-labelledby={title} data-playing={playing} data-event-id={event.id} data-replay-id={replay.id}>
    <header className="gx-sim-header"><Pill tone="data">Simulation</Pill><Text variant="meta">{stateLabel}</Text></header>
    <Text as="h2" variant="section" id={title}>{replay.teams.away.name} at {replay.teams.home.name}</Text>
    <Text as="p" variant="body" tone={2}>Model-generated simulation. These are not actual game results.</Text>
    {(replay.readiness === 'research_only' || replay.publicationReady !== true) && <Card variant="s2" className="gx-sim-research"><Pill tone="pending">Research only</Pill><Text as="p">Model validation and publication checks are incomplete.</Text></Card>}
    <Card className="gx-sim-scorecard" aria-label="Simulation scoreboard">
      <div className="gx-sim-score-teams">{['away', 'home'].map(side => <div key={side} className="gx-sim-score-team">
        <Text variant="meta">{side === 'away' ? 'Away' : 'Home'}</Text><span className="gx-sim-score-line"><Text variant="team" aria-label={replay.teams[side].name}>{replay.teams[side].abbreviation}</Text><Text variant="n-l" aria-label={`${replay.teams[side].name} score ${event.score[side]}`}>{event.score[side]}</Text></span>
      </div>)}</div>
      <div className="gx-sim-clock"><span>Quarter <Text variant="n-s">{event.quarter}</Text></span><Text variant="n-m" aria-label={`${Math.floor(event.clockSeconds / 60)} minutes ${event.clockSeconds % 60} seconds remaining`}>{replayClock(event.clockSeconds)}</Text></div>
      <Field event={event} possession={possession}/>
    </Card>
    <div className="gx-sim-play" aria-labelledby={captionId}>
      <Text as="h3" variant="micro" id={captionId}>Play <span className="gx-tnum">{index + 1} of {replay.events.length}</span></Text>
      <Text as="p" variant="body">{event.caption}</Text>
    </div>
    <div className="gx-sim-controls" role="group" aria-label="Replay controls">
      <div className="gx-sim-transport">
        <Button icon="chevronLeft" onClick={() => move(Math.max(0, index - 1))} disabled={!active || index === 0} aria-label="Previous play">Previous</Button>
        {environment.reduced ? <Button variant="primary" onClick={() => move(Math.min(last, index + 1))} disabled={!active || index === last} aria-label="Next play">Next play</Button> : <Button variant="primary" onClick={toggle} disabled={!canPlay || index === last} aria-describedby={!canPlay ? motionId : undefined}>{playing ? 'Pause' : 'Play'}</Button>}
        {!environment.reduced && <Button iconEnd="chevronRight" onClick={() => move(Math.min(last, index + 1))} disabled={!active || index === last} aria-label="Next play">Next</Button>}
      </div>
      <div className="gx-sim-secondary-controls"><Button variant="ghost" onClick={() => move(0)} disabled={!active || (index === 0 && !playing)}>Restart</Button><label className="gx-sim-speed">Speed<select value={speed} onChange={e => { const value = Number(e.target.value); if (SPEEDS.includes(value)) setState(previous => ({ ...previous, speed: value })); }} disabled={!active || environment.reduced}>{SPEEDS.map(value => <option key={value} value={value}>{value}×</option>)}</select></label></div>
      <Text as="p" variant="meta" id={motionId}>{environment.reduced ? 'Reduced motion: step through each play at your own pace.' : !active ? 'Playback is inactive.' : environment.hidden ? 'Playback paused while this page is hidden.' : index === last ? 'Restart or choose Previous to review the replay.' : 'The clock and statistics update with each supplied play.'}</Text>
    </div>
    <PlayerStats players={event.playerStats} teams={replay.teams}/>
    <details className="gx-sim-provenance"><summary>Model and inputs<Icon icon="chevronDown" size={16}/></summary><dl><div><dt>Model version</dt><dd>{replay.modelVersion}</dd></div><div><dt>Inputs as of</dt><dd><time className="gx-n-xs" dateTime={replay.inputAsOf}>{new Date(replay.inputAsOf).toISOString().replace('T', ' ').replace('.000', '').replace('Z', ' UTC')}</time></dd></div><div><dt>Simulation seed</dt><dd className="gx-n-xs">{replay.seed}</dd></div></dl></details>
    <p className="gx-sr-only" role="status" aria-live="polite" aria-atomic="true">{current.announcement}</p>
  </section>;
}

/**
 * @param {{ replay: object|null, active?: boolean }} props
 * `replay` is an immutable validated event ledger; never pass a mutable model run or an account response.
 * `active=false` stops playback without resetting the selected frame. Becoming active never autoplays.
 * App-root data-motion="reduce" and the OS setting both switch to static, explicit stepping.
 */
export function ReplayViewer({ replay, active = true }) {
  const renderable = useMemo(() => isRenderableReplay(replay), [replay]);
  if (!renderable) return <Card className="gx-sim-unavailable" role="status"><Text as="h2" variant="section">{replay ? 'Replay unavailable' : 'Replay not ready'}</Text><Text as="p">A validated simulation is required before playback can begin.</Text></Card>;
  return <ReplaySession replay={replay} active={active}/>;
}
