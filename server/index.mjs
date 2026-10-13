import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createStore } from './store.mjs';
import { SubmissionReferenceError } from './engine.mjs';
import { SocialError } from '../shared/social-bets.mjs';
// Served under X-Content-Type-Options: nosniff, so every published asset type needs an entry; unknown types stay octet-stream.
const mimeTypes = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.webmanifest':'application/manifest+json','.json':'application/json','.txt':'text/plain'};
export function createServer(store = createStore(), { dist = path.resolve(import.meta.dirname, '../dist') } = {}) {
  return http.createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    const send = (status,data) => {res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    try {
      if(!/^(localhost|127\.0\.0\.1):\d+$/.test(req.headers.host || '')) return send(403,{error:'This workspace is only available on localhost.'});
      const url = new URL(req.url,'http://127.0.0.1');
      if(url.pathname.startsWith('/api/')) {
        if(req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && !/^http:\/\/(localhost|127\.0\.0\.1):5173$/.test(req.headers.origin)) return send(403,{error:'Untrusted origin.'});
        const player=url.searchParams.get('player') || 'sean', mode=url.searchParams.get('mode') || 'guess_spread';
        if(req.method==='GET' && url.pathname==='/api/state') return send(200,store.view(player,mode));
        if(req.method==='GET' && url.pathname==='/api/export') return send(200,store.export(player));
        if(req.method==='POST') {
          if(!req.headers.origin || req.headers['content-type']!=='application/json') return send(403,{error:'Same-origin JSON requests are required.'});
          let raw=''; for await(const part of req) {raw+=part;if(raw.length>32000) return send(413,{error:'Request too large.'});}
          let body; try {body=JSON.parse(raw);} catch {return send(400,{error:'Invalid JSON.'});}
          if(/^\/api\/social\/(read|create|tail|settle|include|correct|follow)$/.test(url.pathname)) return send(200,await store.socialAction(player,url.pathname.split('/').at(-1),body));
          if(url.pathname==='/api/ballot') return send(200,store.saveBallot(player,mode,body.picks,body.submit===true));
          if(url.pathname==='/api/sit-out') return send(200,store.sitOut(player,mode));
          if(url.pathname==='/api/bet') return send(200,store.saveBet(player,body));
        }
        return send(404,{error:'Unknown API route.'});
      }
      if(req.method!=='GET') return send(405,{error:'Method not allowed.'});
      if(/^\/(data|server|\.local|\.git|docs|design)(\/|$)/.test(url.pathname)) return send(404,{error:'Not found.'});
      const requested = path.resolve(dist,'.'+decodeURIComponent(url.pathname));
      if(!requested.startsWith(dist+path.sep) && requested!==dist) return send(404,{error:'Not found.'});
      const file=fs.existsSync(requested)&&fs.statSync(requested).isFile()?requested:path.join(dist,'index.html');
      if(!fs.existsSync(file)) return send(503,{error:'Run npm run build, or use the development preview on port 5173.'});
      const mime=mimeTypes[path.extname(file).toLowerCase()]||'application/octet-stream';
      res.writeHead(200,{'Content-Type':mime,'Cache-Control':file.endsWith('.html')?'no-cache':'public, max-age=3600'});fs.createReadStream(file).pipe(res);
    } catch(error) {
      if (error instanceof SocialError) return send(error.status, { error: error.message });
      if (error instanceof SubmissionReferenceError) return send(error.status, { error: error.message, code: error.code, submitted: false });
      send(400,{error:error.message});
    }
  });
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const server=createServer();server.listen(8787,'127.0.0.1',()=>console.log('GTL local workspace: http://127.0.0.1:8787 (local owner access only)'));
}
