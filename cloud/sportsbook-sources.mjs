// Safe, per-market provenance for the revealed dashboard. Scoring is never
// recomputed by the browser, and later observations never replace a saved receipt.
const BOOKS = { draftkings: 'DraftKings', fanduel: 'FanDuel', betmgm: 'BetMGM', betrivers: 'BetRivers' };
const REQUIRED = ['draftkings', 'fanduel', 'betmgm'];
// D-74 (November 3, 2026): a backup book may stand in for one required book the provider could not quote.
const BACKUPS = ['betrivers'];
const FRESH_MS = 5 * 60_000;
const time = value => typeof value === 'string' ? Date.parse(value) : NaN;
const iso = value => Number.isFinite(time(value)) ? new Date(time(value)).toISOString() : null;
const validValue = (value, market) => Number.isFinite(value) && Number.isInteger(value * 2)
  && value >= (market === 'total' ? 0 : -100) && value <= (market === 'total' ? 200 : 100);
const midpoint = quotes => quotes.map(q => q.value).sort((a, b) => a - b)[1];
const aligned = quotes => quotes.length === 3 && quotes.every(q => Math.abs(q.value - midpoint(quotes)) <= 5);
const counted = rows => rows.filter(q => q.status === 'included');
// Three aligned included books; a required book may be missing only where a backup stood in for it.
const whole = rows => aligned(counted(rows)) && rows.every(q => q.status === 'included' || q.stoodIn);
const standIn = (rows, i, row, backup) => {
  rows[i] = { ...rows[i], stoodIn: backup, reason: `${rows[i].reason || 'No qualifying quote was recorded.'} ${BOOKS[backup]} stood in.` };
  rows.push({ ...row, standInFor: REQUIRED[i], reason: `Stood in for ${BOOKS[REQUIRED[i]]}.` });
};
const REASONS = {
  book_missing: 'No quote returned for this sportsbook.', market_missing: 'No quote returned for this market.',
  stale_market: 'The provider observation was already stale when collected.',
  kickoff_passed: 'No new pregame quote after kickoff.', schedule_mismatch: 'The provider event did not match the saved schedule.',
  event_missing: 'The provider did not return this matchup.', invalid_market_timestamp: 'Invalid source timestamp.',
  market_timestamp_missing: 'Source timestamp was missing.',
};
const missing = (book, reason = 'No qualifying quote was recorded.') => ({ book, source: BOOKS[book], value: null,
  status: 'missing', reason, observedAt: null, collectedAt: null });
const caesars = () => ({ book: 'williamhill_us', source: 'Caesars', value: null, status: 'missing',
  reason: 'Unavailable on the current free provider plan; excluded from scoring.', observedAt: null, collectedAt: null });

function snapshotRows(snapshot, game, market, asOf) {
  const payload = snapshot?.payload, captured = time(payload?.fetchedAt), stored = time(snapshot?.createdAt);
  if (payload?.provider !== 'the-odds-api' || payload?.sport !== 'americanfootball_nfl'
    || !Number.isFinite(captured) || !Number.isFinite(stored) || captured > stored || stored > asOf
    || !Array.isArray(payload.games)) return REQUIRED.map(book => missing(book));
  const matches = payload.games.filter(g => g?.gameId === game.id && g.home === game.home && g.away === game.away
    && time(g.kickoff) === time(game.kickoff));
  if (matches.length !== 1) return REQUIRED.map(book => missing(book));
  const entry = matches[0], quotes = entry.markets?.[market]?.quotes;
  if (entry.matchStatus !== 'matched' || typeof entry.providerEventId !== 'string' || !entry.providerEventId
    || !Array.isArray(quotes) || quotes.length > 3) return REQUIRED.map(book => missing(book, REASONS[entry.matchStatus]));
  const row = book => {
    const found = quotes.filter(q => q?.book === book);
    if (found.length !== 1) {
      const absent = entry.markets[market].unavailable?.find(q => q.book === book);
      return missing(book, found.length > 1 ? 'Duplicate sportsbook evidence was excluded.' : REASONS[absent?.reason]);
    }
    const q = found[0], observed = time(q.providerObservedAt), collected = time(q.collectedAt);
    const paired = market === 'spread' ? q.outcomes?.home?.line === q.value && q.outcomes?.away?.line === -q.value
      : q.outcomes?.over?.line === q.value && q.outcomes?.under?.line === q.value;
    if (q.provider !== 'the-odds-api' || q.providerEventId !== entry.providerEventId || q.market !== market
      || q.timeBasis !== 'provider_market_last_update' || !validValue(q.value, market) || !paired
      || !Number.isFinite(observed) || !Number.isFinite(collected) || observed > collected || collected !== captured
      || collected - observed > FRESH_MS || collected >= time(game.kickoff)) return missing(book, 'Invalid quote evidence was excluded.');
    return { book, source: BOOKS[book], value: q.value, status: 'included', reason: null,
      observedAt: iso(q.providerObservedAt), collectedAt: iso(q.collectedAt) };
  };
  const rows = REQUIRED.map(row), standIns = entry.markets[market].standIns;
  for (const s of Array.isArray(standIns) ? standIns : []) {
    const i = REQUIRED.indexOf(s?.for), backup = BACKUPS.includes(s?.book) ? row(s.book) : null;
    if (i < 0 || rows[i].status !== 'missing' || rows.some(r => r.book === s.book) || backup?.status !== 'included') continue;
    standIn(rows, i, backup, s.book);
  }
  return rows;
}

