const pages = __PAGES__;
const CSP = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const policy = { 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':CSP };
const response = (status, body = null, type = 'text/plain; charset=utf-8') => new Response(body,{status,headers:{...policy,'Content-Type':type}});
const MiB = 1024 * 1024;
const keyCache = new Map();
export function createHandler(testKey) {
  return async (req, env) => {
    const url = new URL(req.url);
    if (!env.BEAVER_WEB_ORIGIN || url.origin !== env.BEAVER_WEB_ORIGIN) return response(404);
    const token=req.headers.get('cf-access-jwt-assertion');
    if (!token || !env.BEAVER_ACCESS_ISSUER || !env.BEAVER_ACCESS_AUD || !env.BEAVER_ALLOWED_EMAIL) return response(401);
    let claim;
    try {
      const issuer=env.BEAVER_ACCESS_ISSUER;
      if (!keyCache.has(issuer) && !testKey) keyCache.set(issuer,createRemoteJWKSet(new URL('/cdn-cgi/access/certs',issuer)));
      claim=(await jwtVerify(token,testKey??keyCache.get(issuer),{issuer,audience:env.BEAVER_ACCESS_AUD,algorithms:['RS256'],requiredClaims:['email','exp']})).payload;
    } catch { return response(401); }
    if (typeof claim.email !== 'string'||claim.email.toLowerCase()!==env.BEAVER_ALLOWED_EMAIL.toLowerCase()) return response(403);
    if (Object.hasOwn(pages,url.pathname)) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return response(405);
      return response(200,req.method==='HEAD'?null:pages[url.pathname],url.pathname==='/'?'text/html; charset=utf-8':'text/javascript; charset=utf-8');
    }
    const isCut=url.pathname==='/api/images/cut';
    if (!isCut && url.pathname !== '/api/images/zip') return response(404);
    if (req.method!=='POST') return response(405);
    if (req.headers.get('origin') !== url.origin) return response(403);
    if (req.headers.get('content-type') !== (isCut ? 'image/png':'application/json')) return response(415);
    const limit=(isCut?10:25)*MiB;
    if (!req.body || Number(req.headers.get('content-length'))>limit) return response(413);
    const reader=req.body.getReader(); let size=0; const parts=[];
    try {
      while (true) {
        const {value,done}=await reader.read(); if (done) break;
        size+=value.byteLength;
        if (size>limit) { await reader.cancel(); return response(413); }
        parts.push(value);
      }
      const bytes=Buffer.concat(parts,size);
      return isCut ? response(200,JSON.stringify(await cut(bytes)),'application/json') :
        response(200,await pack(JSON.parse(bytes.toString('utf8'))),'application/zip');
    } catch {
      return response(400,JSON.stringify({message:'Beaver อ่านภาพไม่สำเร็จ ตรวจ PNG และขนาดของทั้ง 18 ช่อง'}),'application/json');
    } finally { reader.releaseLock(); }
  };
}
export default {fetch:createHandler()};
