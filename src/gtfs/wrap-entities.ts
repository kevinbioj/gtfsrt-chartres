import dayjs from "dayjs";

import type {
	GtfsRtTripUpdate,
	GtfsRtVehiclePosition,
	TripUpdateEntity,
	VehiclePositionEntity,
} from "./@types.js";

export function wrapEntities(
	entities: (TripUpdateEntity | VehiclePositionEntity)[],
) {
	return {
		header: {
			gtfsRealtimeVersion: "2.0",
			incrementality: "FULL_DATASET",
			timestamp: dayjs().unix(),
		},
		entity: entities,
	} as GtfsRtTripUpdate | GtfsRtVehiclePosition;
}
