import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ACadVersion, CadDocument, DwgWriter, DwgReader, DxfWriter, DxfReader,
  Line, Circle, TextEntity, BlockRecord, Insert, XYZ, LwPolyline, LwPolylineVertex, XY,
  Polyline3D, Vertex3D, PolygonMesh, PolygonMeshVertex, PolyfaceMesh, VertexFaceMesh, VertexFaceRecord,
  AttributeDefinition } from '../dist/index.js';

// Run after npm run build. ODA is an optional, separately installed validator.
const converter = process.argv[2];
if (!converter) {
  console.error('Usage: node tools/check-legacy-formats-oda.mjs <ODAFileConverter executable>');
  process.exit(2);
}
const root = fileURLToPath(new URL('../', import.meta.url));
mkdirSync(path.join(root, 'output'), { recursive: true });
const run = mkdtempSync(path.join(root, 'output', 'legacy-oda-'));
const results = [];

function fixture(version) {
  const doc = new CadDocument();
  doc.header.version = version;
  doc.entities.add(new Line(new XYZ(1, 2, 3), new XYZ(4, 5, 6)));
  const circle = new Circle(); circle.center = new XYZ(7, 8, 0); circle.radius = 3; doc.entities.add(circle);
  const text = new TextEntity(); text.value = 'Legacy sample'; doc.entities.add(text);
  const block = new BlockRecord('LEGACY');
  block.entities.add(new Line(new XYZ(7, 8, 0), new XYZ(9, 10, 0)));
  if (version === ACadVersion.AC1009) {
    const definition = new AttributeDefinition(); definition.tag = 'PART'; definition.prompt = 'Part number'; definition.value = 'default';
    block.entities.add(definition);
  }
  doc.blockRecords.add(block);
  const insert = new Insert(block);
  if (insert.attributes.length) insert.attributes[0].value = 'ABC-123';
  doc.entities.add(insert);
  const polyline = new LwPolyline([new LwPolylineVertex(new XY(2, 3)), new LwPolylineVertex(new XY(4, 5))]);
  polyline.elevation = 6; polyline.isClosed = true; polyline.vertices[0].bulge = 0.5;
  doc.entities.add(polyline);
  if (version === ACadVersion.AC1009) {
    doc.entities.add(new Polyline3D([new Vertex3D(new XYZ(1, 2, 3)), new Vertex3D(new XYZ(4, 5, 6))]));
    const mesh = new PolygonMesh(); mesh.mVertexCount = 2; mesh.nVertexCount = 2;
    for (const point of [new XYZ(0, 0, 0), new XYZ(1, 0, 0), new XYZ(0, 1, 0), new XYZ(1, 1, 0)]) {
      const vertex = new PolygonMeshVertex(point); vertex.flags = 64; mesh.vertices.push(vertex);
    }
    doc.entities.add(mesh);
    const polyface = new PolyfaceMesh();
    for (const point of [new XYZ(0, 0, 0), new XYZ(1, 0, 0), new XYZ(0, 1, 0)]) {
      const vertex = new VertexFaceMesh(point); vertex.flags = 192; polyface.vertices.push(vertex);
    }
    const face = new VertexFaceRecord(); face.index1 = 1; face.index2 = 2; face.index3 = -3;
    polyface.faces.push(face); doc.entities.add(polyface);
  }
  return doc;
}

function verify(doc, meshes) {
  const entities = [...doc.entities];
  assert.equal(entities.length, meshes ? 8 : 5);
  const line = entities.find(e => e instanceof Line);
  assert.deepEqual(line.startPoint, new XYZ(1, 2, 3));
  assert.deepEqual(line.endPoint, new XYZ(4, 5, 6));
  assert.equal(entities.find(e => e instanceof Circle).radius, 3);
  assert.equal(entities.find(e => e instanceof TextEntity).value, 'Legacy sample');
  const insert = entities.find(e => e instanceof Insert);
  assert.equal(insert.block.name, 'LEGACY');
  assert.equal([...insert.block.entities].length, meshes ? 2 : 1);
  if (meshes) {
    assert.equal(insert.attributes.length, 1);
    assert.equal(insert.attributes[0].tag, 'PART');
    assert.equal(insert.attributes[0].value, 'ABC-123');
    const definition = [...insert.block.entities].find(e => e instanceof AttributeDefinition);
    assert.equal(definition.prompt, 'Part number');
  }
  const polyline = entities.find(e => ['POLYLINE', 'LWPOLYLINE'].includes(e.objectName));
  assert.equal(polyline.elevation, 6);
  assert.equal(polyline.isClosed, true);
  assert.equal(polyline.vertices[0].bulge, 0.5);
  if (meshes) {
    const line3d = entities.find(e => e instanceof Polyline3D);
    assert.deepEqual(line3d.vertices[1].location, new XYZ(4, 5, 6));
    const mesh = entities.find(e => e instanceof PolygonMesh);
    assert.equal(mesh.mVertexCount, 2); assert.equal(mesh.nVertexCount, 2); assert.equal(mesh.vertices.length, 4);
    const polyface = entities.find(e => e instanceof PolyfaceMesh);
    assert.equal(polyface.vertices.length, 3); assert.equal(polyface.faces.length, 1);
    assert.equal(polyface.faces[0].index3, -3);
  }
}

