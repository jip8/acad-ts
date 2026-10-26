import { expect, it } from 'vitest';
import { CadDocument } from '../../../src/CadDocument.js';
import { ACadVersion } from '../../../src/ACadVersion.js';
import { Region } from '../../../src/Entities/Region.js';
import { CadFileDataStorage } from '../../../src/DataStorage/CadFileDataStorage.js';
import { DxfAcdsDataSectionWriter } from '../../../src/IO/DXF/DxfStreamWriter/DxfAcdsDataSectionWriter.js';
import { DxfAsciiWriter } from '../../../src/IO/DXF/DxfStreamWriter/DxfAsciiWriter.js';
import { CadObjectHolder } from '../../../src/IO/DXF/CadObjectHolder.js';
import { DxfWriterConfiguration } from '../../../src/IO/DXF/DxfWriterConfiguration.js';
import { DxfAcdsDataSectionReader } from '../../../src/IO/DXF/DxfStreamReader/DxfAcdsDataSectionReader.js';
import { DxfTextReader } from '../../../src/IO/DXF/DxfStreamReader/DxfTextReader.js';
import { DxfDocumentBuilder } from '../../../src/IO/DXF/DxfDocumentBuilder.js';
import { DxfReaderConfiguration } from '../../../src/IO/DXF/DxfReaderConfiguration.js';
import { BlockRecord } from '../../../src/Tables/BlockRecord.js';

it('omits empty geometries and uses the matching modeler schema for block-owned records', () => {
  const document = new CadDocument(ACadVersion.AC1027);
  expect(document.createDataStorage()).toBeNull();
  document.entities.add(new Region());
  expect(document.createDataStorage()).toBeNull();
  const block = new BlockRecord('ACIS block');
  const geometry = new Region();
  geometry.acisData = new Uint8Array([1, 2, 3]);
  block.entities.add(geometry);
  document.blockRecords.add(block);
  const storage = document.createDataStorage()!;
  expect(storage.records).toHaveLength(1);
  expect(storage.records[0].columns.get('AcDbDs::ID')?.handle).toBe(geometry.handle);
  const schema = storage.schemes.find(schema => schema.index === storage.records[0].index)!;
  expect(schema.name).toBe('AcDb3DSolid_ASM_Data');
  expect(schema.properties.map(property => property.name)).toEqual(['AcDbDs::ID', 'ASM_Data']);
});

it('builds and round-trips all ACDS schema properties without confusing types and flags', () => {
  const document = new CadDocument(ACadVersion.AC1027);
  const geometry = new Region();
  geometry.handle = 42;
  geometry.acisData = Uint8Array.from({ length: 300 }, (_, index) => index & 255);
  const storage = new CadFileDataStorage([geometry]);
  const chunks: string[] = [];
  const writer = new DxfAsciiWriter({ write(value: string) { chunks.push(value); } });
  new DxfAcdsDataSectionWriter(storage, writer, document, new CadObjectHolder(), new DxfWriterConfiguration()).write();
  const reader = new DxfTextReader(new TextEncoder().encode(chunks.join('')));
  reader.readNext(); // SECTION
  reader.readNext(); // section name
  const builder = new DxfDocumentBuilder(ACadVersion.AC1027, new CadDocument(), new DxfReaderConfiguration());
  new DxfAcdsDataSectionReader(reader, builder).read();
  expect(builder.dataStorage?.schemes).toEqual(storage.schemes);
  expect(builder.dataStorage?.records).toEqual(storage.records);
  expect(storage.schemes[0].properties.map(property => [property.name, property.type, property.propertyFlags]))
    .toEqual([['AcDbDs::ID', 10, 8], ['Thumbnail_Data', 15, 0], ['AcDbDs::TreatedAsObjectData', 1, 1]]);
});
