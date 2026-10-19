import { describe, it, expect } from 'vitest';
import { CadDocument, ACadVersion, DxfReader, DxfWriter, Color, Line, XYZ,
  LwPolyline, LwPolylineVertex, XY, TextEntity, BlockRecord, Insert, MText,
  Polyline3D, Vertex3D, PolygonMesh, PolygonMeshVertex, PolyfaceMesh, VertexFaceMesh, VertexFaceRecord,
  AppId, ExtendedDataString, ExtendedDataInteger16, DimensionDiameter, Shape,
  AttributeDefinition, AttributeEntity } from '../../../src/index.js';

function fixture(): CadDocument {
  const doc = new CadDocument();
  doc.header.version = ACadVersion.AC1009;
  const line = new Line(new XYZ(1, 2, 3), new XYZ(4, 5, 6));
  line.color = new Color(255, 0, 0);
  doc.entities.add(line);
  const app = new AppId('LEGACY_DATA'); doc.appIds.add(app);
  line.extendedData.addWithRecords(app, [new ExtendedDataString('legacy data'), new ExtendedDataInteger16(42)]);
  const text = new TextEntity();
  text.value = 'R12 text';
  doc.entities.add(text);
  const block = new BlockRecord('LEGACY');
  block.entities.add(new Line(new XYZ(7, 8, 0), new XYZ(9, 10, 0)));
  doc.blockRecords.add(block);
  doc.entities.add(new Insert(block));
  const polyline = new LwPolyline([
    new LwPolylineVertex(new XY(2, 3)), new LwPolylineVertex(new XY(4, 5)),
  ]);
  polyline.elevation = 6;
  polyline.isClosed = true;
  polyline.vertices[0].bulge = 0.5;
  polyline.vertices[0].startWidth = 0.2;
  polyline.vertices[0].endWidth = 0.4;
  doc.entities.add(polyline);
  return doc;
}

function write(doc: CadDocument, binary: boolean): Uint8Array {
  const chunks: Uint8Array[] = [];
  DxfWriter.writeToStream({ write(value: string | Uint8Array) {
    chunks.push(typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value));
  } }, doc, binary);
  return Buffer.concat(chunks);
}

