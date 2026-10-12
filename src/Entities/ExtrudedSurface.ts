import { Surface } from './Surface.js';
import { DxfFileToken } from '../DxfFileToken.js';
import { DxfSubclassMarker } from '../DxfSubclassMarker.js';

export class ExtrudedSurface extends Surface {
	override get objectName(): string { return DxfFileToken.entityExtrudedSurface; }
	override get subclassMarker(): string { return DxfSubclassMarker.extrudedSurface; }
}
