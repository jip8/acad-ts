import { expect, it } from 'vitest';
import { ACadVersion } from '../../../src/ACadVersion.js';
import { DwgPreview } from '../../../src/DwgPreview.js';
import { DwgPreviewReader } from '../../../src/IO/DWG/DwgStreamReaders/DwgPreviewReader.js';
import { DwgStreamReaderAC18 } from '../../../src/IO/DWG/DwgStreamReaders/DwgStreamReaderAC18.js';
import { DwgSectionDefinition } from '../../../src/IO/DWG/FileHeaders/DwgSectionDefinition.js';

it.each([[], [{ code: 6, data: [9, 8] }], [{ code: 6, data: [9, 8] }, { code: 1, data: [1, 2, 3] }, { code: 2, data: [4] }]].map(entries => ({ entries })))('reads a preview directory without losing its first image: $entries', ({ entries }) => {
	const size = 16 + 5 + entries.length * 9 + entries.reduce((sum, entry) => sum + entry.data.length, 0) + 16;
	const bytes = new Uint8Array(size);
	const view = new DataView(bytes.buffer);
	bytes.set(DwgSectionDefinition.startSentinels.get(DwgSectionDefinition.preview)!);
	view.setUint32(16, size, true);
	bytes[20] = entries.length;
	let offset = 21 + entries.length * 9;
	entries.forEach((entry, i) => {
		bytes[21 + i * 9] = entry.code;
		view.setUint32(22 + i * 9, offset, true);
		view.setUint32(26 + i * 9, entry.data.length, true);
		bytes.set(entry.data, offset);
		offset += entry.data.length;
	});
	bytes.set(DwgSectionDefinition.endSentinels.get(DwgSectionDefinition.preview)!, offset);
	const stream = new DwgStreamReaderAC18(bytes, false);
	const preview = new DwgPreviewReader(ACadVersion.AC1018, stream, 0).read();
	expect(preview.code).toBe(entries.length ? DwgPreview.PreviewType.Png : DwgPreview.PreviewType.Unknown);
	expect(preview.rawImage).toEqual(new Uint8Array(entries[0]?.data ?? []));
	expect(preview.rawHeader).toEqual(new Uint8Array(entries.find(entry => entry.code === 1)?.data ?? []));
	expect(stream.position).toBe(bytes.length);
});
