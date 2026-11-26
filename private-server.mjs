import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const policy = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const pages = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./public/index.html', import.meta.url))]],
  ['/beaver-image.mjs', ['text/javascript; charset=utf-8', readFileSync(new URL('./public/beaver-image.mjs', import.meta.url))]],
]);

function https(value, name, originOnly = false) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      (originOnly && url.pathname !== '/')) throw new Error('Require HTTPS ' + name);
  return originOnly ? url.origin : value;
}
function readConfig(env) {
  const needed = (name) => {
    if (!env[name]?.trim()) throw new Error('Missing ' + name);
    return env[name].trim();
  };
  return {
    web: https(needed('BEAVER_WEB_ORIGIN'), 'web origin', true),
    mcp: https(needed('BEAVER_MCP_ORIGIN'), 'MCP origin', true),
    accessIssuer: https(needed('BEAVER_ACCESS_ISSUER'), 'Access issuer', true),
    accessAudience: needed('BEAVER_ACCESS_AUD'),
    accessEmail: needed('BEAVER_ALLOWED_EMAIL').toLowerCase(),
    mcpAudience: needed('BEAVER_MCP_ACCESS_AUD'),
  };
}

export function createPrivateServer({ config: c, bridge, accessKey }) {
  if (!c.accessIssuer || !c.accessAudience || !c.mcpAudience || !c.accessEmail || c.accessAudience === c.mcpAudience) throw new Error('Require two distinct Access audiences and an approved identity');
  const web = https(c.web, 'web origin', true), mcp = https(c.mcp, 'MCP origin', true);
  if (web === mcp) throw new Error('Use separate HTTPS hostnames for Access and MCP');
  const accessKeys = accessKey ?? createRemoteJWKSet(new URL('/cdn-cgi/access/certs', c.accessIssuer));
  const verify = (token, audience) => jwtVerify(token, accessKeys, {
    algorithms: ['RS256'], issuer: c.accessIssuer, audience, requiredClaims: ['exp', 'email'],
  }).then(r => r.payload);

  const listener = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const end = (status, body = '') => res.writeHead(status).end(body);
    const onMcp = req.headers.host === new URL(mcp).host;
    if (!onMcp && req.headers.host !== new URL(web).host) return end(404);
    if (onMcp && req.url !== '/mcp') return end(404);
    let access;
    try {
      if (typeof req.headers['cf-access-jwt-assertion'] === 'string') {
        access = await verify(req.headers['cf-access-jwt-assertion'], onMcp ? c.mcpAudience : c.accessAudience);
      }
    } catch {}
    if (!access) return end(401);
    if (typeof access.email !== 'string' || access.email.toLowerCase() !== c.accessEmail) return end(403);
    if (onMcp) {
      if (!['GET', 'POST', 'DELETE'].includes(req.method)) return end(405);
      if (req.headers.origin && req.headers.origin !== 'https://chatgpt.com') return end(403);
      // Small JSON-RPC metadata only; image bytes never pass through the connector.
      if (req.method === 'POST' && (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '') ||
          Number(req.headers['content-length']) > 32768)) return end(415);
      let parsedBody;
      if (req.method === 'POST') {
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 32768) return end(413);
          chunks.push(chunk);
        }
        try { parsedBody = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return end(400); }
        if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) return end(400);
      }
      const server = new McpServer({ name: 'the-beaver', version: '0.1.0' });
      server.registerTool('open_sticker_studio', {
        title: 'เปิด The Beaver Sticker Studio',
        description: 'เปิดหน้าร้าน Beaver ส่วนตัวเพื่อส่งภาพกริด 4×4 และรับ ZIP สติกเกอร์ LINE ในเบราว์เซอร์',
        annotations: { readOnlyHint: true, openWorldHint: false },
        _meta: { securitySchemes: [{ type: 'oauth2' }] },
      }, async () => ({
        content: [{ type: 'text', text: 'เปิดหน้าร้าน The Beaver: ' + web + '/' }],
        structuredContent: { studio_url: web + '/' },
      }));
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.once('close', () => { server.close().catch(() => {}); });
      await server.connect(transport);
      return transport.handleRequest(req, res, parsedBody);
    }
    res.setHeader('Content-Security-Policy', policy);
    if (await bridge(req, res)) return;
    const page = pages.get(req.url);
    if (!page) return end(404);
    if (req.method !== 'GET') return end(405);
    res.writeHead(200, { 'Content-Type': page[0] }).end(page[1]);
  };
  return createServer({ requestTimeout: 30_000, headersTimeout: 10_000, maxHeaderSize: 16_384 }, (req, res) => {
    listener(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500).end();
      else res.end();
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = readConfig(process.env);
  const { createImageBridge } = await import('./image-bridge.mjs');
  if (!process.env.BEAVER_ENGINE_REPO) throw new Error('Missing BEAVER_ENGINE_REPO');
  const bridge = await createImageBridge(process.env.BEAVER_ENGINE_REPO, { origin: config.web });
  const port = Number(process.env.PORT ?? 4179);
  createPrivateServer({ config, bridge }).listen(port, process.env.BEAVER_BIND_HOST ?? '127.0.0.1', () => console.log('Private Beaver is listening'));
}