describe('R12 DXF writing', () => {
  it.each([ACadVersion.AC1009, ACadVersion.AC1015])('preserves INSERT attributes and definitions in %s', version => {
    const doc = new CadDocument(); doc.header.version = version;
    const block = new BlockRecord('ATTR_BLOCK');
    const definition = new AttributeDefinition(); definition.tag = 'PART'; definition.prompt = 'Part number'; definition.value = 'default';
    block.entities.add(definition); doc.blockRecords.add(block);
    const insert = new Insert(block);
    insert.attributes[0].value = 'ABC-123';
    doc.entities.add(insert);
    const reader = new DxfReader(write(doc, false)); reader.configuration.failsafe = false;
    const result = reader.read();
    expect([...result.entities]).toHaveLength(1);
    const output = [...result.entities][0] as Insert;
    expect(output.attributes).toHaveLength(1);
    expect(output.attributes[0].tag).toBe('PART');
    expect(output.attributes[0].value).toBe('ABC-123');
    expect(output.attributes[0].owner).toBe(output);
    const outputDefinition = [...output.block!.entities][0] as AttributeDefinition;
    expect(outputDefinition.tag).toBe('PART');
    expect(outputDefinition.prompt).toBe('Part number');
  });

  it('reads dimension subtype flags independently from text-position flags', () => {
    const lines = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES', '0', 'DIMENSION', '5', '10', '8', '0',
      '10', '1', '20', '2', '30', '0', '70', '131', '0', 'ENDSEC', '0', 'EOF'];
    const doc = new DxfReader(new TextEncoder().encode(`${lines.join('\n')}\n`)).read();
    expect([...doc.entities][0]).toBeInstanceOf(DimensionDiameter);
    expect(([...doc.entities][0] as DimensionDiameter).isTextUserDefinedLocation).toBe(true);
  });

  it.each([false, true])('preserves a DXF shape name without its external shape font (binary=%s)', binary => {
    const lines = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES', '0', 'SHAPE', '5', '10', '8', '0',
      '2', 'MY-SHAPE', '10', '1', '20', '2', '30', '0', '40', '1', '0', 'ENDSEC', '0', 'EOF'];
    const doc = new DxfReader(new TextEncoder().encode(`${lines.join('\n')}\n`)).read();
    const result = new DxfReader(write(doc, binary)).read();
    expect(([...result.entities][0] as Shape).shapeName).toBe('MY-SHAPE');
  });

  it.each([false, true])('preserves geometry, blocks, colors and legacy polylines (binary=%s)', binary => {
    const doc = fixture();
    const bytes = write(doc, binary);
    const reader = new DxfReader(bytes);
    reader.configuration.failsafe = false;
    const result = reader.read();
    expect(result.header.version).toBe(ACadVersion.AC1009);
    const entities = [...result.entities];
    expect(entities.map(e => e.objectName)).toEqual(['LINE', 'TEXT', 'INSERT', 'POLYLINE']);
    const line = entities[0] as Line;
    expect(line.startPoint).toEqual(new XYZ(1, 2, 3));
    expect(line.endPoint).toEqual(new XYZ(4, 5, 6));
    expect(line.color.index).toBe(1);
    expect(line.extendedData.getByName('LEGACY_DATA').records.map(r => r.value)).toEqual(['legacy data', 42]);
    expect((entities[1] as TextEntity).value).toBe('R12 text');
    expect((entities[2] as Insert).block?.name).toBe('LEGACY');
    expect([...(entities[2] as Insert).block!.entities]).toHaveLength(1);
    const polyline = entities[3] as import('../../../src/Entities/Polyline2D.js').Polyline2D;
    expect(polyline.elevation).toBe(6);
    expect(polyline.isClosed).toBe(true);
    expect([...polyline.vertices].map(v => (v as import('../../../src/Entities/Vertex2D.js').Vertex2D).bulge)).toEqual([0.5, 0]);
    expect((polyline.vertices[0] as import('../../../src/Entities/Vertex2D.js').Vertex2D).startWidth).toBe(0.2);
    expect([...doc.entities][3]).toBeInstanceOf(LwPolyline);
    if (binary) expect([...bytes.slice(22, 30)]).toEqual([0, 83, 69, 67, 84, 73, 79, 78]);
  });

  it('omits modern sections, records, header variables and group codes', () => {
    const text = new TextDecoder().decode(write(fixture(), false));
    expect(text).not.toMatch(/\n(?:CLASSES|OBJECTS|BLOCK_RECORD|AcDb\w+|\$CELWEIGHT|\$INSUNITS)\n/);
    const lines = text.trimEnd().split(/\r?\n/);
    const codes = lines.filter((_, i) => i % 2 === 0).map(Number);
    for (const code of [100, 102, 105, 330, 340, 370, 420, 440]) expect(codes).not.toContain(code);
  });

  it.each([false, true])('preserves legacy 3D polylines and mesh topology (binary=%s)', binary => {
    const doc = new CadDocument();
    doc.header.version = ACadVersion.AC1009;
    const line = new Polyline3D([new Vertex3D(new XYZ(1, 2, 3)), new Vertex3D(new XYZ(4, 5, 6))]);
    doc.entities.add(line);
    const mesh = new PolygonMesh();
    mesh.mVertexCount = 2; mesh.nVertexCount = 2;
    for (const point of [new XYZ(0, 0, 0), new XYZ(1, 0, 0), new XYZ(0, 1, 0), new XYZ(1, 1, 0)]) {
      const vertex = new PolygonMeshVertex(point); vertex.flags = 64; mesh.vertices.push(vertex);
    }
    doc.entities.add(mesh);
    const polyface = new PolyfaceMesh();
    for (const point of [new XYZ(0, 0, 0), new XYZ(1, 0, 0), new XYZ(0, 1, 0)]) {
      const vertex = new VertexFaceMesh(point); vertex.flags = 192; polyface.vertices.push(vertex);
    }
    const face = new VertexFaceRecord(); face.index1 = 1; face.index2 = 2; face.index3 = -3;
    polyface.faces.push(face);
    doc.entities.add(polyface);
    const reader = new DxfReader(write(doc, binary)); reader.configuration.failsafe = false;
    const entities = [...reader.read().entities];
    expect(entities[0]).toBeInstanceOf(Polyline3D);
    expect((entities[0] as Polyline3D).vertices[1]).toBeInstanceOf(Vertex3D);
    expect(((entities[0] as Polyline3D).vertices[1] as Vertex3D).location).toEqual(new XYZ(4, 5, 6));
    expect(entities[1]).toBeInstanceOf(PolygonMesh);
    expect((entities[1] as PolygonMesh).mVertexCount).toBe(2);
    expect((entities[1] as PolygonMesh).nVertexCount).toBe(2);
    expect((entities[1] as PolygonMesh).vertices).toHaveLength(4);
    expect(entities[2]).toBeInstanceOf(PolyfaceMesh);
    expect((entities[2] as PolyfaceMesh).vertices).toHaveLength(3);
    expect((entities[2] as PolyfaceMesh).faces).toHaveLength(1);
    expect((entities[2] as PolyfaceMesh).faces[0].index3).toBe(-3);
  });

  it('reports entities that cannot be represented in R12', () => {
    const doc = fixture();
    doc.entities.add(new MText());
    const messages: string[] = [];
    const writer = new DxfWriter({ write(_value: string) {} }, doc);
    writer.onNotification = (_sender, args) => messages.push(args.message);
    writer.write();
    expect(messages.some(m => m.includes('MTEXT') && m.includes('R12'))).toBe(true);
  });
});
