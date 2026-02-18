import type GtfsRealtime from "gtfs-realtime-bindings";
import { Temporal } from "temporal-polyfill";

import { SWEEP_THRESHOLD } from "../config.js";

let currentInterval: NodeJS.Timeout | undefined;

export function useRealtimeStore() {
	const store = {
		tripUpdates: new Map<string, GtfsRealtime.transit_realtime.ITripUpdate>(),
		vehiclePositions: new Map<string, GtfsRealtime.transit_realtime.IVehiclePosition>(),
	};

	if (currentInterval !== undefined) {
		clearInterval(currentInterval);
	}

	setInterval(() => {
		for (const [id, tripUpdate] of store.tripUpdates) {
			if (
				Temporal.Now.instant()
					// biome-ignore lint/style/noNonNullAssertion: we always set timestamp in store
					.since(Temporal.Instant.fromEpochMilliseconds(+tripUpdate.timestamp! * 1000))
					.total("minutes") >= 10
			) {
				store.tripUpdates.delete(id);
			}
		}

		for (const [id, vehicle] of store.vehiclePositions) {
			if (
				Temporal.Now.instant()
					// biome-ignore lint/style/noNonNullAssertion: we always set timestamp in store
					.since(Temporal.Instant.fromEpochMilliseconds(+vehicle.timestamp! * 1000))
					.total("minutes") >= 10
			) {
				store.vehiclePositions.delete(id);
			}
		}
	}, SWEEP_THRESHOLD);

	return store;
}
