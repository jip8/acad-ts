import { Surface } from './Surface.js';
import { DxfFileToken } from '../DxfFileToken.js';
import { DxfSubclassMarker } from '../DxfSubclassMarker.js';

export class LoftedSurface extends Surface {
	override get objectName(): string { return DxfFileToken.entityLoftedSurface; }
	override get subclassMarker(): string { return DxfSubclassMarker.loftedSurface; }
}
