import { expect, it } from 'vitest';
import { ACadVersion } from '../src/ACadVersion.js';
import { CadDocument } from '../src/CadDocument.js';
import { CadOle2FrameTemplate } from '../src/IO/Templates/CadOle2FrameTemplate.js';
import { DwgDocumentBuilder } from '../src/IO/DWG/DwgDocumentBuilder.js';
import { DwgReaderConfiguration } from '../src/IO/DWG/DwgReaderConfiguration.js';
import { Ole2Frame } from '../src/Entities/Ole2Frame.js';
import { DxfWriter } from '../src/IO/DXF/DxfWriter.js';
import { DxfReader } from '../src/IO/DXF/DxfReader.js';

it.each([false, true])('round-trips OLE2 metadata and multi-chunk binary data (binary=%s)', binary => {
	const document = new CadDocument(ACadVersion.AC1032);
	const frame = new Ole2Frame();
	frame.version = 3;
	frame.sourceApplication = 'Embedded document';
	frame.binaryData = new Uint8Array(428);
	new DataView(frame.binaryData.buffer).setInt32(124, 300, true);
	frame.binaryData.fill(42, 128);
	document.entities.add(frame);
	const chunks: Uint8Array[] = [];
	const stream = { write(value: string | Uint8Array) { chunks.push(typeof value === 'string' ? new TextEncoder().encode(value) : value); } };
	DxfWriter.writeToStream(stream, document, binary);
	const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
	let offset = 0;
	for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
	const reread = [...DxfReader.readFromStream(bytes).entities].find(entity => entity instanceof Ole2Frame) as Ole2Frame;
	expect(reread.version).toBe(3);
	expect(reread.sourceApplication).toBe(frame.sourceApplication);
	expect(reread.binaryData).toEqual(frame.binaryData);
	expect(reread.oleData).toEqual(frame.binaryData.slice(128));
});

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
