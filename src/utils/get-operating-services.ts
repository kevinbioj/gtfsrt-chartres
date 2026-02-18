import { Temporal } from "temporal-polyfill";

import type { GtfsResource } from "../gtfs/import-resource.js";

export function getOperatingServices(gtfs: GtfsResource, date: Temporal.PlainDate) {
	return gtfs.services
		.values()
		.filter((service) => {
			if (service.includedDays.some((d) => d.equals(date))) {
				return true;
			}

			if (service.excludedDays.some((d) => d.equals(date))) {
				return false;
			}

			if (
				Temporal.PlainDate.compare(date, service.startDate) < 0 ||
				Temporal.PlainDate.compare(date, service.endDate) > 0
			) {
				return false;
			}

			return service.days[date.dayOfWeek];
		})
		.toArray();
}
