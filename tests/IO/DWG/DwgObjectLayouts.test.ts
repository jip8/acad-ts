import { describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import { ACadVersion } from '../../../src/ACadVersion.js';
import { CadDocument } from '../../../src/CadDocument.js';
import { TableStyle } from '../../../src/Objects/TableStyle.js';
import { DwgReader } from '../../../src/IO/DWG/DwgReader.js';
import { DwgObjectReader } from '../../../src/IO/DWG/DwgStreamReaders/DwgObjectReader.js';
import { DwgObjectWriter } from '../../../src/IO/DWG/DwgStreamWriters/DwgObjectWriter.js';
import { DwgStreamWriterBase } from '../../../src/IO/DWG/DwgStreamWriters/DwgStreamWriterBase.js';
import '../../../src/IO/DWG/DwgStreamWriters/DwgStreamWriterFactory.js';
import { DwgStreamReaderBase } from '../../../src/IO/DWG/DwgStreamReaders/DwgStreamReaderBase.js';
import { IDwgStreamReader } from '../../../src/IO/DWG/DwgStreamReaders/IDwgStreamReader.js';
import { IDwgStreamWriter } from '../../../src/IO/DWG/DwgStreamWriters/IDwgStreamWriter.js';
import { DwgReferenceType } from '../../../src/Types/DwgReferenceType.js';
import { TestVariables } from '../../TestVariables.js';
import { readFileAsArrayBuffer } from '../../testHelpers.js';
import { AppId } from '../../../src/Tables/AppId.js';
import { ExtendedData } from '../../../src/XData/ExtendedData.js';
import { ExtendedDataString } from '../../../src/XData/ExtendedDataString.js';
import { ExtendedDataInteger16 } from '../../../src/XData/ExtendedDataInteger16.js';
import { EvaluationGraph, EvaluationGraphNode } from '../../../src/Objects/Evaluations/EvaluationGraph.js';
import { BlockVisibilityParameter } from '../../../src/Objects/Evaluations/BlockVisibilityParameter.js';
import { RasterImage } from '../../../src/Entities/RasterImage.js';
import { ImageDefinitionReactor } from '../../../src/Objects/ImageDefinitionReactor.js';
import { XY } from '../../../src/Math/XY.js';

// Inspect the payload directly, independently of DwgObjectReader's TABLESTYLE code.
type PayloadWriter = {
  _writer: IDwgStreamWriter;
  _writeTableStyle(style: TableStyle): void;
};

function tablePayload(version: ACadVersion, style: TableStyle) {
  const bytes = new Uint8Array(16384);
  const document = new CadDocument();
  document.header.version = version;
  const objectWriter = new DwgObjectWriter(new Uint8Array(16384), document, 'windows-1252') as unknown as PayloadWriter;
  const writer = DwgStreamWriterBase.getStreamWriter(version, bytes, 'windows-1252');
  objectWriter._writer = writer;
  objectWriter._writeTableStyle(style);
  writer.writeShiftValue();
  return { reader: DwgStreamReaderBase.getStreamHandler(version, bytes), bits: writer.positionInBits };
}

describe('DWG object layouts (issue #11)', () => {
  it('writes owned evaluation expressions and queues their object payloads', () => {
    const document = new CadDocument();
    const bytes = new Uint8Array(1024);
    const writer = DwgStreamWriterBase.getStreamWriter(ACadVersion.AC1032, bytes, 'windows-1252');
    const objectWriter = new DwgObjectWriter(bytes, document, 'windows-1252') as unknown as {
      _writer: IDwgStreamWriter;
      _objects: unknown[];
      _writeEvaluationGraph(graph: EvaluationGraph): void;
    };
    objectWriter._writer = writer;
    const graph = new EvaluationGraph();
    const node = new EvaluationGraphNode();
    const expression = new BlockVisibilityParameter();
    expression.handle = 42;
    node.expression = expression;
    graph.nodes.push(node);
    objectWriter._writeEvaluationGraph(graph);
    writer.writeShiftValue();
    const reader = DwgStreamReaderBase.getStreamHandler(ACadVersion.AC1032, bytes);
    reader.readBitLong(); reader.readBitLong();
    expect(reader.readBitLong()).toBe(1);
    reader.readBitLong(); reader.readBitLong(); reader.readBitLong();
    expect(reader.readByte()).toBe(0x31); // hard owner, one-byte handle
    expect(reader.readByte()).toBe(42);
    expect(objectWriter._objects).toEqual([expression]);
    expect(expression.owner).toBe(graph);
  });

  it('writes the raster image reactor as a hard owner reference', () => {
    const document = new CadDocument();
    const bytes = new Uint8Array(1024);
    const writer = DwgStreamWriterBase.getStreamWriter(ACadVersion.AC1032, bytes, 'windows-1252');
    const objectWriter = new DwgObjectWriter(bytes, document, 'windows-1252') as unknown as {
      _writer: IDwgStreamWriter;
      _writeCadImage(image: RasterImage): void;
    };
    objectWriter._writer = writer;
    const image = new RasterImage();
    image.clipBoundaryVertices = [new XY(0, 0), new XY(1, 1)];
    image.definitionReactor = new ImageDefinitionReactor();
    image.definitionReactor.handle = 42;
    objectWriter._writeCadImage(image);
    writer.writeShiftValue();
    const reader = DwgStreamReaderBase.getStreamHandler(ACadVersion.AC1032, bytes);
    reader.readBitLong();
    for (let i = 0; i < 3; i++) reader.read3BitDouble();
    reader.read2RawDouble(); reader.readBitShort(); reader.readBit();
    reader.readByte(); reader.readByte(); reader.readByte(); reader.readBit();
    expect(reader.readBitShort()).toBe(image.clipType);
    reader.read2RawDouble(); reader.read2RawDouble();
    expect(reader.readByte()).toBe(0x50); // null image definition, hard pointer
    expect(reader.readByte()).toBe(0x31); // hard owner, one-byte reactor handle
    expect(reader.readByte()).toBe(42);
    expect(reader.positionInBits()).toBe(writer.positionInBits);
  });

  for (const version of [ACadVersion.AC1014, ACadVersion.AC1015, ACadVersion.AC1018]) {
    it(`uses an RC string length and big-endian RS codepage in ${ACadVersion[version]} EED`, () => {
      const document = new CadDocument();
      document.header.version = version;
      const bytes = new Uint8Array(1024);
      const writer = DwgStreamWriterBase.getStreamWriter(version, bytes, 'windows-1252');
      const objectWriter = new DwgObjectWriter(bytes, document, 'windows-1252') as unknown as {
        _writer: IDwgStreamWriter;
        _writeExtendedDataEntry(app: AppId, data: ExtendedData): void;
      };
      objectWriter._writer = writer;
      const app = new AppId('Test');
      app.handle = 9;
      objectWriter._writeExtendedDataEntry(app, new ExtendedData([
        new ExtendedDataString('A€B'), new ExtendedDataInteger16(42),
      ]));
      writer.writeShiftValue();
      const reader = DwgStreamReaderBase.getStreamHandler(version, bytes);
      expect(reader.readBitShort()).toBe(10);
      expect(reader.handleReference()).toBe(9);
      // ODA specification chapter 28; the integer follows immediately after the string.
      const expected = [0, 3, 0, 30, 65, 128, 66, 70, 42, 0];
      expect([...reader.readBytes(10)]).toEqual(expected);
      const payloadReader = Object.create(DwgObjectReader.prototype) as {
        _objectReader: IDwgStreamReader;
        r2007Plus: boolean;
        _readExtendedDataRecords(endPos: number): { value: unknown }[];
      };
      payloadReader.r2007Plus = false;
      payloadReader._objectReader = DwgStreamReaderBase.getStreamHandler(version, new Uint8Array(expected));
      expect(payloadReader._readExtendedDataRecords(10).map(record => record.value)).toEqual(['A€B', 42]);
    });
  }

  for (const version of [ACadVersion.AC1018, ACadVersion.AC1021]) {
    it(`writes all row-style fields for ${ACadVersion[version]}`, () => {
      const style = new TableStyle('Rows');
      style.description = 'Description';
      const rows = [style.dataCellStyle, style.titleCellStyle, style.headerCellStyle];
      rows.forEach((row, i) => {
        row.textStyle = { handle: i + 100 } as typeof row.textStyle;
        row.valueDataType = i + 1;
        row.valueUnitType = i + 10;
        row.valueFormatString = `format-${i}`;
      });
      const { reader, bits } = tablePayload(version, style);
      expect(reader.readVariableText()).toBe(style.description);
      expect(reader.readBitShort()).toBe(style.flowDirection);
      expect(reader.readBitShort()).toBe(style.flags);
      expect(reader.readBitDouble()).toBe(style.horizontalCellMargin);
      expect(reader.readBitDouble()).toBe(style.verticalCellMargin);
      expect(reader.readBit()).toBe(style.suppressTitle);
      expect(reader.readBit()).toBe(style.suppressHeaderRow);
      for (const row of rows) {
        expect(reader.readByte()).toBe(0x51); // hard pointer, one-byte handle
        expect(reader.readByte()).toBe(row.textStyle!.handle);
        expect(reader.readBitDouble()).toBe(row.textHeight);
        expect(reader.readBitShort()).toBe(row.cellAlignment);
        reader.readCmColor(); reader.readCmColor(); reader.readBit();
        for (let border = 0; border < 6; border++) {
          reader.readBitShort(); reader.readBit(); reader.readCmColor();
        }
        if (version === ACadVersion.AC1021) {
          expect(reader.readBitLong()).toBe(row.valueDataType);
          expect(reader.readBitLong()).toBe(row.valueUnitType);
          expect(reader.readVariableText()).toBe(row.valueFormatString);
        }
      }
      expect(reader.positionInBits()).toBe(bits);
    });
  }

  it('writes modern table-style ownership, row identifiers, and custom styles', () => {
    const style = new TableStyle('Cells');
    const custom = TableStyle.createDefaultCellStyle('Custom', 101);
    style.cellStyles.push(custom);
    for (const cell of [style.tableCellStyle, style.titleCellStyle, style.headerCellStyle, style.dataCellStyle, custom]) cell.hasData = false;
    const { reader, bits } = tablePayload(ACadVersion.AC1024, style);
    expect(reader.readByte()).toBe(0);
    reader.readVariableText(); reader.readBitLong(); reader.readBitLong();
    expect(reader.handleReferenceWithRefAndType(0)).toEqual({ handle: 0, reference: DwgReferenceType.HardOwnership });
    const readCell = (id: number, name: string) => {
      reader.readBitLong();
      expect(reader.readBitShort()).toBe(0);
      expect(reader.readBitLong()).toBe(id);
      reader.readBitLong();
      expect(reader.readVariableText()).toBe(name);
    };
    readCell(4, 'Table');
    expect(reader.readBitLong()).toBe(4);
    for (const [id, name] of [[1, '_Title'], [2, '_Header'], [3, '_Data'], [101, 'Custom']] as const) {
      expect(reader.readBitLong()).toBe(id);
      readCell(id, name);
    }
    expect(reader.positionInBits()).toBe(bits);
  });

  for (const version of ['AC1024', 'AC1027', 'AC1032']) {
    it(`consumes the complete VisualStyle data in the original ${version} sample`, () => {
      type ReaderInternals = {
        _readVisualStyle(): unknown;
        _objectReader: IDwgStreamReader;
        _textReader: IDwgStreamReader;
      };
      const prototype = DwgObjectReader.prototype as unknown as ReaderInternals;
      const original = prototype._readVisualStyle;
      const positions: { actual: number; expected: number }[] = [];
      const spy = vi.spyOn(prototype, '_readVisualStyle').mockImplementation(function(this: ReaderInternals) {
        const expected = this._textReader.positionInBits();
        const result = original.call(this);
        positions.push({ actual: this._objectReader.positionInBits(), expected });
        return result;
      });
      try {
        new DwgReader(readFileAsArrayBuffer(path.join(TestVariables.samplesFolder, `sample_${version}.dwg`))).read();
        expect(positions.length).toBeGreaterThan(0);
        for (const position of positions) expect(position.actual).toBe(position.expected);
      } finally {
        spy.mockRestore();
      }
    });
  }
});
