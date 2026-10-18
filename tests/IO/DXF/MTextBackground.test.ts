import { expect, it } from 'vitest';
import { CadDocument } from '../../../src/CadDocument.js';
import { ACadVersion } from '../../../src/ACadVersion.js';
import { Color } from '../../../src/Color.js';
import { MText } from '../../../src/Entities/MText.js';
import { BackgroundFillFlags } from '../../../src/Entities/BackgroundFillFlags.js';
import { DxfWriter } from '../../../src/IO/DXF/DxfWriter.js';
import { DxfReader } from '../../../src/IO/DXF/DxfReader.js';

it('roundtrips MTEXT true-color background, frame, scale and alpha codes', () => {
	const doc = new CadDocument(ACadVersion.AC1032);
	const text = new MText();
	text.value = 'Framed text';
	text.backgroundFillFlags = BackgroundFillFlags.UseBackgroundFillColor | BackgroundFillFlags.TextFrame;
	text.backgroundColor = new Color(17, 83, 149);
	text.backgroundScale = 1.8;
	text.backgroundTransparency = 0x020000B3;
	doc.entities.add(text);
	const chunks: string[] = [];
	new DxfWriter({ write: (value: string) => chunks.push(value), flush() {}, close() {} } as any, doc, false).write();
	const decoded = [...new DxfReader(new TextEncoder().encode(chunks.join(''))).read().entities][0] as MText;
	expect(decoded.backgroundColor).toBeInstanceOf(Color);
	expect(decoded.backgroundColor?.getRgb()).toEqual([17, 83, 149]);
	expect(decoded.backgroundFillFlags).toBe(text.backgroundFillFlags);
	expect(decoded.backgroundScale).toBe(1.8);
	expect(decoded.backgroundTransparency).toBe(0x020000B3);
});
