import { Surface } from './Surface.js';
import { DxfFileToken } from '../DxfFileToken.js';
import { DxfSubclassMarker } from '../DxfSubclassMarker.js';

export class PlaneSurface extends Surface {
	override get objectName(): string { return DxfFileToken.entityPlaneSurface; }
	override get subclassMarker(): string { return DxfSubclassMarker.planeSurface; }
}
