// Operator job, not a public route. Raw inputs and outputs must stay ignored.
// Default is validation only. Publication/quote collection require explicit flags.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { validateAssessmentSnapshot, reviewResearchEvidence } from '../shared/research-assessments.mjs';
import { discoverResearchLinks, collectResearchQuotes } from '../cloud/research-provider.mjs';
import { parseCsvRows } from '../shared/trends.mjs';
import { finalAvailableAt } from '../shared/trends-research-candidates.mjs';
import { observedPlayStatistics } from '../shared/research-play-statistics.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
async function ignoredFile(name, { exists = true } = {}) {
  const target = path.resolve(ROOT, name ?? '');
  if (!target.startsWith(path.join(ROOT, '.local') + path.sep)) throw new Error('Research files must remain under ignored .local.');
  try { execFileSync('git', ['check-ignore', '--quiet', target], { cwd: ROOT, stdio: 'ignore' }); } catch { throw new Error('Research files must be Git-ignored.'); }
  let real;
  try { real = await fs.realpath(target); } catch (error) { if (exists || error.code !== 'ENOENT') throw error; real = await fs.realpath(path.dirname(target)); }
  const localRoot = path.join(await fs.realpath(ROOT), '.local');
  if (real !== localRoot && !real.startsWith(localRoot + path.sep)) throw new Error('Research paths cannot escape .local.');
  return target;
}
export async function prepareResearchIntake(input, { fetchImpl = fetch, now = Date.now() } = {}) {
  const snapshot = validateAssessmentSnapshot(input.snapshot);
  if (Date.parse(snapshot.generatedAt) > now) throw new Error('Research snapshot is future-dated.');
  const discovery = await discoverResearchLinks(input.discovery ?? [], { fetchImpl, now });
  const review = snapshot.candidates.flatMap(c => c.evidence.map(e => ({ candidateId: c.id, evidenceId: e.id,
    ...reviewResearchEvidence(e, c.selection, now, Date.parse(c.kickoff)) })));
  // Discovery is capability information; an accessible feed does not verify claims.
  snapshot.sources = discovery.map(s => ({ id: s.id, status: s.status, checkedAt: s.checkedAt }));
  return { snapshot, discovery, review };
}
export async function run(args = process.argv.slice(2)) {
  const flags = new Map();
  for (let i = 0; i < args.length; i++) {
    const k = args[i];
    if (['--publish', '--collect-quotes'].includes(k)) flags.set(k, true);
    else if (['--input', '--output'].includes(k) && args[i + 1]) flags.set(k, args[++i]);
    else throw new Error('Use --input .local/file.json [--output .local/result.json] [--collect-quotes] [--publish].');
  }
  const inputPath = await ignoredFile(flags.get('--input'));
  const raw = await fs.readFile(inputPath, 'utf8'); if (raw.length > 2000000) throw new Error('Research input is too large.');
  const input = JSON.parse(raw);
  if (flags.has('--publish') && !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.publicationId ?? '')) throw new Error('Use a stable publication ID for safe retries.');
  const prepared = await prepareResearchIntake(input);
  if (input.playByPlay) {
    const source = await fs.readFile(await ignoredFile(input.playByPlay.file));
    const schedule = await fs.readFile(await ignoredFile(input.playByPlay.scheduleFile), 'utf8');
    if (source.byteLength > 50000000 || schedule.length > 12000000) throw new Error('Statistical inputs exceed the private job limit.');
    const decoded = input.playByPlay.file.endsWith('.gz') ? gunzipSync(source, { maxOutputLength: 150000000 }).toString('utf8') : source.toString('utf8');
    const sourceHash = createHash('sha256').update(source).digest('hex');
    if (input.playByPlay.sha256 !== sourceHash) throw new Error('Play-by-play receipt does not match source bytes.');
    const plays = parseCsvRows(decoded).rows;
    const completedGames = parseCsvRows(schedule).rows.filter(r => Number(r.season) === prepared.snapshot.season && r.home_score !== '' && r.away_score !== '')
      .map(r => ({ id: r.game_id, date: r.gameday, availableAt: finalAvailableAt(r.gameday) }));
    const targets = new Map(prepared.snapshot.candidates.map(c => [c.gameId, c]));
    prepared.snapshot.playStatistics = [...targets.values()].map(c => ({ gameId: c.gameId, teams: c.gameId.split('-').map(team => observedPlayStatistics({ plays, completedGames, team,
      asOf: new Date(Math.min(Date.parse(c.kickoff) - 1, Date.parse(prepared.snapshot.generatedAt))).toISOString(), sourceHash })) }));
  }
  let rpc;
  if (flags.has('--publish') || flags.has('--collect-quotes')) {
    const origin = process.env.GTL_RESEARCH_SUPABASE_URL, key = process.env.GTL_RESEARCH_SERVICE_ROLE_KEY;
    if (!origin || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(origin) || !key) throw new Error('Research publication credentials are not configured.');
    rpc = async (name, body) => {
      const response = await fetch(`${origin}/rest/v1/rpc/${name}`, { method: 'POST', redirect: 'error', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('Research storage operation failed.');
      return response.json();
    };
  }
  if (flags.has('--collect-quotes')) {
    // Selective jobs only; no implicit full-slate or all-market provider sweep.
    if (!Array.isArray(input.quoteRequests) || input.quoteRequests.length > 4) throw new Error('Use at most four explicit game/market quote requests.');
    for (const job of input.quoteRequests) {
      const reply = await collectResearchQuotes({ ...job, season: prepared.snapshot.season, week: prepared.snapshot.week,
        rpc, apiKey: process.env.GTL_RESEARCH_ODDS_API_KEY, requestId: job.requestId });
      prepared.snapshot.quotes.push(...reply.quotes);
    }
  }
  validateAssessmentSnapshot(prepared.snapshot);
  const receipt = { version: 1, checkedAt: new Date().toISOString(), inputSha256: createHash('sha256').update(raw).digest('hex'),
    candidates: prepared.snapshot.candidates.length, eligibleClaims: prepared.review.filter(r => r.eligible).length, pendingClaims: prepared.review.filter(r => !r.eligible).length,
    availableSources: prepared.discovery.filter(s => s.status === 'available').length, published: false };
  if (flags.has('--publish')) {
    await rpc('gtl_publish_research_snapshot', { p_id: input.publicationId, p_payload: prepared.snapshot }); receipt.published = true;
  }
  if (flags.has('--output')) {
    const target = await ignoredFile(flags.get('--output'), { exists: false });
    await fs.writeFile(target, JSON.stringify({ ...prepared, receipt }, null, 2) + '\n', { mode: 0o600 });
  }
  // No content, source URLs, credentials, player identities or betting terms in job logs.
  process.stdout.write(JSON.stringify(receipt) + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run().catch(() => { process.stderr.write('Research intake failed. Check private inputs, source access and configuration.\n'); process.exitCode = 1; });
