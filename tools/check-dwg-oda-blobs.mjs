import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ACadVersion, CadDocument, CadBody, DwgReader, DwgWriter, Region, Solid3D } from '../dist/index.js';

// Native validation uses real legacy SAT geometry, padded only with whitespace.
// This exercises blob storage without fabricating invalid modeler geometry.
const converter = process.argv[2];
if (!converter) {
  console.error('Usage: node tools/check-dwg-oda-blobs.mjs <ODAFileConverter executable>');
  process.exit(2);
}
const root = fileURLToPath(new URL('../', import.meta.url));
mkdirSync(path.join(root, 'output'), { recursive: true });
const run = mkdtempSync(path.join(root, 'output', 'oda-blobs-'));
const input = path.join(run, 'input'), output = path.join(run, 'dxf');
mkdirSync(input); mkdirSync(output);
const original = readFileSync(path.join(root, 'samples', 'sample_AC1014.dwg'));
const source = new DwgReader(original.buffer.slice(original.byteOffset, original.byteOffset + original.byteLength)).read();
const solidPayload = [...source.entities].find(entity => entity instanceof Solid3D).binaryData;
const regionPayload = [...source.entities].find(entity => entity instanceof Region).binaryData;
const results = [];
for (const version of [ACadVersion.AC1014, ACadVersion.AC1015, ACadVersion.AC1018, ACadVersion.AC1024, ACadVersion.AC1027, ACadVersion.AC1032]) {
  const sizes = version < ACadVersion.AC1027 ? [0] : [0, 0x40000, 0x40001, 0xfffb0, 0xfffb1, 0x1fff60, 0x1fff61];
  for (const size of sizes) {
    const document = new CadDocument();
    document.header.version = version;
    const entities = [new Solid3D(), new Region(), new CadBody()];
    for (const entity of entities) {
      const payload = entity instanceof Region ? regionPayload : solidPayload;
      entity.binaryData = new Uint8Array(size || payload.length).fill(0x20);
      entity.binaryData.set(payload);
      document.entities.add(entity);
    }
    const file = `${ACadVersion[version]}-${size}.dwg`;
    writeFileSync(path.join(input, file), DwgWriter.writeToBuffer(document));
    results.push({ file, payloadSize: size, expected: entities.map(entity => ({ type: entity.objectName, handle: entity.handle.toString(16).toUpperCase() })) });
  }
}
console.log(`Generated blob DWGs: ${run}`);
const conversion = spawnSync(converter, [input, output, 'ACAD2018', 'DXF', '0', '1', '*.DWG'], {
  encoding: 'utf8', timeout: 300000, windowsHide: true,
});
if (conversion.error || conversion.status !== 0) throw conversion.error ?? new Error(`ODA exited ${conversion.status}: ${conversion.stderr}`);
const files = readdirSync(output);
for (const result of results) {
  const stem = result.file.replace(/\.dwg$/i, '').toLowerCase();
  const errors = files.filter(file => file.toLowerCase().startsWith(`${stem}.`) && /\.err$/i.test(file));
  result.errors = errors.map(file => readFileSync(path.join(output, file), 'utf8'));
  const dxf = files.find(file => file.toLowerCase() === `${stem}.dxf`);
  result.actual = [];
  if (dxf) {
    const lines = readFileSync(path.join(output, dxf), 'utf8').split(/\r?\n/);
    let type = '';
    for (let i = 0; i + 1 < lines.length; i += 2) {
      const code = lines[i].trim(), value = lines[i + 1].trim();
      if (code === '0') type = value;
      if (code === '5' && ['3DSOLID', 'REGION', 'BODY'].includes(type)) result.actual.push({ type, handle: value.toUpperCase() });
    }
  }
  result.passed = Boolean(dxf) && errors.length === 0 && result.expected.every(expected => result.actual.some(actual => actual.type === expected.type && actual.handle === expected.handle));
  console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.file}`);
}
writeFileSync(path.join(run, 'results.json'), JSON.stringify(results, null, 2));
process.exitCode = results.every(result => result.passed) ? 0 : 1;
