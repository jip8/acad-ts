import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ACadVersion, DwgReader, DwgReaderConfiguration, DwgWriter, DwgWriterConfiguration } from '../dist/index.js';

// Run after npm run build. Each run uses fresh directories to avoid stale DXFs
// giving false positives. ODA can return success even when a drawing fails.
const converter = process.argv[2];
const matrix = process.argv.includes('--matrix');
if (!converter) {
  console.error('Usage: node tools/check-dwg-oda.mjs <ODAFileConverter executable | --generate-only> [--matrix]');
  process.exit(2);
}
const root = fileURLToPath(new URL('../', import.meta.url));
mkdirSync(path.join(root, 'output'), { recursive: true });
const run = mkdtempSync(path.join(root, 'output', 'oda-check-'));
const originalInput = path.join(run, 'originals');
const rewrittenInput = path.join(run, 'rewritten');
for (const directory of [originalInput, rewrittenInput]) mkdirSync(directory);
const results = [];
// Acceptance alone can hide solids silently dropped by a converter. Compare
// modeler entity handles with the independently converted original drawing.
function modelerHandles(file) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const handles = [];
  let modeler = false;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim(), value = lines[i + 1].trim();
    if (code === '0') modeler = ['3DSOLID', 'REGION', 'BODY'].includes(value);
    if (modeler && code === '5') handles.push(value.toUpperCase());
  }
  return handles.sort();
}
for (const file of readdirSync(path.join(root, 'samples')).filter(name => /^sample_AC\d+\.dwg$/i.test(name))) {
  const source = path.join(root, 'samples', file);
  const bytes = readFileSync(source);
  const sourceVersion = new TextDecoder().decode(bytes.subarray(0, 6));
  const targets = matrix
    ? [...new Set([sourceVersion, 'AC1018', 'AC1024', 'AC1027', 'AC1032'])]
    : [sourceVersion];
  for (const target of targets) {
    const targetVersion = ACadVersion[target];
    if (targetVersion < ACadVersion.AC1014 || targetVersion === ACadVersion.AC1021) continue;
    for (const dynamic of [false, true]) {
      const configuration = new DwgReaderConfiguration();
      configuration.keepUnknownEntities = true;
      configuration.keepUnknownNonGraphicalObjects = true;
      const document = DwgReader.readFromStreamWithConfig(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), configuration, () => {},
      );
      document.header.version = targetVersion;
      const suffix = (target === sourceVersion ? '' : `-${target}`) + (dynamic ? '-dynamic.dwg' : '-default.dwg');
      const outputName = file.replace(/\.dwg$/i, suffix);
      const writerConfiguration = new DwgWriterConfiguration();
      writerConfiguration.writeDynamicBlockData = dynamic;
      try {
        writeFileSync(path.join(rewrittenInput, outputName), DwgWriter.writeToBuffer(document, writerConfiguration, () => {}));
        results.push({ file: outputName, sourceFile: file, kind: 'rewritten' });
      } catch (error) {
        results.push({ file: outputName, sourceFile: file, kind: 'rewritten', writeError: error.message });
      }
    }
  }
  copyFileSync(source, path.join(originalInput, file));
  results.push({ file, kind: 'originals' });
}
console.log(`Generated DWGs: ${run}`);
if (converter === '--generate-only') process.exit(0);

for (const [kind, input] of [['originals', originalInput], ['rewritten', rewrittenInput]]) {
  const output = path.join(run, `${kind}-dxf`);
  mkdirSync(output);
  const conversion = spawnSync(converter, [input, output, 'ACAD2018', 'DXF', '0', '1', '*.DWG'], {
    encoding: 'utf8', timeout: 300000, windowsHide: true,
  });
  if (conversion.error || conversion.status !== 0) {
    console.error(conversion.error?.message ?? conversion.stderr ?? `ODA exited ${conversion.status}`);
    process.exit(1);
  }
  const outputFiles = readdirSync(output);
  for (const result of results.filter(result => result.kind === kind)) {
    const stem = result.file.replace(/\.dwg$/i, '').toLowerCase();
    const errors = outputFiles.filter(file => file.toLowerCase().startsWith(`${stem}.`) && /\.err$/i.test(file));
    result.passed = outputFiles.some(file => file.toLowerCase() === `${stem}.dxf`) && errors.length === 0;
    result.errors = errors.map(file => readFileSync(path.join(output, file), 'utf8'));
    if (result.passed) {
      const dxf = outputFiles.find(file => file.toLowerCase() === `${stem}.dxf`);
      result.modelerHandles = modelerHandles(path.join(output, dxf));
      if (kind === 'rewritten') {
        const baseline = results.find(original => original.kind === 'originals' && original.file === result.sourceFile);
        result.missingModelerHandles = (baseline.modelerHandles ?? []).filter(handle => !result.modelerHandles.includes(handle));
        result.passed = baseline.passed && result.missingModelerHandles.length === 0;
      }
    }
  }
}
writeFileSync(path.join(run, 'results.json'), JSON.stringify(results, null, 2));
for (const result of results) console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.kind}/${result.file}`);
process.exitCode = results.every(result => result.passed) ? 0 : 1;
