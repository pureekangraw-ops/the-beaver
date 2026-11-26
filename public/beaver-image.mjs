function canvas(width, height) {
  const surface = document.createElement('canvas');
  surface.width = width;
  surface.height = height;
  return surface.getContext('2d', { willReadFrequently: true });
}

async function sendImageJob(path, contentType, body) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': contentType }, body });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message ?? 'Beaver รับงานไม่ได้ (' + response.status + ')');
  }
  return response;
}

function pngBlob(surface) {
  return new Promise((resolve, reject) => {
    surface.toBlob(blob => blob ? resolve(blob) : reject(new Error('สร้าง PNG ไม่ได้')), 'image/png');
  });
}

function base64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}

export async function cutSheet(url) {
  const image = new Image();
  image.src = url;
  await image.decode();
  const { naturalWidth: width, naturalHeight: height } = image;
  if (!width || !height || width * height > 8_000_000) throw new Error('ภาพต้องมีขนาดไม่เกิน 8 ล้านพิกเซล');
  const ctx = canvas(width, height);
  ctx.drawImage(image, 0, 0);
  const response = await sendImageJob('/api/images/cut', 'image/png', await pngBlob(ctx.canvas));
  return (await response.json()).map(png => 'data:image/png;base64,' + png);
}

function checkSlot(slot) {
  const role = slot.id === 'main' ? { width: 240, height: 240 } :
    slot.id === 'tab' ? { width: 96, height: 74 } : { maxWidth: 370, maxHeight: 320 };
  const { width, height } = slot;
  const valid = role.width ? width === role.width && height === role.height :
    width >= 2 && height >= 2 && width % 2 === 0 && height % 2 === 0 &&
    width <= role.maxWidth && height <= role.maxHeight;
  if (!valid) throw new Error(slot.name + ' : ขนาดไม่ตรงกับช่องงาน');
}

async function renderSlot(slot) {
  checkSlot(slot);
  const image = new Image();
  image.src = slot.art;
  await image.decode();
  const ctx = canvas(slot.width, slot.height);
  const fit = Math.min(slot.width / image.naturalWidth, slot.height / image.naturalHeight);
  const scale = slot.layout.scale / 100;
  const width = image.naturalWidth * fit;
  const height = image.naturalHeight * fit;
  ctx.translate(slot.width / 2, slot.height / 2);
  ctx.scale(scale, scale);
  ctx.translate(-slot.width / 2, -slot.height / 2);
  ctx.drawImage(image, (slot.width - width) * slot.layout.x / 100, (slot.height - height) * slot.layout.y / 100, width, height);
  ctx.resetTransform();
  const png = await pngBlob(ctx.canvas);
  if (png.size > 1_000_000) throw new Error(slot.name + ' : PNG มีขนาดเกินเกณฑ์');
  return { name: slot.name, png: base64(new Uint8Array(await png.arrayBuffer())) };
}

export async function buildStickerZip(slots) {
  if (slots.length !== 18 || slots.some(slot => !slot.art)) throw new Error('ต้องมีภาพครบ 18 ช่อง');
  const entries = [];
  for (const slot of slots) entries.push(await renderSlot(slot));
  const response = await sendImageJob('/api/images/zip', 'application/json', JSON.stringify(entries));
  return response.blob();
}

export function sampleSheet() {
  const ctx = canvas(800, 800);
  const colors = ['#ba6742','#518362','#336780','#9a5d71'];
  const symbols = ['★','♥','●','◆','▲','☀','✦','✿','♫','◈','♪','☁','☾','☂','✚','✓'];
  symbols.forEach((symbol, index) => {
    const x = index % 4 * 200 + 100;
    const y = Math.floor(index / 4) * 200 + 100;
    ctx.beginPath();
    ctx.fillStyle = colors[index % colors.length];
    ctx.arc(x, y, 64, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '64px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, x, y);
  });
  return ctx.canvas.toDataURL('image/png');
}
