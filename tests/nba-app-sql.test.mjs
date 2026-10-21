import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PRELUDE } from './migrations.mjs';
import { prepareNbaImport } from '../scripts/nba-private-import.mjs';
import { createCloudHandler } from '../cloud/handler.mjs';
const { PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js');
const api = await import('../shared/nba-bets.mjs').catch(() => ({}));
const file = '20261021223000_gtl_nba_app_bets.sql';
const owner = '00000000-0000-4000-8000-000000000001', other = '00000000-0000-4000-8000-000000000002';
const ticketId = '00000000-0000-4000-8000-000000000010';
const raw = (changes = {}) => ({ id: ticketId, season: '2026-27', eventDate: '2026-10-21', kind: 'single', label: 'Synthetic ticket',
  legs: [{ gameId: 'NBA:synthetic:1', matchup: 'AAA at BBB', market: 'moneyline', team: 'AAA' }],
  priceInput: { format: 'american', value: 125 }, stakeUnits: 0.12345678, outcome: 'pending', ...changes });
async function setup(t) {
  assert.ok(fs.existsSync(`supabase/migrations/${file}`), 'NBA app migration exists');
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`${PRELUDE} insert into auth.users values ('${owner}'),('${other}');`);
  await db.exec(fs.readFileSync('supabase/migrations/20261021201054_gtl_private_nba_storage.sql', 'utf8'));
  await db.exec('alter default privileges grant all on tables to anon,authenticated,service_role;');
  await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
  const rpc = async (name, params) => (await db.query(`select public.${name}(${params.map((_, i) => `$${i + 1}`).join(',')}) result`, params)).rows[0].result;
  const save = (ticket = raw(), revision = 0, operation = '00000000-0000-4000-8000-000000000020', who = owner, reason = null) =>
    rpc('gtl_nba_save_bet', [who, operation, api.normalizeNbaTicket(ticket), revision, reason]);
  const read = (who = owner, filters = {}, cursor = null, id = null) => rpc('gtl_nba_read_bets', [who, filters, cursor, id]);
  return { db, rpc, save, read };
}

test('SQL receipts give exact retries, revision conflicts and safe cross-owner denials', async t => {
  const { db, save, read } = await setup(t);
  const first = await save(); assert.equal(first.ticket.revision, 1); assert.equal(first.ticket.netUnits, null);
  assert.deepEqual(await save(), first);
  const corrected = await save(raw({ outcome: 'win' }), 1, '00000000-0000-4000-8000-000000000021', owner, 'Owner confirmed result');
  assert.equal(corrected.ticket.revision, 2); assert.equal(corrected.ticket.netUnits, '0.15432098');
  assert.equal(corrected.ticket.audit.length, 2);
  assert.deepEqual(await save(), first, 'late retry returns its original receipt');
  await assert.rejects(save(raw({ outcome: 'loss' })), /GTL_NBA_OPERATION_CONFLICT/);
  await assert.rejects(save(raw({ outcome: 'loss' }), 1, '00000000-0000-4000-8000-000000000022', owner, 'Correction'), /GTL_NBA_CONFLICT/);
  await assert.rejects(save(raw({ outcome: 'loss' }), 2, '00000000-0000-4000-8000-000000000023', other, 'Correction'), /GTL_NBA_NOT_FOUND/);
  assert.equal((await read(other)).tickets.length, 0); assert.equal((await read(other, {}, null, ticketId)).tickets.length, 0);
  const result = await read(); assert.equal(result.summary.netUnits, '0.15432098');
  assert.ok(!JSON.stringify(result).match(/owner_id|source_record|provenance|source_payload/));
  assert.deepEqual((await db.query("select proname,prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and proname like 'gtl_nba_%' order by proname")).rows,
    ['gtl_nba_read_bets', 'gtl_nba_save_bet'].map(proname => ({ proname, prosecdef: true, proconfig: ['search_path=pg_catalog'] })));
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal((await db.query(`select has_table_privilege('${role}','nba_private.bets','SELECT') allowed`)).rows[0].allowed, false);
    assert.equal((await db.query(`select has_function_privilege('${role}','public.gtl_nba_save_bet(uuid,uuid,jsonb,integer,text)','EXECUTE') allowed`)).rows[0].allowed, role === 'service_role');
    assert.equal((await db.query(`select has_table_privilege('${role}','nba_private.bet_changes','SELECT') allowed`)).rows[0].allowed, false);
    await db.exec(`set role ${role}`);
    try {
      if (role === 'service_role') assert.equal((await read()).tickets.length, 1);
      else await assert.rejects(read(), /permission denied/);
    } finally { await db.exec('reset role'); }
  }
});

