/** Shared, sourced last-five presentation. With no completed games, no result is inferred. */
export function TeamForm({ items, name }) {
  if (!items?.length) return null;
  return <span className="gx-team-form" role="list" aria-label={`${name}, last ${items.length} completed games, oldest first`}>
    {items.map(item => <span key={item.week} className={`gx-team-form-${item.tone}`} role="listitem" aria-label={item.words}>{item.result}</span>)}
  </span>;
}
