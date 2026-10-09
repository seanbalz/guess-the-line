import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: [new URL('../web/src/SportsbookSources.jsx', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm', loader: { '.css': 'empty' } });
const { default: SportsbookSources } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const observedAt = '2026-10-08T18:00:12.000Z';
const collectedAt = '2026-10-08T18:01:34.000Z';
const savedAt = '2026-10-08T18:02:56.000Z';
function fixture() {
  const quotes = [{ book: 'draftkings', source: 'DraftKings', value: -3, status: 'included', observedAt, collectedAt },
    { book: 'fanduel', source: 'FanDuel', value: -3.5, status: 'included', observedAt, collectedAt },
    { book: 'betmgm', source: 'BetMGM', value: -4, status: 'included', observedAt, collectedAt },
    { book: 'williamhill_us', source: 'Caesars', value: null, status: 'missing', reason: 'Unavailable on the current free provider plan' }];
  const reference = { status: 'available', value: -3.5, source: 'The Odds API · 3-book median', observedAt, collectedAt, savedAt, quotes };
  return { data: { mode: 'guess_spread', revealed: true }, game: { id: 'TEST', homeCode: 'HOME', awayCode: 'AWAY', marketQuotes: [{ source: 'Raw hidden source', value: 97.5 }], sportsbookSources: {
    market: 'spread', method: 'median', requiredBooks: ['draftkings', 'fanduel', 'betmgm'], scoring: structuredClone(reference), latest: structuredClone(reference),
    actionNetwork: { status: 'unavailable', reason: 'Action Network consensus is not connected; access and display permission are required.' },
  } } };
}
const render = props => renderToStaticMarkup(React.createElement(SportsbookSources, { ...props, open: true }));

test('source detail is hidden until the same market is explicitly revealed', () => {
  for (const patch of [{ revealed: false }, { revealed: undefined }, { revealed: 'true' }, { mode: 'betting_challenge' }, { mode: 'guess_total' }]) {
    const props = fixture(); Object.assign(props.data, patch); assert.equal(render(props), '');
  }
  const absent = fixture(); delete absent.game.sportsbookSources; assert.equal(render(absent), '');
});

test('renders approved books, both spread perspectives and exact source times without reading raw quotes', () => {
  const html = render(fixture());
  for (const label of ['DraftKings', 'FanDuel', 'BetMGM', 'Caesars', 'HOME −3.5', 'HOME home · AWAY away +3.5', 'Saved scoring consensus', 'Latest collected consensus', 'Included when saved', 'Included in collection']) assert(html.includes(label), label);
  assert(html.includes(`dateTime="${observedAt}"`)); assert(html.includes(`title="${collectedAt}"`)); assert(html.includes('11:00:12 AM PDT'));
  assert(!html.includes('Raw hidden source')); assert(!html.includes('97.5'));
  assert(html.includes('Required books: DraftKings, FanDuel, BetMGM.')); assert(!html.includes('Required books: DraftKings, FanDuel, BetMGM, Caesars'));
  assert(html.includes('Unavailable on the current free provider plan'));
});

test('old eligible saved references keep scoring while current collection becomes stale', () => {
  const props = fixture();
  props.game.sportsbookSources.method = 'Median of DraftKings, FanDuel and BetMGM';
  props.game.sportsbookSources.latest.status = 'stale';
  props.game.sportsbookSources.latest.value = -6.5;
  props.game.sportsbookSources.latest.quotes = props.game.sportsbookSources.latest.quotes.map(quote => quote.status === 'included' ? { ...quote, status: 'excluded' } : quote);
  const html = render(props);
  assert(html.includes('Saved for scoring')); assert(html.includes('HOME −3.5')); assert(html.includes('HOME −6.5'));
  assert(html.includes('Stale collection')); assert(html.includes('Later market movement and quote age do not change it.'));
  assert(html.includes('Excluded from new scoring')); assert(html.includes('Included when saved'));
  assert(html.includes('The median is the middle value after eligible sportsbook lines are ordered.'));
  assert(html.includes('Older quotes can explain a retained consensus'));
  assert(!html.includes('>Unscored<'));
});

test('missing and stale-at-save references stay unscored without borrowing the latest median', () => {
  for (const status of ['unavailable', 'stale']) {
    const props = fixture(); props.game.sportsbookSources.scoring = { status, value: 91.5, savedAt, quotes: [] };
    const html = render(props);
    assert(html.includes('>Unscored<')); assert(!html.includes('91.5'));
    assert(html.includes('No book-level evidence is available for this reference.'));
    assert(html.includes('HOME −3.5'));
  }
});

test('exclusions and missing sources carry reasons and do not manufacture zero lines', () => {
  const props = fixture();
  props.game.sportsbookSources.latest.quotes[0] = { book: 'draftkings', source: 'DraftKings', status: 'excluded', value: -7, observedAt, collectedAt, reason: 'Provider observation was too old at collection.' };
  const html = render(props);
  assert(html.includes('>Excluded<')); assert(html.includes('Provider observation was too old at collection.')); assert(html.includes('HOME −7'));
  assert(!html.includes('HOME PK'));
  assert(html.includes('Action Network consensus is not connected'));
  assert(html.includes('It is not an Action Network consensus.'));
});

test('total sources show combined points, preserve legitimate zero, and never render spread signs', () => {
  const props = fixture(); props.data.mode = 'guess_total'; props.game.sportsbookSources.market = 'total';
  for (const reference of [props.game.sportsbookSources.scoring, props.game.sportsbookSources.latest]) {
    reference.value = 0; reference.quotes = reference.quotes.map(quote => ({ ...quote, value: quote.status === 'missing' ? null : 0 }));
  }
  const html = render(props);
  assert(html.includes('<strong>0</strong>')); assert(html.includes('combined points · Over / Under'));
  assert(!html.includes('HOME PK')); assert(!html.includes('home · AWAY away'));
});

test('duplicate book evidence is withheld instead of selecting an arbitrary source quote', () => {
  const props = fixture(); props.game.sportsbookSources.scoring.quotes.push({ ...props.game.sportsbookSources.scoring.quotes[0], value: 88.5 });
  const html = render(props); assert(!html.includes('88.5')); assert(html.includes('No book-level evidence is available for this reference.'));
});

test('source text is escaped and absent times remain explicitly unavailable', () => {
  const props = fixture(); props.game.sportsbookSources.latest.source = '<script>private()</script>';
  props.game.sportsbookSources.latest.observedAt = 'invalid'; props.game.sportsbookSources.latest.collectedAt = null;
  const html = render(props);
  assert(!html.includes('<script>private()')); assert(html.includes('&lt;script&gt;private()&lt;/script&gt;'));
  assert(html.includes('Observed unavailable')); assert(html.includes('Collected unavailable')); assert(!html.includes('Invalid Date'));
});