test('SQL filters summarize the whole matching set while date/ID cursors page at 100', async t => {
  const { db, save, read } = await setup(t);
  for (let i = 1; i <= 153; i++) {
    const suffix = String(i).padStart(12, '0');
    await save(raw({ id: `10000000-0000-4000-8000-${suffix}`, outcome: ['pending', 'win', 'loss', 'push', 'void'][i % 5] }), 0, `20000000-0000-4000-8000-${suffix}`);
  }
  const first = await read(); assert.equal(first.tickets.length, 100); assert.equal(first.summary.count, 153); assert.ok(first.nextCursor);
  assert.equal(first.summary.pendingStakeUnits, '3.70370340');
  const second = await read(owner, {}, first.nextCursor); assert.equal(second.tickets.length, 53); assert.equal(second.nextCursor, null);
  assert.deepEqual(second.summary, first.summary);
  assert.equal(new Set([...first.tickets, ...second.tickets].map(ticket => ticket.id)).size, 153);
  const settled = await read(owner, { status: 'settled' });
  assert.equal(settled.tickets.length, 100); assert.equal(settled.summary.count, 123);
  assert.deepEqual(settled.summary, { count: 123, wins: 31, losses: 31, pushes: 31, voids: 30, pending: 0,
    riskUnits: '11.48148054', netUnits: '0.95679020', pendingStakeUnits: '0.00000000', roi: '8.33333468' });
  const settledNext = await read(owner, { status: 'settled' }, settled.nextCursor);
  assert.equal(settledNext.tickets.length, 23); assert.equal(settledNext.nextCursor, null);
  assert.deepEqual(settledNext.summary, settled.summary);
  assert.ok([...settled.tickets, ...settledNext.tickets].every(ticket => ticket.outcome !== 'pending'));
  assert.equal(new Set([...settled.tickets, ...settledNext.tickets].map(ticket => ticket.id)).size, 123);
  for (const outcome of ['pending', 'win', 'loss', 'push', 'void']) {
    const result = await read(owner, { status: outcome, market: 'moneyline', from: '2026-10-21', to: '2026-10-21' });
    assert.ok(result.tickets.every(ticket => ticket.outcome === outcome));
    assert.equal(result.summary.count, result.tickets.length);
    if (['push', 'void', 'pending'].includes(outcome)) assert.equal(result.summary.netUnits, '0.00000000');
    if (['void', 'pending'].includes(outcome)) assert.equal(result.summary.riskUnits, '0.00000000');
  }
  const before = (await db.query('select count(*)::int n from nba_private.bets')).rows[0].n;
  const receiptCount = (await db.query('select count(*)::int n from nba_private.bet_changes')).rows[0].n;
  await db.exec("create function public.gtl_nfl_sentinel() returns integer language sql as $$select 42$$;grant execute on function public.gtl_nfl_sentinel() to service_role");
  await db.exec(fs.readFileSync(`supabase/rollback/${file}`, 'utf8'));
  assert.equal((await db.query('select count(*)::int n from nba_private.bets')).rows[0].n, before);
  assert.equal((await db.query('select count(*)::int n from nba_private.bet_changes')).rows[0].n, receiptCount);
  assert.equal((await db.query("select public.gtl_nfl_sentinel() n,has_function_privilege('service_role','public.gtl_nfl_sentinel()','EXECUTE') allowed")).rows[0].allowed, true);
  assert.equal((await db.query("select has_function_privilege('service_role','public.gtl_nba_read_bets(uuid,jsonb,jsonb,uuid)','EXECUTE') allowed")).rows[0].allowed, false);
  assert.equal((await db.query("select has_function_privilege('service_role','public.gtl_nba_save_bet(uuid,uuid,jsonb,integer,text)','EXECUTE') allowed")).rows[0].allowed, false);
});

