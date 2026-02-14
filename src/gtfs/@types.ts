//- GTFS Static

export type Calendar = {
	id: string;
	days: [boolean, boolean, boolean, boolean, boolean, boolean, boolean];
	whitelist: string[];
	blacklist: string[];
	from: string;
	to: string;
};

export type GtfsResource = {
	calendars: Map<string, Calendar>;
	stops: Map<string, Stop>;
	trips: Map<string, Trip>;
};

export type Stop = {
	id: string;
	name: string;
};

export type StopTime = {
	sequence: number;
	stop: Stop;
	time: string;
};

export type Trip = {
	id: string;
	calendar: Calendar;
	route: string;
	direction: number;
	stops: StopTime[];
};

//- GTFS Real-Time

export type StopTimeEvent = {
	delay: number;
	time: number;
};

export type TripDescriptor = {
	tripId: string;
	routeId: string;
	directionId: number;
	scheduleRelationship: "SCHEDULED";
};

export type VehicleDescriptor = {
	id: string;
	label: string;
};

export type TripUpdateEntity = {
	id: string;
	tripUpdate: {
		stopTimeUpdate: Array<{
			scheduleRelationship?: "SCHEDULED" | "SKIPPED" | "NO-DATA";
			arrival: StopTimeEvent;
			departure: StopTimeEvent;
			stopId: string;
			stopSequence?: number;
		}>;
		timestamp: number;
		trip: TripDescriptor;
		vehicle: VehicleDescriptor;
	};
};

export type GtfsRtTripUpdate = {
	header: {
		gtfsRealtimeVersion: string;
		incrementality: "FULL_DATASET";
		timestamp: number;
	};
	entity: TripUpdateEntity[];
};

export type VehiclePositionEntity = {
	id: string;
	vehicle: {
		currentStatus?: "STOPPED_AT" | "IN_TRANSIT_TO";
		currentStopSequence?: number;
		position: {
			latitude: number;
			longitude: number;
			bearing: number;
		};
		stopId?: string;
		timestamp: number;
		trip?: TripDescriptor;
		vehicle: VehicleDescriptor;
	};
};

export type GtfsRtVehiclePosition = {
	header: {
		gtfsRealtimeVersion: string;
		timestamp: string;
	};
	entity: VehiclePositionEntity[];
};
