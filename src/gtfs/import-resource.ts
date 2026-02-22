import { access, constants } from "node:fs/promises";
import { join } from "node:path";
import { Temporal } from "temporal-polyfill";

import { parseCsv } from "../utils/parse-csv.js";

export async function importResource(directory: string) {
	const services = await importServices(directory);
	const trips = await importTrips(directory, services);
	return { services, trips };
}

export type GtfsResource = Awaited<ReturnType<typeof importResource>>;

// --- importServices

type CalendarRecord = {
	service_id: string;
	monday: "0" | "1";
	tuesday: "0" | "1";
	wednesday: "0" | "1";
	thursday: "0" | "1";
	friday: "0" | "1";
	saturday: "0" | "1";
	sunday: "0" | "1";
	start_date: string;
	end_date: string;
};

type CalendarDatesRecord = {
	service_id: string;
	date: string;
	exception_type: "1" | "2";
};

export type Service = {
	id: string;
	days: [boolean, boolean, boolean, boolean, boolean, boolean, boolean];
	startDate: Temporal.PlainDate;
	endDate: Temporal.PlainDate;
	includedDays: Temporal.PlainDate[];
	excludedDays: Temporal.PlainDate[];
};

async function importServices(directory: string) {
	const services = new Map<string, Service>();

	const calendarPath = join(directory, "calendar.txt");
	const isCalendarReadable = await access(calendarPath, constants.R_OK)
		.then(() => true)
		.catch(() => false);

	if (isCalendarReadable) {
		await parseCsv<CalendarRecord>(calendarPath, (calendarRecord) => {
			services.set(calendarRecord.service_id, {
				id: calendarRecord.service_id,
				days: [
					Boolean(+calendarRecord.monday),
					Boolean(+calendarRecord.tuesday),
					Boolean(+calendarRecord.wednesday),
					Boolean(+calendarRecord.thursday),
					Boolean(+calendarRecord.friday),
					Boolean(+calendarRecord.saturday),
					Boolean(+calendarRecord.sunday),
				],
				startDate: Temporal.PlainDate.from(calendarRecord.start_date),
				endDate: Temporal.PlainDate.from(calendarRecord.end_date),
				excludedDays: [],
				includedDays: [],
			});
		});
	}

	const calendarDatesPath = join(directory, "calendar_dates.txt");
	const isCalendarDatesReadable = await access(calendarDatesPath, constants.R_OK)
		.then(() => true)
		.catch(() => false);

	if (isCalendarDatesReadable) {
		await parseCsv<CalendarDatesRecord>(calendarDatesPath, (calendarDatesRecord) => {
			let service = services.get(calendarDatesRecord.service_id);

			if (service === undefined) {
				service = {
					id: calendarDatesRecord.service_id,
					days: [false, false, false, false, false, false, false],
					startDate: Temporal.PlainDate.from("20000101"),
					endDate: Temporal.PlainDate.from("20991231"),
					excludedDays: [],
					includedDays: [],
				};

				services.set(service.id, service);
			}

			const date = Temporal.PlainDate.from(calendarDatesRecord.date);

			if (calendarDatesRecord.exception_type === "1") {
				service.includedDays.push(date);
			} else {
				service.excludedDays.push(date);
			}
		});
	}

	return services;
}

// --- importTrips

type TripRecord = { trip_id: string; service_id: string; route_id: string; direction_id: "0" | "1" };

type StopTimeRecord = { trip_id: string; stop_sequence: string; stop_id: string };

type StopTime = { sequence: number; stopId: string };

type Trip = { id: string; service: Service; routeId: string; directionId: number; stopTimes: StopTime[] };

async function importTrips(directory: string, services: Map<string, Service>) {
	const trips = new Map<string, Trip>();

	const tripsPath = join(directory, "trips.txt");
	await parseCsv<TripRecord>(tripsPath, (tripRecord) => {
		const service = services.get(tripRecord.service_id);
		if (service === undefined) {
			return;
		}

		trips.set(tripRecord.trip_id, {
			id: tripRecord.trip_id,
			service,
			routeId: tripRecord.route_id,
			directionId: +tripRecord.direction_id,
			stopTimes: [],
		});
	});

	const stopTimesPath = join(directory, "stop_times.txt");
	await parseCsv<StopTimeRecord>(stopTimesPath, (stopTimeRecord) => {
		const trip = trips.get(stopTimeRecord.trip_id);
		if (trip === undefined) {
			return;
		}

		trip.stopTimes.push({
			sequence: +stopTimeRecord.stop_sequence,
			stopId: stopTimeRecord.stop_id,
		});
	});

	trips.forEach((trip) => {
		trip.stopTimes.sort((a, b) => a.sequence - b.sequence);
	});

	return trips;
}
