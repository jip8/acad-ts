import { AcdsSchema } from './AcdsSchema.js';
import { AcdsRecord } from './AcdsRecord.js';
import { AcdsSchemaProperty } from './AcdsSchemaProperty.js';
import { AcdsSchemaPropertyFlags } from './AcdsSchemaPropertyFlags.js';
import { ModelerGeometry } from '../Entities/ModelerGeometry.js';

export class CadFileDataStorage {
	static readonly id = 'AcDbDs::ID';
	static readonly asmData = 'ASM_Data';

	records: AcdsRecord[] = [];
	schemes: AcdsSchema[] = [];

	constructor(geometries?: Iterable<ModelerGeometry>) {
		if (!geometries) return;
		this.addSchema('AcDb_Thumbnail_Schema', [
			[CadFileDataStorage.id, 10, 8], ['Thumbnail_Data', 15, 0], ['AcDbDs::TreatedAsObjectData', 1, 1],
		]);
		this.addSchema('AcDbDs::TreatedAsObjectDataSchema', [['AcDbDs::TreatedAsObjectData', 1, 0]]);
		this.addSchema('AcDbDs::LegacySchema', [['AcDbDs::Legacy', 1, 0]]);
		this.addSchema('AcDbDs::IndexedPropertySchema', [['AcDs:Indexable', 1, 0]]);
		this.addSchema('AcDbDs::HandleAttributeSchema', [['AcDbDs::HandleAttribute', 1, 0]]);
		this.addSchema('AcDb3DSolid_ASM_Data', [[CadFileDataStorage.id, 10, 8], [CadFileDataStorage.asmData, 15, 0]]);
	}

	private addSchema(name: string, properties: [string, number, AcdsSchemaPropertyFlags][]): void {
		const schema = new AcdsSchema();
		schema.index = this.schemes.length;
		schema.name = name;
		schema.properties = properties.map(([name, type, propertyFlags]) =>
			Object.assign(new AcdsSchemaProperty(), { name, type, propertyFlags }));
		this.schemes.push(schema);
	}
}
