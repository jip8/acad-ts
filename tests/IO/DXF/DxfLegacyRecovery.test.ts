import { describe, expect, it } from 'vitest';
import { DxfReader } from '../../../src/IO/DXF/DxfReader.js';
import { DimensionLinear } from '../../../src/Entities/DimensionLinear.js';

describe('Legacy DXF recovery', () => {
	it('keeps the first layer definition from orphaned tables and normalizes zero HANDSEED', () => {
		const pairs = [0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$HANDSEED', 5, '0', 0, 'ENDSEC',
			0, 'TABLE', 2, 'LAYER', 70, 2,
			0, 'LAYER', 2, 'Duplicate', 70, 0, 62, 2, 6, 'CONTINUOUS',
			0, 'LAYER', 2, 'Duplicate', 70, 0, 62, 3, 6, 'CONTINUOUS',
			0, 'ENDTAB', 0, 'EOF'];
		const doc = new DxfReader(new TextEncoder().encode(pairs.join('\n') + '\n')).read();
		expect(doc.layers.get('Duplicate').color.index).toBe(2);
		expect(doc.header.handleSeed).toBeGreaterThan(0);
	});

	it('retains pre-R13 linear dimension points and mixed common text', () => {
		const pairs = [0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 0, 'ENDSEC',
			0, 'SECTION', 2, 'ENTITIES', 0, 'DIMENSION', 5, 'A1', 8, '0', 70, 0,
			13, 1, 23, 2, 33, 0, 14, 4, 24, 6, 34, 0, 1, 'Retained label', 50, 0,
			0, 'ENDSEC', 0, 'EOF'];
		const doc = new DxfReader(new TextEncoder().encode(pairs.join('\n') + '\n')).read();
		const dimension = [...doc.entities][0] as DimensionLinear;
		expect(dimension).toBeInstanceOf(DimensionLinear);
		expect(dimension.firstPoint.x).toBe(1);
		expect(dimension.firstPoint.y).toBe(2);
		expect(dimension.secondPoint.x).toBe(4);
		expect(dimension.secondPoint.y).toBe(6);
		expect(dimension.text).toBe('Retained label');
	});
});
