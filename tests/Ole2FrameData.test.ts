import { expect, it } from 'vitest';
import { ACadVersion } from '../src/ACadVersion.js';
import { CadDocument } from '../src/CadDocument.js';
import { CadOle2FrameTemplate } from '../src/IO/Templates/CadOle2FrameTemplate.js';
import { DwgDocumentBuilder } from '../src/IO/DWG/DwgDocumentBuilder.js';
import { DwgReaderConfiguration } from '../src/IO/DWG/DwgReaderConfiguration.js';
import { Ole2Frame } from '../src/Entities/Ole2Frame.js';

it.each([0, 1, 97, 98, 127, 132])('retains OLE2 raw data safely and extracts an embedded payload at length %i', length => {
	const data = new Uint8Array(length);
	if (length >= 128) {
		const view = new DataView(data.buffer);
		view.setFloat64(2, 10, true);
		view.setFloat64(50, 20, true);
		view.setInt32(124, 4, true);
		data.set([9, 8, 7, 6], 128);
	}
	const frame = new Ole2Frame();
	frame.binaryData = data;
	const builder = new DwgDocumentBuilder(ACadVersion.AC1032, new CadDocument(), new DwgReaderConfiguration());
	expect(() => new CadOle2FrameTemplate(frame).build(builder)).not.toThrow();
	expect(frame.binaryData).toEqual(data);
	expect(frame.oleData).toEqual(new Uint8Array(length >= 128 ? [9, 8, 7, 6] : []));
	if (length >= 128) {
		expect(frame.upperLeftCorner.x).toBe(10);
		expect(frame.lowerRightCorner.x).toBe(20);
	}
});
