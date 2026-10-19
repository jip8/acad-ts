import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CadDocument, ACadVersion, DwgReader, DwgWriter, Line, XYZ, Circle, TextEntity } from '../../../src/index.js';
import { ViewportEntityHeader } from '../../../src/Tables/ViewportEntityHeader.js';
import { CRC8StreamHandler } from '../../../src/IO/DWG/CRC8StreamHandler.js';

describe('R13 DWG', () => {
  it('reads an independently encoded R13 fixture in strict mode', () => {
    const bytes = readFileSync(new URL('../../../samples/legacy/r13-native.dwg', import.meta.url));
    const reader = new DwgReader(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    reader.configuration.failsafe = false;
    const doc = reader.read();
    expect(doc.header.version).toBe(ACadVersion.AC1012);
    const entities = [...doc.entities];
    expect(entities.map(e => e.constructor.name)).toEqual(['Line', 'Circle', 'TextEntity']);
    expect((entities[0] as Line).startPoint).toEqual(new XYZ(1, 2, 3));
    expect((entities[1] as Circle).radius).toBe(3);
    expect((entities[2] as TextEntity).value).toBe('R13 sample');
  });

  it('writes the five-record R13 container with the specified header CRC', () => {
    const doc = new CadDocument();
    doc.header.version = ACadVersion.AC1012;
    doc.entities.add(new Line(new XYZ(1, 2, 3), new XYZ(4, 5, 6)));
    const bytes = DwgWriter.writeToBuffer(doc);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(new TextDecoder().decode(bytes.slice(0, 6))).toBe('AC1012');
    expect(view.getUint32(0x15, true)).toBe(5);
    expect(view.getUint16(0x46, true)).toBe(CRC8StreamHandler.getCRCValue(0, bytes, 0, 0x46) ^ 0x3CC4);
    const reader = new DwgReader(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    reader.configuration.failsafe = false;
    expect(([...reader.read().entities][0] as Line).endPoint).toEqual(new XYZ(4, 5, 6));
  });

  it('accepts unnamed legacy viewport headers', () => {
    const header = new ViewportEntityHeader();
    header.name = '';
    expect(header.name).toBe('');
  });
});
