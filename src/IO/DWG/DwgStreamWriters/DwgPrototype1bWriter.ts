import { ModelerGeometry } from '../../../Entities/ModelerGeometry.js';

/** Byte-oriented AcDs storage (ODA specification, chapter 24). */
class StorageBytes {
	readonly bytes: number[] = [];
	uint16(value: number): void { this.bytes.push(value & 255, (value >>> 8) & 255); }
	uint32(value: number): void {
		for (let i = 0; i < 4; i++) this.bytes.push((value >>> (8 * i)) & 255);
	}
	uint64(value: number): void { this.uint32(value); this.uint32(Math.floor(value / 0x100000000)); }
	append(value: Iterable<number>): void { for (const byte of value) this.bytes.push(byte); }
	text(value: string): void { this.append(new TextEncoder().encode(value)); this.bytes.push(0); }
	align(size: number, fill: number = 0x55): void { while (this.bytes.length % size) this.bytes.push(fill); }
}

/** Stores modeler payloads by entity handle, including the search index ODA needs. */
export class DwgPrototype1bWriter {
	static write(geometry: readonly ModelerGeometry[]): Uint8Array {
		geometry = [...geometry].sort((a, b) => a.handle - b.handle);
		if (geometry.some(entity => entity.binaryData.length > 0x40000)) {
			throw new Error('AcDs modeler payloads larger than 256 KiB require blob-page storage, which is not supported yet.');
		}
		const segments: Uint8Array[] = [];
		const segment = (name: string, body: StorageBytes, systemOffset = 0, objectOffset = 0) => {
			const size = Math.ceil((48 + body.bytes.length) / 64) * 64;
			const header = new StorageBytes();
			header.uint16(0xd5ac);
			header.append(new TextEncoder().encode(name));
			header.uint32(segments.length);
			header.uint32(0);
			header.uint32(size);
			header.uint32(0);
			header.uint32(1); // Storage revision.
			header.uint32(0);
			header.uint32(systemOffset);
			header.uint32(objectOffset);
			header.append(new Uint8Array(8).fill(0x55));
			header.append(body.bytes);
			header.align(64, 0x70);
			segments.push(new Uint8Array(header.bytes));
		};
		const index = new StorageBytes();
		for (let i = 0; i < 6; i++) { index.uint64(0); index.uint32(0); }
		segment('segidx', index); // Filled after all segment sizes are known.

		const schemas = new StorageBytes();
		schemas.uint32(1); schemas.uint32(0);
		schemas.uint32(0); schemas.uint32(2); schemas.uint32(0);
		schemas.uint64(0xaf10c);
		schemas.uint32(0); schemas.uint32(0);
		schemas.align(16);
		const schemaNamesOffset = (48 + schemas.bytes.length) / 16;
		schemas.uint32(1); schemas.text('AcDb3DSolid_ASM_Data');
		segment('schidx', schemas, schemaNamesOffset);

		const schemaData = new StorageBytes();
		schemaData.uint16(0); // No schema attributes.
		schemaData.uint16(2);
		for (const [nameIndex, type] of [[0, 10], [1, 15]]) {
			schemaData.uint32(0); schemaData.uint32(nameIndex); schemaData.uint32(type);
			schemaData.uint16(0);
		}
		schemaData.align(16);
		const propertyNamesOffset = (48 + schemaData.bytes.length) / 16;
		schemaData.uint32(2); schemaData.text('AcDbDs::ID'); schemaData.text('ASM_Data');
		segment('schdat', schemaData, propertyNamesOffset);

		const dataIndex = new StorageBytes();
		dataIndex.uint32(geometry.length); dataIndex.uint32(0);
		for (let i = 0; i < geometry.length; i++) {
			dataIndex.uint32(4); dataIndex.uint32(i * 20); dataIndex.uint32(0);
		}
		segment('datidx', dataIndex);

		const data = new StorageBytes();
		let localOffset = 0;
		for (const entity of geometry) {
			data.uint32(20); data.uint32(1); data.uint64(entity.handle); data.uint32(localOffset);
			localOffset += 4 + entity.binaryData.length;
		}
		data.align(16);
		const objectOffset = (48 + data.bytes.length) / 16;
		for (const entity of geometry) { data.uint32(entity.binaryData.length); data.append(entity.binaryData); }
		segment('_data_', data, 0, objectOffset);

		const search = new StorageBytes();
		search.uint32(1); search.uint32(0); search.uint64(geometry.length);
		for (let i = 0; i < geometry.length; i++) search.uint64(i);
		search.uint32(1); search.uint32(0); search.uint32(geometry.length);
		for (const [i, entity] of geometry.entries()) {
			search.uint64(entity.handle); search.uint64(1); search.uint64(i);
		}
		segment('search', search);

		let size = 128;
		const offsets = segments.map(bytes => { const offset = size; size += bytes.length; return offset; });
		const output = new Uint8Array(size).fill(0x55);
		const view = new DataView(output.buffer);
		const fields = [0x6472616a, 0x10080, 8, 2, 0, 1, offsets[0], 0, segments.length, 1, 3, 5, 0xffffffff, size];
		fields.forEach((value, i) => view.setUint32(i * 4, value, true));
		segments.forEach((bytes, i) => output.set(bytes, offsets[i]));
		offsets.forEach((offset, i) => {
			view.setBigUint64(offsets[0] + 48 + 12 * i, BigInt(offset), true);
			view.setUint32(offsets[0] + 56 + 12 * i, segments[i].length, true);
		});
		return output;
	}
}
