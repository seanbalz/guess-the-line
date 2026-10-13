import React from 'react';
import './sportsbookSources.css';

const BOOK_NAMES = { draftkings: 'DraftKings', fanduel: 'FanDuel', betmgm: 'BetMGM', williamhill_us: 'Caesars' };
const finite = value => typeof value === 'number' && Number.isFinite(value);
const number = value => Number.isInteger(value) ? String(value) : value.toFixed(1);
const signed = value => value === 0 ? 'PK' : `${value > 0 ? '+' : '−'}${number(Math.abs(value))}`;
const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });

function SourceTime({ label, value }) {
  const timestamp = Date.parse(value);
  return <span className="sportsbook-source-time">{label} {Number.isFinite(timestamp)
    ? <time dateTime={new Date(timestamp).toISOString()} title={new Date(timestamp).toISOString()}>{formatter.format(timestamp)}</time>
    : 'unavailable'}</span>;
}

function Line({ value, total, game }) {
  if (!finite(value)) return <span className="sportsbook-source-line">—</span>;
  return <span className="sportsbook-source-line">{total
    ? <><strong>{number(value)}</strong><span>combined points · Over / Under</span></>
    : <><strong>{game.homeCode || game.home} {signed(value)}</strong><span>{game.homeCode || game.home} home · {game.awayCode || game.away} away {signed(-value)}</span></>}</span>;
}

function ReferenceSummary({ reference, saved, total, game }) {
  const available = reference?.status === 'available' && finite(reference.value);
  const stale = !saved && reference?.status === 'stale' && finite(reference.value);
  const present = available || stale;
  const pending = saved && reference?.status === 'pending';
  const state = saved ? available ? reference?.basis === 'first_line_after_submission' ? 'First line after submission' : 'Line at your guess' : pending ? 'Waiting for first line' : 'Unscored'
    : stale ? 'Stale collection' : available ? 'Latest collected' : 'Unavailable';
  return <section className={`sportsbook-reference ${saved ? 'sportsbook-reference-saved' : ''}`} aria-label={saved ? 'Saved scoring consensus' : 'Latest collected consensus'}>
    <div className="sportsbook-reference-heading"><h4>{saved ? 'Saved scoring consensus' : 'Latest collected consensus'}</h4><span className={`sportsbook-source-status ${saved && available ? 'is-included' : stale || !present ? 'is-excluded' : ''}`}>{state}</span></div>
    <Line value={present ? reference.value : null} total={total} game={game}/>
    {reference?.source && <p className="sportsbook-source-provider">{reference.source}</p>}
    <div className="sportsbook-source-times">
      {saved && <SourceTime label="Saved with guess" value={reference?.savedAt}/>}
      <SourceTime label="Observed" value={reference?.observedAt}/>
      <SourceTime label="Collected" value={reference?.collectedAt}/>
    </div>
    <p className="sportsbook-source-explanation">{saved
      ? available ? 'This saved line determines your points, whatever its age. Later market movement does not change it.'
        : pending ? 'No line was stored yet when you saved this guess. The first line collected after it becomes its reference.'
          : reference?.reason || (reference?.status === 'stale' ? 'The source was stale when this guess was saved under the earlier five-minute rule. It remains unscored.' : 'No eligible consensus was saved for this guess.')
      : stale ? 'These are retained prices from an older collection, not current betting lines.'
        : available ? 'A collected market reference, not a continuously live price. It does not replace your saved scoring consensus.'
          : reference?.reason || 'No qualifying collected consensus is available.'}</p>
  </section>;
}

function Quote({ quote, saved, stale, total, game }) {
  const status = ['included', 'excluded', 'missing'].includes(quote?.status) ? quote.status : 'missing';
  const label = status === 'included' ? saved ? 'Included when saved' : 'Included in collection'
    : status === 'excluded' ? stale ? 'Excluded from new scoring' : 'Excluded' : 'Unavailable';
  return <div className="sportsbook-quote">
    <span className={`sportsbook-source-status is-${status}`}>{label}</span>
    <Line value={status === 'missing' ? null : quote?.value} total={total} game={game}/>
    {quote?.reason && <p className="sportsbook-quote-reason">{quote.reason}</p>}
    {!quote && <p className="sportsbook-quote-reason">No book-level evidence is available for this reference.</p>}
    {status !== 'missing' && <div className="sportsbook-source-times"><SourceTime label="Observed" value={quote?.observedAt}/><SourceTime label="Collected" value={quote?.collectedAt}/></div>}
  </div>;
}

