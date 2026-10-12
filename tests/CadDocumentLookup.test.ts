import { expect, it } from 'vitest';
import { CadDocument } from '../src/CadDocument.js';
import { Line } from '../src/Entities/Line.js';
import { Circle } from '../src/Entities/Circle.js';

it('returns false and null when a handle exists with a different requested type', () => {
	const document = new CadDocument();
	const line = new Line();
	document.entities.add(line);
	expect(document.tryGetCadObject(line.handle, Line)).toEqual({ found: true, cadObject: line });
	expect(document.tryGetCadObject(line.handle, Circle)).toEqual({ found: false, cadObject: null });
	expect(document.tryGetCadObject(0, Line)).toEqual({ found: false, cadObject: null });
});
