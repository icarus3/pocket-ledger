import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('dist');
const types = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.wasm':'application/wasm','.bcmap':'application/octet-stream'};
http.createServer((req,res) => {
  const requested = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.resolve(root, '.' + (requested === '/' ? '/index.html' : requested));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err,data) => { res.writeHead(err ? 404 : 200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'}); res.end(err ? 'Not found' : data); });
}).listen(4173, '127.0.0.1', () => console.log('Pocket Ledger: http://localhost:4173 | Preview: http://localhost:4173/?demo=1'));
