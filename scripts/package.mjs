import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) { crc ^= b; for (let i=0; i<8; i++) crc = (crc>>>1) ^ ((crc&1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
async function files(dir, prefix = '') {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...await files(join(dir,e.name), `${prefix}${e.name}/`));
    else out.push({ name: `${prefix}${e.name}`, data: await readFile(join(dir,e.name)) });
  }
  return out;
}
const local = [], central = []; let offset = 0;
for (const f of await files('dist')) {
  const name = Buffer.from(f.name), crc = crc32(f.data), h = Buffer.alloc(30), c = Buffer.alloc(46);
  h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20,4); h.writeUInt16LE(0x800,6); h.writeUInt32LE(crc,14);
  h.writeUInt32LE(f.data.length,18); h.writeUInt32LE(f.data.length,22); h.writeUInt16LE(name.length,26);
  c.writeUInt32LE(0x02014b50); c.writeUInt16LE(20,4); c.writeUInt16LE(20,6); c.writeUInt16LE(0x800,8);
  c.writeUInt32LE(crc,16); c.writeUInt32LE(f.data.length,20); c.writeUInt32LE(f.data.length,24); c.writeUInt16LE(name.length,28); c.writeUInt32LE(offset,42);
  local.push(h,name,f.data); central.push(c,name); offset += h.length+name.length+f.data.length;
}
const directory = Buffer.concat(central), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50); end.writeUInt16LE(central.length/2,8); end.writeUInt16LE(central.length/2,10);
end.writeUInt32LE(directory.length,12); end.writeUInt32LE(offset,16);
await mkdir('release', {recursive:true});
const version=JSON.parse(await readFile('dist/manifest.json','utf8')).version;
await writeFile(`release/wohu-talent-${version}.zip`, Buffer.concat([...local,directory,end]));
console.log(`Packaged release/wohu-talent-${version}.zip`);
