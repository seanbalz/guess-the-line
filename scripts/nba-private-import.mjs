// Build an administrator-only atomic import. Inputs/output contain private records;
// keep them outside this public repository. This module never connects to a database.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const scaled = (value, places) => {
  const fixed = value.toFixed(places);
  assert.equal(Number(fixed), value, 'Terms exceed supported decimal precision');
  return BigInt(fixed.replace('.', ''));
};
function netUnits(entry) {
  const stake = scaled(entry.stakeUnits, 8), odds = scaled(entry.odds, 4);
  if (entry.outcome === 'pending') return null;
  if (entry.outcome === 'loss') return -entry.stakeUnits;
  if (entry.outcome !== 'win') return 0;
  const numerator = odds > 0n ? stake * odds : stake * 1000000n;
  const denominator = odds > 0n ? 1000000n : -odds;
  const net = (numerator + denominator / 2n) / denominator;
  assert.ok(net <= BigInt(Number.MAX_SAFE_INTEGER), 'Result exceeds lossless import precision');
  return Number(net) / 1e8;
}

export function prepareNbaImport(sourceText, { ownerId, importId, stakeBasisOverrides = {} }) {
  assert.match(ownerId, uuid);
  assert.match(importId, uuid);
  ownerId = ownerId.toLowerCase();
  importId = importId.toLowerCase();
  const overrides = new Map();
  for (const [id, basis] of Object.entries(stakeBasisOverrides)) {
    assert.match(id, uuid);
    assert.ok(typeof basis === 'string' && basis.trim().length > 0);
    assert.ok(!overrides.has(id.toLowerCase()), 'Duplicate normalized provenance override');
    overrides.set(id.toLowerCase(), basis);
  }
  const source = JSON.parse(sourceText);
  assert.ok(Array.isArray(source.entries) && source.entries.length > 0);
  const rows = source.entries.map(entry => {
    assert.match(entry.id, uuid);
    assert.equal(entry.sport, 'nba');
    assert.ok(Number.isFinite(entry.odds) && Math.abs(entry.odds) >= 100 && Math.abs(entry.odds) <= 1000000);
    assert.ok(Number.isFinite(entry.stakeUnits) && entry.stakeUnits > 0 && entry.stakeUnits < 1000000);
    assert.match(entry.eventDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(['pending', 'win', 'loss', 'push', 'void'].includes(entry.outcome));
    assert.ok(Array.isArray(entry.legs) && entry.legs.every(leg => leg.gameId?.startsWith('NBA:')));
    assert.equal(entry.netUnits, netUnits(entry), 'Source result must reconcile before import');
    const override = overrides.get(entry.id.toLowerCase());
    return { id: entry.id.toLowerCase(), owner_id: ownerId, import_id: importId, sport: 'nba', season: entry.season,
      event_date: entry.eventDate, kind: entry.kind, label: entry.label, legs: entry.legs,
      odds: entry.odds, stake_units: entry.stakeUnits, outcome: entry.outcome,
      provenance: { oddsBasis: entry.oddsBasis, stakeBasis: override ?? entry.stakeBasis,
        ...(override ? { correction: 'Stake provenance clarified from original user instruction; numeric terms unchanged.' } : {}),
        sportsbook: entry.sportsbook ?? null, placedAt: entry.placedAt ?? null, quotedAt: entry.quotedAt ?? null,
        settlement: entry.settlement ?? null }, source_record: entry };
  });
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length, 'Duplicate source tickets');
  assert.ok([...overrides.keys()].every(id => rows.some(row => row.id === id)));
  const sourceSha256 = createHash('sha256').update(sourceText).digest('hex');
  const payload = quote(JSON.stringify(source));
  const tickets = quote(JSON.stringify(rows));
  let delimiter = '$nba_import$';
  while (payload.includes(delimiter) || tickets.includes(delimiter)) delimiter = delimiter.replace('$nba_', '$nba_x');
  // Row comparisons make retries no-ops only for an identical import. No overwrite on a collision.
  const sql = `begin;
set local standard_conforming_strings = on;
insert into nba_private.bet_imports(id,owner_id,source_sha256,source_payload)
values (${quote(importId)},${quote(ownerId)},${quote(sourceSha256)},${payload}::jsonb) on conflict do nothing;
do ${delimiter}
begin
  if not exists (select 1 from nba_private.bet_imports where id=${quote(importId)} and owner_id=${quote(ownerId)}
    and source_sha256=${quote(sourceSha256)} and source_payload=${payload}::jsonb) then
    raise exception 'NBA_IMPORT_CONFLICT';
  end if;
end ${delimiter};
insert into nba_private.bets(id,owner_id,import_id,sport,season,event_date,kind,label,legs,odds,stake_units,outcome,provenance,source_record)
select id,owner_id,import_id,sport,season,event_date,kind,label,legs,odds,stake_units,outcome,provenance,source_record
from jsonb_populate_recordset(null::nba_private.bets,${tickets}::jsonb) on conflict do nothing;
do ${delimiter}
begin
  if (select count(*) from nba_private.bets where import_id=${quote(importId)} and owner_id=${quote(ownerId)}) <> ${rows.length}
    or exists (select 1 from jsonb_array_elements(${tickets}::jsonb) e
      left join nba_private.bets b on b.id=(e->>'id')::uuid
      where b.id is null
        or b.owner_id is distinct from (e->>'owner_id')::uuid
        or b.import_id is distinct from (e->>'import_id')::uuid
        or b.sport is distinct from e->>'sport'
        or b.source_record is distinct from e->'source_record'
        or b.provenance is distinct from e->'provenance'
        -- Before any app correction, verify current terms/net too. Later revisions
        -- preserve their original source above without overwriting corrected terms.
        or (coalesce((to_jsonb(b)->>'revision')::integer,1) <= 1 and
          (to_jsonb(b)-'net_units'-'imported_at'-'revision'-'updated_at'-'price_input' <> e
            or b.net_units is distinct from (e->'source_record'->>'netUnits')::numeric))) then
    raise exception 'NBA_TICKET_CONFLICT';
  end if;
end ${delimiter};
commit;`;
  return { sourceSha256, importId, rows, sql };
}