test('cloud-to-SQL saves round probability ties and preserve large payouts, receipts and summary decimals', async t => {
  const { db, rpc, read } = await setup(t);
  const handler = createCloudHandler({ authenticate: async () => ({ id: owner, email: 'synthetic@example.test', emailConfirmed: true }), nba: { rpc: (name, params) => rpc(name, Object.values(params)) } });
  const send = async (ticket, expectedRevision, suffix, reason) => {
    const response = await handler(new Request('https://fixture.invalid/gtl-api/nba/save', { method: 'POST', headers: { authorization: 'Bearer synthetic', 'content-type': 'application/json' },
      body: JSON.stringify({ ticket, expectedRevision, operationId: `50000000-0000-4000-8000-${suffix}`, ...(reason ? { reason } : {}) }) }));
    assert.equal(response.status, 200); return response.json();
  };
  const pending = raw({ priceInput: { format: 'probability', value: 7.952e1 } });
  const first = await send(pending, 0, '000000000001'); assert.equal(first.ticket.odds, -388.2813);
  const win = raw({ stakeUnits: 999999.12345678, priceInput: { format: 'american', value: 999999.9876 }, outcome: 'win' });
  const result = await send(win, 1, '000000000002', 'Synthetic result');
  assert.equal(result.ticket.netUnits, '9999991110.56790869');
  assert.equal(result.ticket.audit[1].before.netUnits, null); assert.equal(result.ticket.audit[1].after.netUnits, '9999991110.56790869');
  assert.deepEqual(await send(win, 1, '000000000002', 'Synthetic result'), result);
  assert.deepEqual(await send(pending, 0, '000000000001'), first);
  assert.equal((await db.query('select net_units from nba_private.bets')).rows[0].net_units, '9999991110.56790869');
  const summary = (await read()).summary;
  assert.equal(summary.riskUnits, '999999.12345678'); assert.equal(summary.netUnits, '9999991110.56790869');
  assert.equal(summary.roi, '999999.98760000');
  const response = await handler(new Request('https://fixture.invalid/gtl-api/nba/read', { method: 'POST', headers: { authorization: 'Bearer synthetic', 'content-type': 'application/json' }, body: '{}' }));
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).summary, summary);
});

test('SQL pending stake covers all matching tickets beyond the first pending page', async t => {
  const { save, read, rpc } = await setup(t);
  for (let i = 1; i <= 105; i++) {
    const suffix = String(i).padStart(12, '0');
    await save(raw({ id: `60000000-0000-4000-8000-${suffix}`, stakeUnits: 999999.12345678 }), 0, `70000000-0000-4000-8000-${suffix}`);
  }
  const first = await read(owner, { status: 'pending' });
  assert.equal(first.tickets.length, 100); assert.ok(first.nextCursor);
  assert.deepEqual(first.summary, { count: 105, wins: 0, losses: 0, pushes: 0, voids: 0, pending: 105,
    riskUnits: '0.00000000', netUnits: '0.00000000', pendingStakeUnits: '104999907.96296190', roi: null });
  const second = await read(owner, { status: 'pending' }, first.nextCursor);
  assert.equal(second.tickets.length, 5); assert.equal(second.nextCursor, null); assert.deepEqual(second.summary, first.summary);
  for (const [i, value] of [20.48, 1e-2, 99.99].entries()) {
    const suffix = String(i + 106).padStart(12, '0');
    const ticket = raw({ id: `60000000-0000-4000-8000-${suffix}`, stakeUnits: 1e-8, outcome: 'win', priceInput: { format: 'probability', value } });
    const result = await save(ticket, 0, `70000000-0000-4000-8000-${suffix}`);
    assert.equal(result.ticket.netUnits, api.normalizeNbaTicket(ticket).netUnits);
  }
  await assert.rejects(rpc('gtl_nba_save_bet', [owner, '80000000-0000-4000-8000-000000000001',
    { ...api.normalizeNbaTicket(raw({ outcome: 'win' })), netUnits: 0.15432098 }, 0, null]), /GTL_NBA_INVALID/);
});