for (const kind of ['r12-ascii', 'r12-binary', 'r12-dwg', 'r13-dwg', 'r2007-dwg']) {
  const input = path.join(run, `${kind}-input`), output = path.join(run, `${kind}-output`);
  mkdirSync(input); mkdirSync(output);
  const dwg = kind.endsWith('-dwg');
  const doc = fixture(kind === 'r2007-dwg' ? ACadVersion.AC1021 : kind === 'r13-dwg' ? ACadVersion.AC1012 : ACadVersion.AC1009);
  const meshes = doc.header.version === ACadVersion.AC1009;
  const name = `drawing.${dwg ? 'dwg' : 'dxf'}`;
  try {
    let bytes;
    if (dwg) bytes = DwgWriter.writeToBuffer(doc);
    else {
      const chunks = [];
      DxfWriter.writeToStream({ write: value => chunks.push(Buffer.from(value)) }, doc, kind === 'r12-binary');
      bytes = Buffer.concat(chunks);
    }
    writeFileSync(path.join(input, name), bytes);
    const conversion = spawnSync(converter, [input, output, 'ACAD2018', 'DXF', '0', '1', `*.${dwg ? 'DWG' : 'DXF'}`], {
      encoding: 'utf8', timeout: 60000, windowsHide: true,
    });
    assert.ifError(conversion.error);
    assert.equal(conversion.status, 0, conversion.stderr);
    const files = readdirSync(output);
    const errors = files.filter(f => /\.err$/i.test(f));
    assert.equal(errors.length, 0, errors.map(f => readFileSync(path.join(output, f), 'utf8')).join('\n'));
    const converted = files.find(f => /^drawing\.dxf$/i.test(f));
    assert.ok(converted, 'ODA produced no DXF');
    verify(DxfReader.readFromStream(readFileSync(path.join(output, converted))), meshes);
    // R13 input must also be readable without failsafe recovery.
    if (dwg) {
      const reader = new DwgReader(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      reader.configuration.failsafe = false; verify(reader.read(), meshes);
    }
    results.push({ kind, passed: true });
  } catch (error) { results.push({ kind, passed: false, error: error.message }); }
}

// Exercise the R2007 object stream across page boundaries and its Unicode path.
{
  const kind = 'r2007-multipage-unicode';
  const input = path.join(run, `${kind}-input`), output = path.join(run, `${kind}-output`);
  mkdirSync(input); mkdirSync(output);
  try {
    const doc = new CadDocument(); doc.header.version = ACadVersion.AC1021;
    doc.summaryInfo.title = 'Grüße 日本語';
    const text = new TextEntity(); text.value = 'R2007 日本語 €'; doc.entities.add(text);
    for (let i = 0; i < 2500; i++) doc.entities.add(new Line(new XYZ(i, 2, 3), new XYZ(i + 1, 5, 6)));
    writeFileSync(path.join(input, 'drawing.dwg'), DwgWriter.writeToBuffer(doc));
    const conversion = spawnSync(converter, [input, output, 'ACAD2018', 'DXF', '0', '1', '*.DWG'], {
      encoding: 'utf8', timeout: 60000, windowsHide: true,
    });
    assert.ifError(conversion.error); assert.equal(conversion.status, 0);
    const errors = readdirSync(output).filter(f => /\.err$/i.test(f));
    assert.equal(errors.length, 0, errors.map(f => readFileSync(path.join(output, f), 'utf8')).join('\n'));
    const convertedBytes = readFileSync(path.join(output, 'drawing.dxf'));
    // ODA emits UTF-8 in R2018 DXF even when $DWGCODEPAGE says ANSI_1252.
    // Check its actual text bytes independently of acad-ts's DXF decoder.
    assert.ok(convertedBytes.includes(Buffer.from(text.value, 'utf8')), 'ODA lost Unicode text');
    const converted = DxfReader.readFromStream(convertedBytes);
    const entities = [...converted.entities]; assert.equal(entities.length, 2501);
    const lines = entities.filter(e => e instanceof Line);
    assert.deepEqual(lines[2499].endPoint, new XYZ(2500, 5, 6));
    results.push({ kind, passed: true });
  } catch (error) { results.push({ kind, passed: false, error: error.message }); }
}
writeFileSync(path.join(run, 'results.json'), JSON.stringify(results, null, 2));
console.log(run);
for (const result of results) console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.kind}${result.error ? ': ' + result.error : ''}`);
process.exitCode = results.every(result => result.passed) ? 0 : 1;
