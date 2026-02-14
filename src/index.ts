import { setTimeout as sleep } from "node:timers/promises";
import { serve } from "@hono/node-server";
import dayjs from "dayjs";
import { Hono } from "hono";
import { stream } from "hono/streaming";

import type { TripUpdateEntity, VehiclePositionEntity } from "./gtfs/@types.js";
import { downloadStaticResource } from "./gtfs/download-resource.js";
import { encodePayload } from "./gtfs/encode-payload.js";
import { wrapEntities } from "./gtfs/wrap-entities.js";
import { fetchMonitoredLines } from "./siri/fetch-monitored-lines.js";
import { fetchMonitoredVehicles } from "./siri/fetch-monitored-vehicles.js";
import { extractCoordinates } from "./utils/extract-coordinates.js";
import { parseSiriRef } from "./utils/parse-ref.js";
import { parseTime } from "./utils/parse-time.js";

import {
	gtfsResourceHref,
	siriEndpoint,
	requestorRef,
	siriRatelimit,
	sweepThreshold,
	port,
} from "./config.js";

const tripUpdates = new Map<string, TripUpdateEntity>();
const vehiclePositions = new Map<string, VehiclePositionEntity>();

const server = new Hono();
server.get("/trip-updates", (c) =>
	stream(c, async (stream) => {
		const payload = wrapEntities([...tripUpdates.values()]);
		const serialized = encodePayload(payload);
		await stream.write(serialized);
	}),
);
server.get("/vehicle-positions", (c) =>
	stream(c, async (stream) => {
		const payload = wrapEntities([...vehiclePositions.values()]);
		const serialized = encodePayload(payload);
		await stream.write(serialized);
	}),
);
server.get("/trip-updates.json", (c) =>
	c.json(wrapEntities([...tripUpdates.values()])),
);
server.get("/vehicle-positions.json", (c) =>
	c.json(wrapEntities([...vehiclePositions.values()])),
);

console.log("-- SIRI-VM TO GTFS --");

console.log("Loading GTFS resource into memory.");
let gtfsTrips = await downloadStaticResource(gtfsResourceHref);
let gtfsTime = dayjs();
let relevantLines = gtfsTrips.values().reduce((lines, trip) => {
	lines.add(trip.route);
	return lines;
}, new Set<string>());

console.log("Fetching monitored lines from SIRI service.");
let monitoredLines = (await fetchMonitoredLines(siriEndpoint)).filter((line) =>
	relevantLines.has(parseSiriRef(line)),
);
let monitoredLinesTime = dayjs();

let currentMonitoredLineIdx = 0;
let tryAgain = true;

async function fetchingLoop() {
	while (true) {
		await sleep(siriRatelimit * 1000);

		if (dayjs().diff(gtfsTime, "minutes") > 60) {
			console.log(`Updating GTFS resource in memory.`);
			try {
				gtfsTrips = await downloadStaticResource(gtfsResourceHref);
				gtfsTime = dayjs();
				relevantLines = gtfsTrips.values().reduce((lines, trip) => {
					lines.add(trip.route);
					return lines;
				}, new Set<string>());
			} catch (e: unknown) {
				console.error(`Failed to update GTFS resource, using old one for now:`);
				console.error(e);
			}
		}

		if (dayjs().diff(monitoredLinesTime, "minutes") > 120) {
			console.log(`Updating monitored lines from SIRI service.`);
			try {
				monitoredLines = (await fetchMonitoredLines(siriEndpoint)).filter(
					(line) => relevantLines.has(parseSiriRef(line)),
				);
				monitoredLinesTime = dayjs();
				await sleep(siriRatelimit * 1000);
			} catch (e: unknown) {
				console.error(
					`Failed to update monitored lines from SIRI service, using old one for now:`,
				);
				console.error(e);
			}
		}

		if (currentMonitoredLineIdx > monitoredLines.length - 1)
			currentMonitoredLineIdx = 0;
		const monitoredLine = monitoredLines[currentMonitoredLineIdx];
		console.log(
			`Fetching monitored vehicles for line '${parseSiriRef(monitoredLine)}'.`,
		);
		try {
			await fetchNextLine(monitoredLine);
			currentMonitoredLineIdx += 1;
			tryAgain = true;
		} catch (e: unknown) {
			console.error(
				"Failed to fetch monitored vehicles, please see error below:",
			);
			console.error(e);
			if (tryAgain) {
				console.warn(
					"Will be retrying to fetch monitored vehicles for this line...",
				);
				tryAgain = false;
			} else {
				console.warn("Skipping to the next line in the list.");
				currentMonitoredLineIdx += 1;
			}
		}
	}
}

fetchingLoop();
setTimeout(sweepEntries, 60_000);

// ---

