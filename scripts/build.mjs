import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
await Promise.all([
  build({ entryPoints: ['src/background/index.ts'], outfile: 'dist/background.js', bundle: true, format: 'esm', target: 'chrome120', minify: true }),
  build({ entryPoints: ['src/content/index.ts'], outfile: 'dist/content.js', bundle: true, format: 'iife', target: 'chrome120', minify: true }),
  build({ entryPoints: ['src/content/main.ts'], outfile: 'dist/main.js', bundle: true, format: 'iife', target: 'chrome120', minify: true }),
  build({ entryPoints: ['src/content/chat.ts'], outfile: 'dist/chat.js', bundle: true, format: 'iife', target: 'chrome120', minify: true }),
  build({ entryPoints: { popup: 'src/ui/sync-popup.tsx', options: 'src/ui/sync-options.tsx' }, outdir: 'dist', bundle: true, format: 'esm', target: 'chrome120', minify: true, define: { 'process.env.NODE_ENV': '"production"' } }),
]);

// Generate a small code-native geometric icon, keeping the extension self-contained.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) { crc ^= b; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
  const type = Buffer.from(name), size = Buffer.alloc(4), crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([size, type, data, crc]);
}
await mkdir('dist/icons', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const raw = Buffer.alloc((size * 4 + 1) * size), head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0); head.writeUInt32BE(size, 4); head[8] = 8; head[9] = 6;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = x / size, ny = y / size, p = y * (size * 4 + 1) + 1 + x * 4;
    const wave = nx > .19 && nx < .81 && Math.abs(ny - (.37 + .28 * Math.abs(Math.sin((nx - .19) / .62 * Math.PI * 2)))) < .067;
    raw.set(wave ? [227, 255, 237, 255] : [19, 91, 68, 255], p);
  }
  await writeFile(`dist/icons/${size}.png`, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
console.log(`Built ${manifest.name} ${manifest.version} → dist/`);
