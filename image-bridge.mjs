import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const sourceRevision = '4177d8eb4aa4109fecba39ab3a37c81c93412241';
const paths = ['assets/beaver-core.mjs', 'cloudflare/worker/processor.mjs', 'cloudflare/worker/crop-layout-contract.mjs'];
const MiB = 1024 * 1024;

async function loadPinnedEngine(repo) {
  const directory = await mkdtemp(join(tmpdir(), 'the-beaver-engine-'));
  const engine = {};
  try {
    for (const path of paths) {
      const target = join(directory, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, execFileSync('git', ['-C', repo, 'show', sourceRevision + ':' + path]));
    }
    for (const path of paths) Object.assign(engine, await import(pathToFileURL(join(directory, path))));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  return engine;
}

export async function createImageBridge(repo, { engine, origin } = {}) {
  const { decodePng, encodePng, renderSlotLayout, makeStoredZip, PRESETS } = engine ?? await loadPinnedEngine(repo);
  const preset = PRESETS['line-static-sticker-v1'];
  async function cut(bytes) {
    const image = await decodePng(bytes, { maxPixels: 8_000_000 });
    if (image.width < 4 || image.height < 4) throw new Error('ภาพเล็กเกินไปสำหรับกริด 4 × 4');
    const pngs = [];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const x = Math.floor(col * image.width / 4);
        const y = Math.floor(row * image.height / 4);
        const width = Math.floor((col + 1) * image.width / 4) - x;
        const height = Math.floor((row + 1) * image.height / 4) - y;
        const rgba = new Uint8Array(width * height * 4);
        for (let line = 0; line < height; line++) {
          const offset = ((y + line) * image.width + x) * 4;
          rgba.set(image.rgba.subarray(offset, offset + width * 4), line * width * 4);
        }
        const output = renderSlotLayout({ width, height, rgba }, { target: { width, height } });
        pngs.push(Buffer.from(await encodePng(output)).toString('base64'));
      }
    }
    return pngs;
  }

  async function pack(entries) {
    const expected = [...Array.from({ length: 16 }, (_, i) => String(i + 1).padStart(2, '0') + '.png'), 'main.png', 'tab.png'];
    if (!Array.isArray(entries) || entries.length !== expected.length) throw new Error('ต้องมีภาพครบ 18 ช่อง');
    const files = [];
    for (const [i, entry] of entries.entries()) {
      if (entry?.name !== expected[i] || typeof entry.png !== 'string' ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(entry.png)) throw new Error('รายการไฟล์ PNG ไม่ตรงกับถาด');
      const data = Buffer.from(entry.png, 'base64');
      if (!data.length || data.length > preset.maxBytes) throw new Error(entry.name + ' : PNG มีขนาดเกินเกณฑ์');
      const { width, height } = await decodePng(data, { maxPixels: 370 * 320 });
      const valid = i < 16
        ? width <= 370 && height <= 320 && width % 2 === 0 && height % 2 === 0
        : i === 16 ? width === 240 && height === 240 : width === 96 && height === 74;
      if (!valid) throw new Error(entry.name + ' : ขนาดไม่ตรงกับช่องงาน');
      files.push({ name: entry.name, data });
    }
    return Buffer.from(await makeStoredZip(files).arrayBuffer());
  }

  let busy = false;
  return async (req, res) => {
    const isCut = req.url === '/api/images/cut';
    if (!isCut && req.url !== '/api/images/zip') return false;
    if (req.method !== 'POST') { res.writeHead(405).end(); return true; }
    const expectedType = isCut ? 'image/png' : 'application/json';
    if (req.headers['content-type'] !== expectedType) { res.writeHead(415).end(); return true; }
    if (origin ? req.headers.origin !== origin :
        req.headers.origin && req.headers.origin !== 'http://' + req.headers.host) {
      res.writeHead(403).end();
      return true;
    }
    const limit = (isCut ? 10 : 25) * MiB;
    if (busy) { res.writeHead(429).end(); return true; }
    if (Number(req.headers['content-length']) > limit) { res.writeHead(413).end(); return true; }
    busy = true;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > limit) { res.writeHead(413).end(); return true; }
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      const result = isCut ? JSON.stringify(await cut(bytes)) : await pack(JSON.parse(bytes.toString('utf8')));
      res.writeHead(200, { 'Content-Type': isCut ? 'application/json' : 'application/zip', 'Cache-Control': 'no-store' }).end(result);
    } catch (error) {
      if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ message: error.message }));
    } finally {
      busy = false;
    }
    return true;
  };
}
