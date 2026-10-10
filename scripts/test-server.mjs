import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore, seed } from '../server/store.mjs';
import { createServer } from '../server/index.mjs';
import { withSyntheticLocalQuotes } from '../tests/fixtures/local-quotes.mjs';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'gtl-browser-'));
const file=path.join(directory,'state.json'), now=Date.parse('2026-10-08T16:00:00Z');
fs.writeFileSync(file,JSON.stringify(withSyntheticLocalQuotes(seed(),now)));
const server=createServer(createStore(file,()=>now));
// Playwright reuses its request-context sockets between steps; Node closes an idle keep-alive
// socket after 5 s by default, and a request that races that close ends in ECONNRESET
// (dashboard.spec.js line 34 on 2026-10-09). The suite's sockets stay open until Playwright
// drops them; stop() still closes every connection.
server.keepAliveTimeout=0;
const port=Number(process.env.GTL_TEST_PORT||8790);
server.listen(port,'127.0.0.1',()=>console.log(`Isolated browser test server: http://127.0.0.1:${port}`));
function stop(){server.closeAllConnections();server.close();fs.rmSync(directory,{recursive:true,force:true});process.exit(0)}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
