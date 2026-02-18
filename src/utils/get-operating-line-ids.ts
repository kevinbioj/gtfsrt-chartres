import type { Temporal } from "temporal-polyfill";

import type { GtfsResource } from "../gtfs/import-resource.js";

import { getOperatingServices } from "./get-operating-services.js";

export function getOperatingLineIds(gtfs: GtfsResource, date: Temporal.PlainDate) {
	const operatingServices = getOperatingServices(gtfs, date);
	const operatingLineIds = new Set<string>();

	for (const trip of gtfs.trips.values()) {
		if (operatingServices.every(({ id }) => id !== trip.service.id)) {
			continue;
		}

		operatingLineIds.add(trip.routeId);
	}

	return Array.from(operatingLineIds).toSorted();
}
