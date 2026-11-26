import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createImageBridge } from './image-bridge.mjs';

const engineRepo = process.env.BEAVER_ENGINE_REPO;
if (!engineRepo) throw new Error('Set BEAVER_ENGINE_REPO to the existing Beaver checkout');
const bridge = await createImageBridge(engineRepo);
const pages = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/beaver-image.mjs', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/beaver-image.mjs', import.meta.url))]],
]);
const port = Number(process.env.THE_BEAVER_PORT ?? 4178);
createServer(async (req, res) => {
  const host = req.headers.host;
  if (host !== '127.0.0.1:' + port && host !== 'localhost:' + port) {
    res.writeHead(403).end();
    return;
  }
  if (await bridge(req, res)) return;
  if (req.method !== 'GET') { res.writeHead(405).end(); return; }
  const page = pages.get(req.url);
  if (!page) { res.writeHead(404).end(); return; }
  const [type, content] = page;
  res.writeHead(200, {
    'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  }).end(content);
}).listen(port, '127.0.0.1', () => console.log('The Beaver: http://127.0.0.1:' + port));
