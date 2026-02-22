import { setTimeout } from "node:timers/promises";
import { serve } from "@hono/node-server";
import GtfsRealtime from "gtfs-realtime-bindings";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { Temporal } from "temporal-polyfill";

import { GTFS_RESOURCE_URL, PORT, REQUESTOR_REF, SIRI_ENDPOINT, SIRI_RATELIMIT } from "./config.js";
import { useGtfsResource } from "./gtfs/load-resource.js";
import { createFeed } from "./gtfs-rt/create-feed.js";
import { useRealtimeStore } from "./gtfs-rt/use-realtime-store.js";
import { fetchMonitoredVehicles } from "./siri/fetch-monitored-vehicles.js";
import { extractCoordinates } from "./utils/extract-coordinates.js";
import { extractSiriRef } from "./utils/extract-siri-ref.js";

console.log(` ,----.,--------.,------.,---.        ,------.,--------.  ,-----.,--.                      ,--.                        
'  .-./'--.  .--'|  .---'   .-',-----.|  .--. '--.  .--' '  .--./|  ,---.  ,--,--.,--.--.,-'  '-.,--.--. ,---.  ,---.  
|  | .---.|  |   |  \`--,\`.  \`-.'-----'|  '--'.'  |  |    |  |    |  .-.  |' ,-.  ||  .--''-.  .-'|  .--'| .-. :(  .-'  
'  '--'  ||  |   |  |\`  .-'    |      |  |\\  \\   |  |    '  '--'\\|  | |  |\\ '-'  ||  |     |  |  |  |   \\   --..-'  \`) 
 \`------' \`--'   \`--'   \`-----'       \`--' '--'  \`--'     \`-----'\`--' \`--' \`--\`--'\`--'     \`--'  \`--'    \`----'\`----'`);

const gtfsResource = await useGtfsResource(GTFS_RESOURCE_URL);

const store = useRealtimeStore();

const hono = new Hono();
hono.get("/", async (c) => {
	const feed = createFeed(store.tripUpdates, store.vehiclePositions);
	if (c.req.query("format") === "json") return c.json(feed);

	return stream(c, async (stream) => {
		const encoded = GtfsRealtime.transit_realtime.FeedMessage.encode(feed).finish();
		await stream.write(encoded);
	});
});

serve({ fetch: hono.fetch, port: PORT }, (info) => `|> Listening on ${info.address}:${info.port}`);

