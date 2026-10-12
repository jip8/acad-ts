import { ACadVersion } from '../../../ACadVersion.js';
import { CadFileDataStorage } from '../../../DataStorage/CadFileDataStorage.js';
import { DwgDocumentBuilder } from '../DwgDocumentBuilder.js';
import { DwgSectionDefinition } from '../FileHeaders/DwgSectionDefinition.js';
import { DwgSectionIO } from '../DwgSectionIO.js';
import { NotificationType } from '../../NotificationEventHandler.js';
import { IDwgStreamReader } from './IDwgStreamReader.js';

interface FileHeader {
	segmentIndexOffset: number;
	segmentIndexEntryCount: number;
	schemaIndexSegmentIndex: number;
	dataIndexSegmentIndex: number;
}
interface SegmentHeader {
	name: string;
	segmentIndex: number;
	segmentSize: number;
	systemDataAlignmentOffset: number;
	objectDataAlignmentOffset: number;
}
interface SegmentEntry { offset: number; size: number }

export class DwgPrototype1bReader extends DwgSectionIO {
	get sectionName(): string { return DwgSectionDefinition.acDsPrototype; }
	private _fileHeader!: FileHeader;
	private _segments: SegmentEntry[] = [];

	constructor(version: ACadVersion, private readonly _builder: DwgDocumentBuilder, private readonly _reader: IDwgStreamReader) {
		super(version);
	}

	read(): void {
		const storage = new CadFileDataStorage();
		try {
			this._fileHeader = this._readFileHeader();
			this._readFileSegmentIndex();
			this._builder.dataStorage = storage;
		} catch (error) {
			if (!this._builder.configuration.failsafe) throw error;
			this._builder.notify('An error occurred while reading the Prototype1b', NotificationType.Error, error instanceof Error ? error : new Error(String(error)));
		}
	}

	private _requireBytes(count: number): void {
		if (!Number.isSafeInteger(count) || count < 0 || this._reader.position + count > this._reader.stream.length) {
			throw new Error('Invalid Prototype1b data length or offset');
		}
	}
	private _seek(position: number): void {
		if (!Number.isSafeInteger(position) || position < 0 || position > this._reader.stream.length) throw new Error('Invalid Prototype1b offset');
		this._reader.position = position;
	}
	private _uint(): number { this._requireBytes(4); return this._reader.readUInt(); }
	private _ulong(): number {
		const low = this._uint();
		const high = this._uint();
		const value = high * 0x100000000 + low;
		if (!Number.isSafeInteger(value)) throw new Error('Prototype1b value exceeds safe integer range');
		return value;
	}
	private _bytes(count: number): Uint8Array { this._requireBytes(count); return this._reader.readBytes(count); }
	private _readFileHeader(): FileHeader {
		this._requireBytes(56);
		this._bytes(24);
		const segmentIndexOffset = this._uint();
		this._uint();
		const segmentIndexEntryCount = this._uint();
		const schemaIndexSegmentIndex = this._uint();
		const dataIndexSegmentIndex = this._uint();
		this._bytes(12);
		return { segmentIndexOffset, segmentIndexEntryCount, schemaIndexSegmentIndex, dataIndexSegmentIndex };
	}
	private _readSegmentHeader(): SegmentHeader {
		this._bytes(2);
		const name = new TextDecoder('ascii').decode(this._bytes(6));
		const segmentIndex = this._uint();
		this._uint();
		const segmentSize = this._uint();
		this._bytes(12);
		const systemDataAlignmentOffset = this._uint();
		const objectDataAlignmentOffset = this._uint();
		this._bytes(8);
		return { name, segmentIndex, segmentSize, systemDataAlignmentOffset, objectDataAlignmentOffset };
	}
	private _readFileSegmentIndex(): void {
		this._seek(this._fileHeader.segmentIndexOffset);
		this._readSegmentHeader();
		this._requireBytes(this._fileHeader.segmentIndexEntryCount * 12);
		for (let i = 0; i < this._fileHeader.segmentIndexEntryCount; i++) {
			this._segments.push({ offset: this._ulong(), size: this._uint() });
		}
	}
}
