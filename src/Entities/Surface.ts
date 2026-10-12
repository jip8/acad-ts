import { ModelerGeometry } from './ModelerGeometry.js';
import { DxfFileToken } from '../DxfFileToken.js';
import { DxfSubclassMarker } from '../DxfSubclassMarker.js';
import { ObjectType } from '../Types/ObjectType.js';

export class Surface extends ModelerGeometry {
	override get objectName(): string { return DxfFileToken.entitySurface; }
	override get subclassMarker(): string { return DxfSubclassMarker.surface; }
	override get objectType(): ObjectType { return ObjectType.UNLISTED; }
	uIsolines: number = 0;
	vIsolines: number = 0;
}
