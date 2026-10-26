// Browser pages cannot set the Cookie header, and Inca does not allow this origin.
// node server.mjs  →  http://127.0.0.1:8787
import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFile } from 'node:fs/promises';

const PORT = Number(process.env.PORT) || 8787;
const ORIGIN = 'https://inca.ggwp.red';
const ENVS = new Set(['development', 'gk2', 'preprod', 'production', 'sandbox', 'staging']);
const FILE = new URL('./index.html', import.meta.url);
const MAX_BODY = 20_000_000;

function allowed(reqUrl) {
  const url = new URL(reqUrl, 'http://127.0.0.1');
  const parts = url.pathname.split('/');
  if (parts[1] !== 'v1' || parts[2] !== 'kv' || parts[3] !== 'flight' || !ENVS.has(parts[4])) return false;
  if (url.pathname !== '/v1/kv/flight/' + parts[4] + '/properties/TIX-KRAKEND-GATEWAY/settings/endpoints.json') return false;
  if (url.searchParams.get('dc') !== 'tiket') return false;
  for (const key of url.searchParams.keys()) {
    if (key !== 'dc' && key !== 'cas') return false;
  }
  return true;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

if (process.argv.includes('--check')) {
  const ok = '/v1/kv/flight/staging/properties/TIX-KRAKEND-GATEWAY/settings/endpoints.json?dc=tiket';
  if (!allowed(ok)) throw new Error('allow staging');
  if (!allowed(ok + '&cas=12')) throw new Error('allow cas');
  if (allowed(ok.replace('endpoints.json', 'other.json'))) throw new Error('block file');
  if (allowed(ok.replace('staging', 'nope'))) throw new Error('block env');
  if (allowed(ok.replace('dc=tiket', 'dc=other'))) throw new Error('block dc');
  if (allowed('/v1/kv/flight/staging/../../endpoints.json?dc=tiket')) throw new Error('block traversal');
  console.log('ok');
  process.exit(0);
}

const server = createServer({ maxHeaderSize: 65536 }, async (req, res) => {
  try {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      const html = await readFile(FILE);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(html);
      return;
    }
    if ((req.method !== 'GET' && req.method !== 'PUT') || !allowed(req.url || '/')) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    const env = new URL(req.url, 'http://127.0.0.1').pathname.split('/')[4];
    const body = req.method === 'PUT' ? await readBody(req) : null;
    const headers = {
      accept: 'application/json, text/javascript, */*; q=0.01',
      'x-consul-token': req.headers['x-consul-token'] || '',
      'x-requested-with': 'XMLHttpRequest',
      cookie: req.headers['x-inca-cookie'] || '',
      origin: ORIGIN,
      referer: ORIGIN + '/ui/tiket/kv/flight/' + env + '/properties/TIX-KRAKEND-GATEWAY/settings/',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    };
    if (body) {
      headers['content-type'] = 'application/json; charset=UTF-8';
      headers['content-length'] = Buffer.byteLength(body);
    }
    const upstream = httpsRequest(ORIGIN + req.url, { method: req.method, headers, timeout: 30000 }, (up) => {
      const chunks = [];
      let size = 0;
      up.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY) {
          up.destroy();
          if (!res.headersSent) {
            res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('response too large');
          }
          return;
        }
        chunks.push(chunk);
      });
      up.on('end', () => {
        if (res.headersSent) return;
        if (up.statusCode >= 300 && up.statusCode < 400) {
          res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
          res.end('cookie-expired');
          return;
        }
        res.writeHead(up.statusCode || 502, {
          'content-type': up.headers['content-type'] || 'application/json',
          'cache-control': 'no-store'
        });
        res.end(Buffer.concat(chunks));
      });
    });
    upstream.on('timeout', () => upstream.destroy());
    upstream.on('error', () => {
      if (res.headersSent) return;
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('inca unreachable');
    });
    if (body) upstream.end(body);
    else upstream.end();
  } catch {
    if (res.headersSent) return;
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('bad request');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('http://127.0.0.1:' + PORT);
});
