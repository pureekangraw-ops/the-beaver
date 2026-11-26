import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { build } from 'esbuild';
const buf = readFileSync('image-bridge.mjs', 'utf8');
const operations = buf.slice(buf.indexOf('  const { decodePng'), buf.indexOf('  let busy = false;'))
  .replace(' = engine ?? await loadPinnedEngine(repo);',' = engine;');
const sources = ['assets/beaver-core.mjs','cloudflare/worker/processor.mjs','cloudflare/worker/crop-layout-contract.mjs'];
const entry = `
import { createRemoteJWKSet, jwtVerify } from 'jose';
${sources.map((p,i)=>"import * as e"+i+" from './.worker-engine/"+p+"';").join('\n')}
const engine={...e0,...e1,...e2};
${operations}
${readFileSync('cloudflare/handler.mjs','utf8').replace('__PAGES__',JSON.stringify({"/":readFileSync('public/index.html','utf8'),"/beaver-image.mjs":readFileSync('public/beaver-image.mjs','utf8')}))}
`;
mkdirSync('.worker-build',{recursive:true});
await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'beaver-worker.mjs',loader:'js'},platform:'browser',target:'es2023',format:'esm',bundle:true,minify:true,outfile:'.worker-build/beaver-worker.mjs'});