// Render only the authenticated, market-scoped server projection. Do not derive
// consensus or source eligibility from arbitrary raw quotes in the browser.
export default function SportsbookSources({ data, game, open = false }) {
  const market = data?.mode === 'guess_spread' ? 'spread' : data?.mode === 'guess_total' ? 'total' : null;
  const sources = game?.sportsbookSources;
  if (data?.revealed !== true || !market || sources?.market !== market) return null;
  const total = market === 'total';
  const savedQuotes = Array.isArray(sources.scoring?.quotes) ? sources.scoring.quotes : [];
  const latestQuotes = Array.isArray(sources.latest?.quotes) ? sources.latest.quotes : [];
  const required = Array.isArray(sources.requiredBooks) ? sources.requiredBooks.filter(book => typeof book === 'string') : [];
  const books = [...new Set([...required, ...savedQuotes.map(q => q.book), ...latestQuotes.map(q => q.book)])].filter(book => typeof book === 'string' && book);
  const name = book => [...savedQuotes, ...latestQuotes].find(quote => quote.book === book && quote.source)?.source || BOOK_NAMES[book] || 'Source name unavailable';
  const findQuote = (quotes, book) => {
    const matches = quotes.filter(quote => quote.book === book);
    return matches.length === 1 ? matches[0] : null;
  };
  const matchup = `${game.awayCode || game.away} at ${game.homeCode || game.home}`;
  return <section className="sportsbook-sources" aria-label={`${total ? 'Total' : 'Spread'} sportsbook sources for ${matchup}`}>
    <header className="sportsbook-sources-heading"><div><h3>Sportsbook sources</h3><p>{matchup} · {total ? 'Combined points' : 'Signed home spread'}</p></div><span className="sportsbook-source-status">{total ? 'Over / Under' : 'Spread'}</span></header>
    <div className="sportsbook-reference-grid"><ReferenceSummary reference={sources.scoring} saved total={total} game={game}/><ReferenceSummary reference={sources.latest} total={total} game={game}/></div>
    <details className="sportsbook-source-details" open={open}>
      <summary>View sportsbook quotes and timestamps <span aria-hidden="true">+</span></summary>
      <div className="sportsbook-source-method"><strong>How consensus is calculated</strong><p>The median is the middle value after eligible sportsbook lines are ordered. {required.length > 0 && <>Required books: {required.map(name).join(', ')}. </>}Only qualifying quotes can form a new scoring reference. Older quotes can explain a retained consensus even when they are now excluded from new scoring.</p><p>Observation times are the provider’s recorded market updates, not confirmed sportsbook-issued timestamps. All displayed times are Pacific.</p></div>
      {books.length ? <div className="sportsbook-source-table-wrap"><table className="sportsbook-source-table"><caption className="sr-only">Sportsbook quotes used for saved scoring and the latest collected {market} consensus for {matchup}</caption><thead><tr><th scope="col">Sportsbook</th><th scope="col">Saved with your guess</th><th scope="col">Latest collection</th></tr></thead><tbody>{books.map(book => <tr key={book}><th scope="row"><strong>{name(book)}</strong><span>{required.includes(book) ? 'Required for consensus' : 'Not a required book'}</span></th><td data-label="Saved with your guess"><Quote quote={findQuote(savedQuotes, book)} saved total={total} game={game}/></td><td data-label="Latest collection"><Quote quote={findQuote(latestQuotes, book)} stale={sources.latest?.status === 'stale'} total={total} game={game}/></td></tr>)}</tbody></table></div> : <p className="sportsbook-source-empty">Book-level evidence has not been provided. No sportsbook values are inferred from the aggregate.</p>}
      <aside className="sportsbook-action-status" aria-label="Action Network consensus status"><div><strong>Action Network consensus</strong><span className="sportsbook-source-status is-missing">Not connected</span></div><p>{sources.actionNetwork?.reason || 'Action Network consensus is not connected; access and display permission are required.'}</p><p>Sportsbook consensus shown here is calculated from the included books. It is not an Action Network consensus.</p></aside>
    </details>
  </section>;
}
