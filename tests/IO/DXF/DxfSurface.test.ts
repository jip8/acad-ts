import { describe, expect, it } from 'vitest';
import { DxfReader } from '../../../src/IO/DXF/DxfReader.js';
import { Surface } from '../../../src/Entities/Surface.js';
import { ExtrudedSurface } from '../../../src/Entities/ExtrudedSurface.js';
import { LoftedSurface } from '../../../src/Entities/LoftedSurface.js';
import { NurbSurface } from '../../../src/Entities/NurbSurface.js';
import { PlaneSurface } from '../../../src/Entities/PlaneSurface.js';
import { RevolvedSurface } from '../../../src/Entities/RevolvedSurface.js';
import { SweptSurface } from '../../../src/Entities/SweptSurface.js';

describe('DXF surfaces', () => {
	it.each([Surface, ExtrudedSurface, LoftedSurface, NurbSurface, PlaneSurface, RevolvedSurface, SweptSurface])('reads %s with isolines and SAT payload', type => {
		const surface = new type();
		const pairs: (string | number)[] = [
			0, 'SECTION', 2, 'ENTITIES', 0, surface.objectName, 5, 'A1',
			100, 'AcDbEntity', 8, '0', 100, 'AcDbModelerGeometry', 70, 1,
			1, '400 0 1 0', 1, 'body $-1 $1 $-1 $-1 #',
			100, 'AcDbSurface', 71, 6, 72, 7,
		];
		if (surface.subclassMarker !== 'AcDbSurface') pairs.push(100, surface.subclassMarker);
		pairs.push(0, 'ENDSEC', 0, 'EOF');
		const document = new DxfReader(new TextEncoder().encode(pairs.join('\n') + '\n')).read();
		const entity = [...document.entities][0] as Surface;
		expect(entity).toBeInstanceOf(type);
		expect(entity.uIsolines).toBe(6);
		expect(entity.vIsolines).toBe(7);
		expect(entity.getAcisText()).toBe('400 0 1 0\nbody $-1 $1 $-1 $-1 #');
		const definition = entity.getDxfClass();
		expect(definition?.dxfName).toBe(entity.objectName);
		expect(definition?.cppClassName).toBe(entity.subclassMarker);
		expect(definition?.isAnEntity).toBe(true);
	});
});
