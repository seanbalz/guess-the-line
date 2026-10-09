// D-26 Virtual Units settlement from the free public nflverse schedule file.
// Usage:
//   node scripts/virtual-units-settle.mjs --season 2026 --week 5 [--file games.csv]
//     prints the p_results payload for public.gtl_settle_virtual_units (dry run, no write)
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/virtual-units-settle.mjs --season 2026 --week 5 --apply
//     settles that week through the service-only RPC and prints the summary
// The service-role key comes from the environment only and is never written to disk.
// This is the same code path a later scheduled job would call (cloud/virtual-settlement.mjs).
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { NFLVERSE_SCHEDULE_URL } from '../shared/nfl-schedule.mjs';
import { buildSettlementResults, createVirtualSettlementAdapter, settleVirtualUnitsWeek } from '../cloud/virtual-settlement.mjs';

const { values } = parseArgs({ options: { season: { type: 'string' }, week: { type: 'string' }, file: { type: 'string' }, apply: { type: 'boolean', default: false } } });
const season = Number(values.season), week = Number(values.week);
if (!Number.isInteger(season) || !Number.isInteger(week)) throw new Error('Pass --season and --week.');

if (!values.apply) {
  const text = values.file ? readFileSync(values.file, 'utf8') : await (await fetch(NFLVERSE_SCHEDULE_URL)).text();
  const { payload, finals, pending } = buildSettlementResults(text, season, week, { observedAt: new Date().toISOString() });
  console.log(JSON.stringify(payload, null, 2));
  console.error(`${season} Week ${week}: ${finals.length} finals, ${pending.length} still pending${pending.length ? ` (${pending.join(', ')})` : ''}. Dry run; nothing was settled.`);
} else {
  const url = process.env.SUPABASE_URL, serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment to apply.');
  const adapter = createVirtualSettlementAdapter({ url, serviceRoleKey });
  const service = values.file ? { ...adapter, schedule: async () => readFileSync(values.file, 'utf8') } : adapter;
  const result = await settleVirtualUnitsWeek({ season, week, service });
  console.log(JSON.stringify(result, null, 2));
  console.error(`${season} Week ${week}: ${result.finals} finals read, ${result.settled} settled, ${result.corrected} corrected, ${result.unchanged} unchanged, ${result.picksSettled} picks graded.`);
}