test('app corrections preserve original import payloads, records and price precision', async t => {
  const { db, save, read } = await setup(t);
  const imported = { entries: [{ ...raw(), sport: 'nba', odds: 125, outcome: 'win', netUnits: 0.15432098, oddsBasis: 'Synthetic quote', stakeBasis: 'Synthetic units' }] };
  delete imported.entries[0].priceInput;
  delete imported.entries[0].legs[0].matchup;
  const prepared = prepareNbaImport(JSON.stringify(imported), { ownerId: owner, importId: '00000000-0000-4000-8000-000000000003' });
  await db.exec(prepared.sql);
  const original = (await db.query('select source_payload from nba_private.bet_imports')).rows;
  const records = (await db.query('select source_record,provenance,import_id,imported_at from nba_private.bets')).rows;
  const ticket = (await read()).tickets[0]; assert.equal(ticket.revision, 1); assert.deepEqual(ticket.priceInput, { format: 'american', value: 125 });
  const correction = raw({ outcome: 'push', label: 'Corrected synthetic label', stakeUnits: 0.7,
    priceInput: { format: 'american', value: -132.5581 }, legs: imported.entries[0].legs });
  const corrected = await save(correction, 1, '00000000-0000-4000-8000-000000000021', owner, 'Owner correction');
  await db.exec(prepared.sql);
  assert.deepEqual((await read()).tickets[0], corrected.ticket, 'original replay never overwrites an audited correction');
  assert.deepEqual((await db.query('select source_payload from nba_private.bet_imports')).rows, original);
  assert.deepEqual((await db.query('select source_record,provenance,import_id,imported_at from nba_private.bets')).rows, records);
  const different = structuredClone(imported); different.entries[0].label = 'Mismatched original';
  for (const sql of [prepareNbaImport(JSON.stringify(different), { ownerId: owner, importId: '00000000-0000-4000-8000-000000000003' }).sql,
    prepareNbaImport(JSON.stringify(imported), { ownerId: other, importId: '00000000-0000-4000-8000-000000000004' }).sql]) {
    await assert.rejects(db.exec(sql), /NBA_IMPORT_CONFLICT|NBA_TICKET_CONFLICT/); await db.exec('rollback');
  }
  await assert.rejects(db.exec("update nba_private.bet_imports set source_payload='{}'"), /GTL_NBA_ARCHIVE_IMMUTABLE/);
  await assert.rejects(db.exec("update nba_private.bets set source_record='{}'"), /GTL_NBA_ARCHIVE_IMMUTABLE/);
});

test('SQL rejects malformed direct service inputs and append-only receipt mutation', async t => {
  const { db, rpc, save } = await setup(t);
  await save();
  for (const changes of [{ ownerId: other }, { odds: 0 }, { stakeUnits: 'NaN' }, { legs: [] }, { priceInput: { format: 'probability', value: 100 } }]) {
    await assert.rejects(rpc('gtl_nba_save_bet', [owner, '30000000-0000-4000-8000-000000000001', { ...api.normalizeNbaTicket(raw()), ...changes }, 0, null]), /GTL_NBA_INVALID/);
  }
  for (const filters of [{ from: '2026-02-30' }, { status: null }, { owner_id: owner }, { from: '2026-12-01', to: '2026-10-01' }]) {
    await assert.rejects(rpc('gtl_nba_read_bets', [owner, filters, null, null]), /GTL_NBA_INVALID/);
  }
  await assert.rejects(db.exec("update nba_private.bet_changes set reason='edited'"), /GTL_NBA_AUDIT_IMMUTABLE/);
  await assert.rejects(db.exec('delete from nba_private.bet_changes'), /GTL_NBA_AUDIT_IMMUTABLE/);
  const initialSource = (await db.query('select source_record,provenance from nba_private.bets')).rows[0];
  assert.equal(initialSource.source_record.source, 'manual'); assert.equal(initialSource.provenance.source, 'manual');
  assert.deepEqual(initialSource.source_record.ticket, api.normalizeNbaTicket(raw()));
});
