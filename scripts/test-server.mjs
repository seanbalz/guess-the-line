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
const port=Number(process.env.GTL_TEST_PORT||8790);
server.listen(port,'127.0.0.1',()=>console.log(`Isolated browser test server: http://127.0.0.1:${port}`));
function stop(){server.closeAllConnections();server.close();fs.rmSync(directory,{recursive:true,force:true});process.exit(0)}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
