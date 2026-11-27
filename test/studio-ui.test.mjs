import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Script, createContext } from 'node:vm';

function bootStudio(overrides) {
  const page = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const elements = new Map();
  const element = () => ({ value: '', hidden: false, children: [], dataset: {}, style: { setProperty() {} },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    focus() {}, setAttribute() {}, addEventListener() {} });
  const get = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  get('product').value = 'stickers';
  get('screen').value = 'chats';
  const document = { getElementById: get, createElement: element, querySelector: element,
    querySelectorAll: () => [], addEventListener() {} };
  const png = 'data:image/png;base64,sample';
  const tiles = Array.from({length:16}, (_, i) => png + i);

  const imageModule = {
    sampleSheet: () => png,
    cutSheet: async url => { assert.equal(url, png); return tiles; },
    buildStickerZip: async () => new Blob(['fixture']),
    ...overrides,
  };
  const reads = [];
  class FileReader {
    readAsDataURL() { reads.push(this); }
  }
  const ctx = createContext({ document, window: { scrollTo() {} }, structuredClone, URL, setTimeout, imageModule, FileReader });
  for (const { 1: attrs, 2: source } of page.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    const script = attrs.includes('type="module"') ? '(()=>{' + source.replace(/import \{([^}]+)\} from "[^"]+";/, 'const {$1}=imageModule;') + '})();' : source;
    new Script(script).runInContext(ctx);
  }
  return { get, png, tiles, reads };
}

test('Studio initializes and the sample proceeds through 18 slots to the ZIP link', async () => {
  const {get, png, tiles}=bootStudio({
    buildStickerZip: async slots => {
      assert.equal(slots.length,18);
      assert.equal(slots.at(-2).name,'main.png');
      assert.equal(slots.at(-1).name,'tab.png');
      assert.deepEqual(Array.from(slots,slot=>slot.art),expected);
      assert.deepEqual(Array.from(slots,slot=>[slot.width,slot.height]),
        Array.from({length:16},()=>[370,320]).concat([[240,240],[96,74]]));
      return new Blob(['fixture']);
    },
  });
  const expected=tiles.concat([tiles[0],tiles[0]]);
  get('sample').onclick();
  assert.equal(get('source-image').src, png);
  await get('submit').onclick();
  assert.equal(get('tray').children.length, 18);
  assert.equal(get('workspace').hidden, false);
  get('reviewed').checked = true;
  get('reviewed').onchange();
  assert.equal(get('pack').disabled, false);
  await get('pack').onclick();
  const link = get('pack-result').children[0];
  assert.equal(link.download, 'the-beaver-line-stickers.zip');
  URL.revokeObjectURL(link.href);
  for (const [source, target] of [[3,16],[12,17]]) {
    get('tray').children[source].onclick();
    get('swap-slot').value = get('swap-slot').children[target].value;
    get('save-editor').onclick();
    [expected[source], expected[target]] = [expected[target], expected[source]];
  }
  get('reviewed').checked = true;
  get('reviewed').onchange();
  await get('pack').onclick();
  assert.notEqual(get('pack-result').children[0], link);
  assert.equal(get('pack-result').hidden, false);
  assert.equal(get('pack-result').children[0]?.download, 'the-beaver-line-stickers.zip',
    get('pack-message').textContent);
  URL.revokeObjectURL(get('pack-result').children[0].href);
});


const file = {name:'sheet.png',type:'image/png',size:100};
function uploaded(get) { return get('source-upload').onchange({target:{files:[file]}}); }
function finish(reader, data='data:image/png;base64,upload') { reader.result=data;reader.onload(); }

test('a late upload read cannot overwrite a subsequently selected sample',async()=>{
  const {get,png,reads}=bootStudio();
  const pending=uploaded(get);
  get('sample').onclick();
  finish(reads[0]);
  await pending;
  assert.equal(get('source-image').src,png);
  await get('submit').onclick();
  assert.equal(get('tray').children.length,18);
});

test('a cut for the old source cannot open the workspace after replacing it',async()=>{
  let finishCut;
  const {get,tiles,reads}=bootStudio({cutSheet:()=>new Promise(resolve=>{finishCut=resolve;})});
  get('workspace').hidden=true;
  get('sample').onclick();
  const pending=get('submit').onclick();
  const read=uploaded(get);
  finish(reads[0]);
  await read;
  finishCut(tiles);
  await pending;
  assert.equal(get('workspace').hidden,true);
  assert.equal(get('tray').children.length,0);
});
