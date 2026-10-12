import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createServer } from '../server/index.mjs';
import { createStore, seed } from '../server/store.mjs';
import { withSyntheticLocalQuotes } from './fixtures/local-quotes.mjs';
test('HTTP rejects hostile origins, raw private data, and cross-site mutations',async t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gtl-http-'));const server=createServer(createStore(path.join(dir,'state.json'),()=>Date.parse('2026-10-08T16:00:00Z')));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();server.close();fs.rmSync(dir,{recursive:true,force:true})});const base=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await fetch(base+'/api/state?player=troy')).status,200);
 assert.equal((await fetch(base+'/api/state',{headers:{Origin:'https://evil.example'}})).status,403);
 const hostileHost = await new Promise(resolve => http.get(base+'/api/state',{headers:{Host:'evil.example'}},response=>{response.resume();resolve(response.statusCode)}));
 assert.equal(hostileHost,403);
 for(const p of ['/data/picks/2026-week-05.json','/.local/state.json','/.git/config','/server/store.mjs'])assert.equal((await fetch(base+p)).status,404);
 assert.equal((await fetch(base+'/api/ballot',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
 assert.equal((await fetch(base+'/api/ballot?player=troy&mode=guess_total',{method:'POST',headers:{Origin:'http://127.0.0.1:5173','Content-Type':'application/json'},body:JSON.stringify({picks:{'TB-DAL':44.5}})})).status,200);
 assert.equal((await fetch(base+'/api/unknown')).status,404);
});

test('HTTP revisions preserve submitted state and reject incomplete edits before mutating disk', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtl-http-revision-'));
  const file = path.join(dir, 'state.json');
  fs.writeFileSync(file, JSON.stringify(withSyntheticLocalQuotes(seed(), Date.parse('2026-10-08T16:00:00Z'))));
  const store = createStore(file, () => Date.parse('2026-10-08T16:00:00Z'));
  const server = createServer(store);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const picks = Object.fromEntries(store.view('troy', 'guess_total').games.map(game => [game.id, 45]));
  const save = body => fetch(`${base}/api/ballot?player=troy&mode=guess_total`, {
    method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const first = await save({ picks, submit: true });
  assert.equal(first.status, 200);
  const original = await first.json();
  const revision = await save({ picks: { ...picks, 'TB-DAL': 45.5 }, submit: false });
  assert.equal(revision.status, 200);
  const revised = await revision.json();
  assert.equal(revised.submittedAt, original.submittedAt);
  assert.equal(revised.revealed, true);
  assert.equal(revised.locked, false);
  assert.equal(revised.games[0].prediction, 45.5);
  assert.equal(revised.games[0].scoringReference.status, 'available');
  assert.equal(revised.score, 149, 'explicit synthetic source evidence supports this isolated HTTP fixture');
  assert.equal(revised.audit[0].before['TB-DAL'], 45);
  const persisted = fs.readFileSync(file, 'utf8');
  const invalid = await save({ picks: { 'TB-DAL': 46 }, submit: false });
  assert.equal(invalid.status, 400);
  assert.equal(fs.readFileSync(file, 'utf8'), persisted);
  const reloaded = createStore(file, () => Date.parse('2026-10-08T16:00:00Z')).view('troy', 'guess_total');
  assert.equal(reloaded.games[0].prediction, 45.5);
  assert.equal(reloaded.audit[0].type, 'ballot_edited');
});

test('HTTP submission with no stored line saves pending instead of refusing', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtl-http-source-failure-'));
  const file = path.join(dir, 'state.json'), clock = () => Date.parse('2026-10-08T16:00:00Z');
  const store = createStore(file, clock), server = createServer(store);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const picks = Object.fromEntries(store.view('troy', 'guess_total').games.map(game => [game.id, 45]));
  const save = submit => fetch(`${base}/api/ballot?player=troy&mode=guess_total`, { method: 'POST',
    headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ picks, submit }) });
  assert.equal((await save(false)).status, 200);
  const response = await save(true), view = await response.json();
  assert.equal(response.status, 200); assert.ok(view.submittedAt); assert.equal(view.revealed, true);
  assert(view.games.every(game => game.scoringReference.status === 'pending' && game.points === null));
  assert.equal(store.view('troy', 'guess_total').revealed, true);
});
