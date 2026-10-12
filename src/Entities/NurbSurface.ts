import { Surface } from './Surface.js';
import { DxfFileToken } from '../DxfFileToken.js';
import { DxfSubclassMarker } from '../DxfSubclassMarker.js';

export class NurbSurface extends Surface {
	override get objectName(): string { return DxfFileToken.entityNurbSurface; }
	override get subclassMarker(): string { return DxfSubclassMarker.nurbSurface; }
}