let idx = 0;
while (true) {
	const startedAt = Date.now();

	const currentLineId = gtfsResource.operatingLineIds[idx % gtfsResource.operatingLineIds.length];
	console.log(`|> Fetching vehicles for line '${currentLineId}'.`);

	const vehicles = await fetchMonitoredVehicles(SIRI_ENDPOINT, REQUESTOR_REF, `FILIBUS:Line::${currentLineId}:LOC`);

	for (const vehicle of vehicles) {
		if (
			vehicle.MonitoredVehicleJourney.FramedVehicleJourneyRef?.DatedVehicleJourneyRef === undefined ||
			vehicle.MonitoredVehicleJourney.VehicleLocation === undefined ||
			vehicle.MonitoredVehicleJourney.MonitoredCall === undefined
		) {
			continue;
		}

		const vehicleRef = vehicle.VehicleMonitoringRef;
		const [, , , journeyRef] = extractSiriRef(
			vehicle.MonitoredVehicleJourney.FramedVehicleJourneyRef.DatedVehicleJourneyRef,
		);

		const trip = gtfsResource.operatingServices
			.map((service) => gtfsResource.gtfs.trips.get(`${service.id}${journeyRef}`))
			.find((trip) => trip !== undefined);

		if (trip === undefined) {
			console.warn(`	${vehicle.VehicleMonitoringRef} - Failed to find trip for vehicle journey ref '${journeyRef}'`);
			continue;
		}

		const { latitude, longitude } = extractCoordinates(vehicle.MonitoredVehicleJourney.VehicleLocation.Coordinates);

		const timestamp = Math.floor(Temporal.Instant.from(vehicle.RecordedAtTime).epochMilliseconds / 1000);

		const tripDescriptor = {
			tripId: trip.id,
			routeId: trip.routeId,
			directionId: trip.directionId,
			scheduleRelationship: GtfsRealtime.transit_realtime.TripDescriptor.ScheduleRelationship.SCHEDULED,
		};

		const vehicleDescriptor = { id: vehicleRef, label: vehicle.MonitoredVehicleJourney.DestinationName };

		const atStop = vehicle.MonitoredVehicleJourney.MonitoredCall.VehicleAtStop;
		const atTerminus =
			vehicle.MonitoredVehicleJourney.MonitoredCall.Order > 1 &&
			vehicle.MonitoredVehicleJourney.MonitoredCall.StopPointRef === vehicle.MonitoredVehicleJourney.DestinationRef;

		store.vehiclePositions.set(`VM:${vehicleRef}`, {
			currentStatus:
				atStop || atTerminus
					? GtfsRealtime.transit_realtime.VehiclePosition.VehicleStopStatus.STOPPED_AT
					: GtfsRealtime.transit_realtime.VehiclePosition.VehicleStopStatus.IN_TRANSIT_TO,
			currentStopSequence: vehicle.MonitoredVehicleJourney.MonitoredCall.Order + (atStop || atTerminus ? 0 : 1),
			position: { latitude, longitude, bearing: vehicle.MonitoredVehicleJourney.Bearing },
			timestamp,
			trip: tripDescriptor,
			vehicle: vehicleDescriptor,
		});

		const hasArrival =
			vehicle.MonitoredVehicleJourney.MonitoredCall.AimedArrivalTime !== undefined &&
			vehicle.MonitoredVehicleJourney.MonitoredCall.ExpectedArrivalTime !== undefined;
		const hasDeparture =
			vehicle.MonitoredVehicleJourney.MonitoredCall.AimedDepartureTime !== undefined &&
			vehicle.MonitoredVehicleJourney.MonitoredCall.ExpectedDepartureTime !== undefined;

		if (hasArrival || hasDeparture) {
			store.tripUpdates.set(`ET:${trip.id}`, {
				stopTimeUpdate: [
					{
						stopSequence: vehicle.MonitoredVehicleJourney.MonitoredCall.Order,
						stopId: `0:${extractSiriRef(vehicle.MonitoredVehicleJourney.MonitoredCall.StopPointRef)[3]}`,
						scheduleRelationship:
							GtfsRealtime.transit_realtime.TripUpdate.StopTimeUpdate.ScheduleRelationship.SCHEDULED,
						arrival: hasArrival
							? {
									delay: Temporal.Instant.from(vehicle.MonitoredVehicleJourney.MonitoredCall.ExpectedArrivalTime)
										.since(vehicle.MonitoredVehicleJourney.MonitoredCall.AimedArrivalTime)
										.total("seconds"),
									time: Math.floor(
										Temporal.Instant.from(vehicle.MonitoredVehicleJourney.MonitoredCall.ExpectedArrivalTime)
											.epochMilliseconds / 1000,
									),
								}
							: undefined,
						departure: hasDeparture
							? {
									delay: Temporal.Instant.from(vehicle.MonitoredVehicleJourney.MonitoredCall.ExpectedDepartureTime)
										.since(vehicle.MonitoredVehicleJourney.MonitoredCall.AimedDepartureTime)
										.total("seconds"),
									time: Math.floor(
										Temporal.Instant.from(vehicle.MonitoredVehicleJourney.MonitoredCall.ExpectedDepartureTime)
											.epochMilliseconds / 1000,
									),
								}
							: undefined,
					},
				],
				timestamp,
				trip: tripDescriptor,
				vehicle: vehicleDescriptor,
			});

			console.log(
				` 	${vehicleRef} - ${journeyRef} - ${vehicle.MonitoredVehicleJourney.PublishedLineName}\t${vehicle.MonitoredVehicleJourney.DirectionName} ${extractSiriRef(vehicle.MonitoredVehicleJourney.OriginRef)[3]} > ${extractSiriRef(vehicle.MonitoredVehicleJourney.DestinationRef)[3]} @ ${extractSiriRef(vehicle.MonitoredVehicleJourney.MonitoredCall.StopPointRef)[3]} (#${vehicle.MonitoredVehicleJourney.MonitoredCall.Order} - atStop: ${atStop} - atTerminus: ${atTerminus})`,
			);
		}
	}

	idx += 1;
	const waitingTime = Math.max(SIRI_RATELIMIT - (Date.now() - startedAt), 0);
	console.log(`✓ Done processing vehicle batch, waiting for ${waitingTime}ms`);
	await setTimeout(waitingTime);
}