function persistedRows(reference, market, game) {
  const raw = reference?.quotes;
  if (!Array.isArray(raw) || raw.length !== 3) return null;
  const row = book => {
    const found = raw.filter(q => q?.book === book);
    if (found.length !== 1) return null;
    const q = found[0], observed = time(q.observedAt), collected = time(q.collectedAt);
    // A saved line keeps its receipt whatever its age (October 12, 2026); only its own collection must match.
    if (!validValue(q.value, market) || !Number.isFinite(observed) || !Number.isFinite(collected)
      || observed > collected || collected !== time(reference.capturedAt) || collected >= time(game.kickoff)) return null;
    return { book, source: BOOKS[book], value: q.value, status: 'included', reason: null,
      observedAt: iso(q.observedAt), collectedAt: iso(q.collectedAt) };
  };
  const rows = REQUIRED.map(row), gaps = rows.flatMap((r, i) => r ? [] : [i]);
  if (!gaps.length) return rows;
  // A saved receipt does not name the book a backup replaced: with exactly one required book absent, it is that one.
  const backup = BACKUPS.map(row).find(Boolean);
  if (gaps.length !== 1 || !backup) return null;
  rows[gaps[0]] = missing(REQUIRED[gaps[0]]);
  standIn(rows, gaps[0], backup, backup.book);
  return rows;
}

function savedBoard(game, market, snapshots, now) {
  const ref = game.scoringReference;
  // The line at the guess was collected at or before the save; a pending guess's first line after it was collected
  // after the save (its book observations may precede the save, within D-17's five minutes of that collection).
  const firstAfter = ref?.basis === 'first_line_after_submission';
  const available = ref?.status === 'available' && validValue(ref.value, market)
    && [ref.savedAt, ref.capturedAt, ref.observedAt].every(value => Number.isFinite(time(value)))
    && time(ref.observedAt) <= time(ref.capturedAt) && time(ref.savedAt) <= now
    && (firstAfter ? time(ref.capturedAt) > time(ref.savedAt) && time(ref.capturedAt) <= now
      : time(ref.capturedAt) <= time(ref.savedAt));
  let rows = available ? persistedRows(ref, market, game) : null;
  if (available && !rows) {
    const snapshot = snapshots.find(s => s?.id === ref.snapshotId);
    if (snapshot) rows = snapshotRows(snapshot, game, market, firstAfter ? now : time(ref.savedAt));
  }
  if (!rows || !whole(rows)
    || midpoint(counted(rows)) !== ref?.value || Math.min(...counted(rows).map(q => time(q.observedAt))) !== time(ref?.observedAt)
    || counted(rows).some(q => time(q.collectedAt) !== time(ref?.capturedAt))) {
    rows = REQUIRED.map(book => missing(book, available ? 'The individual saved quote breakdown is unavailable.' : ref?.status === 'pending' ? 'Waiting for the first line collected after this guess.' : 'No valid scoring reference was saved.'));
  }
  return { status: available ? 'available' : ref?.status === 'pending' ? 'pending' : 'unavailable', value: available ? ref.value : null,
    source: available ? ref.source : null, observedAt: available ? iso(ref.observedAt) : null,
    collectedAt: available ? iso(ref.capturedAt) : null, savedAt: iso(ref?.savedAt),
    basis: available || ref?.status === 'pending' ? (firstAfter || ref?.status === 'pending' ? 'first_line_after_submission' : 'line_at_guess') : null,
    snapshotId: available ? ref.snapshotId : null,
    reason: !available && typeof ref?.reason === 'string' ? ref.reason.slice(0, 400) : null,
    quotes: [...rows, caesars()] };
}

export function applySportsbookSources(view, snapshot, now = Date.now()) {
  if (view?.revealed !== true || !['guess_spread', 'guess_total'].includes(view.mode)) return view;
  const market = view.mode === 'guess_total' ? 'total' : 'spread';
  const snapshots = [snapshot, ...(Array.isArray(snapshot?.history) ? snapshot.history : [])].filter(Boolean);
  return { ...view, games: view.games.map(game => {
    const rows = snapshotRows(snapshot, game, market, now);
    const complete = whole(rows), used = counted(rows);
    const fresh = complete && used.every(q => now - time(q.observedAt) <= FRESH_MS) && now < time(game.kickoff);
    const latest = { status: fresh ? 'available' : complete ? 'stale' : 'unavailable',
      value: complete ? midpoint(used) : null, source: 'The Odds API · 3-book median',
      observedAt: complete ? new Date(Math.min(...used.map(q => time(q.observedAt)))).toISOString() : null,
      collectedAt: iso(snapshot?.payload?.fetchedAt), snapshotId: snapshot?.id || null, savedAt: null,
      quotes: [...rows.map(q => q.status !== 'included' || fresh ? q : { ...q, status: 'excluded',
        reason: complete ? 'Saved observation; not a fresh scoring reference now.' : 'All three qualifying sportsbooks are required for consensus.' }), caesars()] };
    return { ...game, sportsbookSources: { market, method: 'Median of DraftKings, FanDuel and BetMGM',
      requiredBooks: REQUIRED.slice(), latest, scoring: savedBoard(game, market, snapshots, now),
      actionNetwork: { status: 'unavailable', reason: 'Action Network consensus is not connected; access and display permission are required.' } } };
  }) };
}
