import { describe, expect, it } from 'vitest';
import { ACadVersion } from '../../../src/ACadVersion.js';
import { CadDocument } from '../../../src/CadDocument.js';
import { DwgDocumentBuilder } from '../../../src/IO/DWG/DwgDocumentBuilder.js';
import { DwgReaderConfiguration } from '../../../src/IO/DWG/DwgReaderConfiguration.js';
import { DwgStreamReaderAC24 } from '../../../src/IO/DWG/DwgStreamReaders/DwgStreamReaderAC24.js';
import { DwgPrototype1bReader } from '../../../src/IO/DWG/DwgStreamReaders/DwgPrototype1bReader.js';
import { CadFileDataStorage } from '../../../src/DataStorage/CadFileDataStorage.js';

function fixture(blob: boolean): Uint8Array {
	const bytes = new Uint8Array(2048);
	const view = new DataView(bytes.buffer);
	const uint = (offset: number, value: number) => view.setUint32(offset, value, true);
	const short = (offset: number, value: number) => view.setUint16(offset, value, true);
	const text = (offset: number, value: string) => bytes.set(new TextEncoder().encode(value), offset);
	const segment = (offset: number, name: string, index: number, system = 0, object = 0) => {
		short(offset, 0xd5ac);
		text(offset + 2, name);
		uint(offset + 8, index);
		uint(offset + 16, 256);
		uint(offset + 32, system);
		uint(offset + 36, object);
	};
	uint(24, 64);
	uint(32, 7);
	uint(36, 1);
	uint(40, 3);
	segment(64, 'segidx', 0);
	[64, 256, 512, 768, 1024, 1280, 1536].forEach((offset, index) => {
		uint(112 + index * 12, offset);
		uint(120 + index * 12, 256);
	});
	segment(256, 'schidx', 1, 8);
	uint(304, 1);
	uint(312, 0);
	uint(316, 2);
	uint(320, 48);
	uint(384, 1);
	text(388, 'AcDb3DSolid_ASM_Data\0');
	segment(512, 'schdat', 2);
	short(560, 0);
	short(562, 2);
	uint(564, 0);
	uint(568, 0);
	uint(572, 10);
	short(576, 0);
	uint(578, 0);
	uint(582, 1);
	uint(586, 15);
	short(590, 0);
	uint(592, 2);
	text(596, 'AcDbDs::ID\0ASM_Data\0');
	segment(768, 'datidx', 3);
	uint(816, 1);
	uint(824, 4);
	uint(828, 0);
	uint(832, 0);
	segment(1024, 'datseg', 4, 0, 5);
	uint(1072, 20);
	uint(1080, 0x123);
	uint(1088, 0);
	const payload = new Uint8Array([1, 2, 3, 4, 5]);
	if (!blob) {
		uint(1104, payload.length);
		bytes.set(payload, 1108);
	} else {
		uint(1104, 0xbb106bb1);
		uint(1108, payload.length);
		uint(1116, 2);
		uint(1140, 5);
		uint(1144, 3);
		uint(1148, 6);
		uint(1152, 2);
		for (const [offset, index, start, size] of [[1280, 5, 0, 3], [1536, 6, 3, 2]]) {
			segment(offset, 'blob01', index);
			uint(offset + 48, payload.length);
			uint(offset + 56, start);
			uint(offset + 64, index - 5);
			uint(offset + 68, 2);
			uint(offset + 72, size);
			bytes.set(payload.slice(start, start + size), offset + 80);
		}
	}
	return bytes;
}

describe('DwgPrototype1bReader', () => {
	it.each([false, true])('decodes schema-backed ACIS data (blob=%s)', blob => {
		const builder = new DwgDocumentBuilder(ACadVersion.AC1027, new CadDocument(), new DwgReaderConfiguration());
		builder.configuration.failsafe = false;
		const stream = new DwgStreamReaderAC24(fixture(blob), false);
		new DwgPrototype1bReader(ACadVersion.AC1027, builder, stream).read();
		expect(builder.dataStorage?.schemes[0].name).toBe('AcDb3DSolid_ASM_Data');
		const record = builder.dataStorage?.records[0];
		expect(record?.columns.get(CadFileDataStorage.id)?.handle).toBe(0x123);
		expect(record?.columns.get(CadFileDataStorage.asmData)?.data).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
	});

	it('reports truncated storage in failsafe mode', () => {
		const builder = new DwgDocumentBuilder(ACadVersion.AC1027, new CadDocument(), new DwgReaderConfiguration());
		const messages: string[] = [];
		builder.onNotification = (_sender, event) => messages.push(event.message);
		const stream = new DwgStreamReaderAC24(new Uint8Array(4), false);
		new DwgPrototype1bReader(ACadVersion.AC1027, builder, stream).read();
		expect(builder.dataStorage).toBeNull();
		expect(messages).toHaveLength(1);
	});
});