async function fetchNextLine(lineRef: string) {
	if (gtfsTrips === null) return;

	const monitoredVehicles = (
		await fetchMonitoredVehicles(siriEndpoint, requestorRef, lineRef)
	).filter(
		(monitoredVehicle) =>
			// monitoredVehicle.MonitoredVehicleJourney.Monitored &&
			typeof monitoredVehicle.MonitoredVehicleJourney.FramedVehicleJourneyRef
				?.DatedVehicleJourneyRef === "string" &&
			typeof monitoredVehicle.MonitoredVehicleJourney.LineRef === "string" &&
			typeof monitoredVehicle.MonitoredVehicleJourney.DirectionName ===
				"string" &&
			typeof monitoredVehicle.MonitoredVehicleJourney.MonitoredCall !==
				"undefined" &&
			monitoredVehicle.MonitoredVehicleJourney.MonitoredCall.ArrivalStatus !==
				"noReport" &&
			monitoredVehicle.MonitoredVehicleJourney.MonitoredCall.DepartureStatus !==
				"noReport",
	);

	const processedTrips = new Set<string>();

	for (const monitoredVehicle of monitoredVehicles) {
		const vehicleRef = monitoredVehicle.VehicleMonitoringRef;
		const recordedAt = dayjs(monitoredVehicle.RecordedAtTime).unix();

		const monitoredCall =
			monitoredVehicle.MonitoredVehicleJourney.MonitoredCall!;

		const journeyRef = parseSiriRef(
			monitoredVehicle.MonitoredVehicleJourney.FramedVehicleJourneyRef!
				.DatedVehicleJourneyRef!,
		);
		const trip = gtfsTrips.get(journeyRef);
		if (typeof trip === "undefined") {
			console.warn(
				`Failed to guess trip for vehicle '${vehicleRef}', skipping.`,
			);
			continue;
		}

		processedTrips.add(trip.id);
		const monitoredStopTimeIdx = trip.stops.findIndex(
			(s) =>
				s.stop.id === parseSiriRef(monitoredCall.StopPointRef) ||
				s.stop.name === monitoredCall.StopPointName,
		);

		const tripRef = trip.id;
		const expectedTime =
			monitoredCall.DepartureStatus !== "noReport"
				? monitoredCall.ExpectedDepartureTime
				: monitoredCall.ExpectedArrivalTime;
		const atStop =
			monitoredCall.VehicleAtStop || dayjs().isBefore(dayjs(expectedTime));
		const nextStopTimes = trip.stops.slice(
			monitoredStopTimeIdx + (atStop ? 0 : 1),
		);
		const delay =
			monitoredStopTimeIdx === -1
				? 0
				: dayjs(expectedTime).diff(
						parseTime(trip.stops[monitoredStopTimeIdx].time),
						"seconds",
					);

		tripUpdates.set(tripRef, {
			id: `SM:${tripRef}`,
			tripUpdate: {
				stopTimeUpdate: nextStopTimes.map((stopTime) => ({
					arrival: {
						delay,
						time: parseTime(stopTime.time).add(delay, "seconds").unix(),
					},
					departure: {
						delay,
						time: parseTime(stopTime.time).add(delay, "seconds").unix(),
					},
					stopId: stopTime.stop.id,
					stopSequence: stopTime.sequence,
					scheduleRelationship: "SCHEDULED",
				})),
				timestamp: recordedAt,
				trip: {
					routeId: trip.route,
					directionId: trip.direction,
					tripId: trip.id,
					scheduleRelationship: "SCHEDULED",
				},
				vehicle: {
					id: vehicleRef,
					label: monitoredVehicle.MonitoredVehicleJourney.DestinationName,
				},
			},
		});

		vehiclePositions.set(vehicleRef, {
			id: `VM:${vehicleRef}`,
			vehicle: {
				currentStatus:
					typeof atStop === "boolean"
						? atStop
							? "STOPPED_AT"
							: "IN_TRANSIT_TO"
						: undefined,
				currentStopSequence: nextStopTimes?.[0].sequence,
				position: {
					...extractCoordinates(
						monitoredVehicle.MonitoredVehicleJourney.VehicleLocation!
							.Coordinates,
					),
					bearing: monitoredVehicle.MonitoredVehicleJourney.Bearing,
				},
				stopId: nextStopTimes?.[0].stop.id,
				timestamp: recordedAt,
				trip: trip
					? {
							routeId: trip.route,
							directionId: trip.direction,
							tripId: trip.id,
							scheduleRelationship: "SCHEDULED",
						}
					: undefined,
				vehicle: {
					id: vehicleRef,
					label: monitoredVehicle.MonitoredVehicleJourney.DestinationName,
				},
			},
		});
	}
}

function sweepEntries() {
	console.log("Sweeping old entries from trip updates and vehicle positions.");
	[...tripUpdates.values()]
		.filter((tripUpdate) => {
			const lastStop = tripUpdate.tripUpdate.stopTimeUpdate.at(-1);
			if (typeof lastStop === "undefined") {
				return (
					dayjs().diff(dayjs.unix(tripUpdate.tripUpdate.timestamp), "seconds") >
					sweepThreshold
				);
			}
			if (lastStop.arrival.delay > 0) {
				return (
					dayjs().diff(dayjs.unix(lastStop.arrival.time), "seconds") >
					sweepThreshold
				);
			}
			const theoricalTime = dayjs
				.unix(lastStop.arrival.time)
				.subtract(lastStop.arrival.delay, "seconds");
			return dayjs().diff(theoricalTime, "seconds") > sweepThreshold;
		})
		.forEach(
			(tripUpdate) =>
				void tripUpdates.delete(tripUpdate.tripUpdate.trip.tripId),
		);
	[...vehiclePositions.values()]
		.filter((vehiclePosition) => {
			if (vehiclePosition.vehicle.trip) {
				const associatedTrip = tripUpdates.get(
					vehiclePosition.vehicle.trip.tripId,
				);
				if (
					dayjs().isBefore(
						dayjs.unix(
							associatedTrip?.tripUpdate.stopTimeUpdate.at(-1)?.arrival.time ??
								0,
						),
					)
				)
					return false;
			}
			return (
				dayjs().diff(dayjs.unix(vehiclePosition.vehicle.timestamp), "seconds") >
				sweepThreshold
			);
		})
		.forEach(
			(vehiclePosition) =>
				void vehiclePositions.delete(vehiclePosition.vehicle.vehicle.id),
		);
	setTimeout(sweepEntries, 60_000);
}

serve({ fetch: server.fetch, port });
