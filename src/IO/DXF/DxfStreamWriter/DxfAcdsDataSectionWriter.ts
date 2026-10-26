import { CadFileDataStorage } from '../../../DataStorage/CadFileDataStorage.js';
import { DxfSectionWriterBase } from './DxfSectionWriterBase.js';
import { IDxfStreamWriter } from './IDxfStreamWriter.js';
import { CadDocument } from '../../../CadDocument.js';
import { CadObjectHolder } from '../CadObjectHolder.js';
import { DxfWriterConfiguration } from '../DxfWriterConfiguration.js';
import { DxfFileToken } from '../../../DxfFileToken.js';

/** Serializes schema-backed ACDS data, independently of entity serialization. */
export class DxfAcdsDataSectionWriter extends DxfSectionWriterBase {
  get sectionName(): string { return DxfFileToken.acdsDataSection; }

  constructor(private readonly storage: CadFileDataStorage, writer: IDxfStreamWriter,
    document: CadDocument, holder: CadObjectHolder, configuration: DxfWriterConfiguration) {
    super(writer, document, holder, configuration);
  }

  protected writeSection(): void {
    this._writer.write(70, 2);
    this._writer.write(71, 8);
    for (const schema of this.storage.schemes) {
      this._writer.write(0, DxfFileToken.acdsSchema);
      this._writer.write(90, schema.index);
      this._writer.write(1, schema.name);
      for (const property of schema.properties) {
        this._writer.write(2, property.name);
        this._writer.write(280, property.type);
        this._writer.write(91, property.propertyFlags);
      }
      for (const record of schema.embeddedRecords) {
        this._writer.write(101, DxfFileToken.acdsRecord);
        this._writer.write(95, record.id);
        this._writer.write(90, record.index);
        this._writer.write(2, record.name);
        this._writer.write(91, record.flags);
        this._writer.write(280, record.type);
        this._writer.write(291, record.value291);
      }
    }
  }
}
