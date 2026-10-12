import { Surface } from './Surface.js';
import { DxfFileToken } from '../DxfFileToken.js';
import { DxfSubclassMarker } from '../DxfSubclassMarker.js';

export class SweptSurface extends Surface {
	override get objectName(): string { return DxfFileToken.entitySweptSurface; }
	override get subclassMarker(): string { return DxfSubclassMarker.sweptSurface; }
}
