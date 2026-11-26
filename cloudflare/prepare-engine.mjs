import { execFileSync } from 'node:child_process';
import { mkdirSync,writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const checkout=process.argv[2]??process.env.BEAVER_ENGINE_REPO;
if (!checkout) throw Error('Usage: node cloudflare/prepare-engine.mjs /path/to/private/ygg-beaver');
const revision='4177d8eb4aa4109fecba39ab3a37c81c93412241';
for (const p of ['assets/beaver-core.mjs','cloudflare/worker/processor.mjs','cloudflare/worker/crop-layout-contract.mjs']) {
  const dest=resolve('.worker-engine',p);
  const bytes=execFileSync('git',['-C',checkout,'show',revision+':'+p]);
  mkdirSync(dirname(dest),{recursive:true}); writeFileSync(dest,bytes);
}
