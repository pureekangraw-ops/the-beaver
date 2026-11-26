import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Script, createContext } from 'node:vm';

test('Studio initializes and the sample proceeds through 18 slots to the ZIP link', async () => {
  const page = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const elements = new Map();
  const element = () => ({ value: '', hidden: false, children: [], dataset: {}, style: { setProperty() {} },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute() {}, addEventListener() {} });
  const get = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  get('product').value = 'stickers';
  get('screen').value = 'chats';
  const document = { getElementById: get, createElement: element, querySelector: element,
    querySelectorAll: () => [], addEventListener() {} };
  const png = 'data:image/png;base64,sample';
  const imageModule = {
    sampleSheet: () => png,
    cutSheet: async url => { assert.equal(url, png); return Array(16).fill(png); },
    buildStickerZip: async slots => {
      assert.equal(slots.length, 18);
      assert.equal(slots.at(-2).name, 'main.png');
      assert.equal(slots.at(-1).name, 'tab.png');
      assert.ok(slots.every(slot => slot.art === png));
      return new Blob(['fixture']);
    },
  };
  const ctx = createContext({ document, window: { scrollTo() {} }, structuredClone, URL, setTimeout, imageModule });
  for (const { 1: attrs, 2: source } of page.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    const script = attrs.includes('type="module"') ? '(()=>{' + source.replace(/import \{([^}]+)\} from "[^"]+";/, 'const {$1}=imageModule;') + '})();' : source;
    new Script(script).runInContext(ctx);
  }
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
});
