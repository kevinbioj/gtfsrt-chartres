import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Cron } from "croner";
import { Temporal } from "temporal-polyfill";

import { getOperatingLineIds } from "../utils/get-operating-line-ids.js";
import { getOperatingServices } from "../utils/get-operating-services.js";

import { downloadResource } from "./download-resource.js";
import { importResource } from "./import-resource.js";

let currentInterval: NodeJS.Timeout | undefined;
let operatingInfoJob: Cron | undefined;

export async function useGtfsResource(resourceUrl: string) {
	const initialResource = await loadResource(resourceUrl);
	const initialNow = Temporal.Now.zonedDateTimeISO("Europe/Paris");
	const initialToday = initialNow.toPlainDate().subtract({ days: initialNow.hour < 3 ? 1 : 0 });

	const resource = {
		gtfs: initialResource.resource,
		lastModified: initialResource.lastModified,
		operatingServices: getOperatingServices(initialResource.resource, initialToday),
		operatingLineIds: getOperatingLineIds(initialResource.resource, initialToday),
		importedAt: Temporal.Now.instant(),
	};

	if (operatingInfoJob === undefined) {
		operatingInfoJob = new Cron("0 3 * * *", () => {
			const today = Temporal.Now.zonedDateTimeISO().toPlainDate();
			resource.operatingServices = getOperatingServices(resource.gtfs, today);
			resource.operatingLineIds = getOperatingLineIds(resource.gtfs, today);
		});
	}

	if (currentInterval !== undefined) {
		clearInterval(currentInterval);
	}

	currentInterval = setInterval(
		async () => {
			console.log("➔ Checking for GTFS resource staleness.");

			try {
				const response = await fetch(resourceUrl, {
					method: "HEAD",
					signal: AbortSignal.timeout(30_000),
				});

				if (!response.ok) {
					console.warn("    ⛛ Unable to fetch GTFS staleness data, aborting.");
					return;
				}

				if (response.headers.get("last-modified") === resource.lastModified) {
					console.log("    ⛛ GTFS resource is up-to-date.");
					return;
				}

				console.log("    ⛛ GTFS resource is stale: requesting update.");

				const now = Temporal.Now.zonedDateTimeISO("Europe/Paris");
				const today = now.toPlainDate().subtract({ days: now.hour < 3 ? 1 : 0 });

				const newResource = await loadResource(resourceUrl);
				resource.gtfs = newResource.resource;
				resource.lastModified = newResource.lastModified;
				resource.operatingServices = getOperatingServices(initialResource.resource, today);
				resource.operatingLineIds = getOperatingLineIds(initialResource.resource, today);
				resource.importedAt = Temporal.Now.instant();
			} catch (cause) {
				console.error(`✘ GTFS update routine failed:`, cause);
			}
		},
		Temporal.Duration.from({ minutes: 5 }).total("milliseconds"),
	);

	return resource;
}

// --- loadResource

async function loadResource(resourceUrl: string) {
	console.log(`➔ Loading GTFS resource at '${resourceUrl}'.`);

	const workingDirectory = await mkdtemp(join(tmpdir(), "gtfsrt-chartres_"));
	console.log(`    ⛛ Generated working directory at '${workingDirectory}'.`);

	try {
		const { lastModified } = await downloadResource(resourceUrl, workingDirectory);
		const resource = await importResource(workingDirectory);
		console.log("✓ Successfully loaded resource!");
		return { resource, lastModified };
	} catch (cause) {
		throw new Error("Failed to load GTFS resource", { cause });
		// console.log("✘ Failed to load resource!", error);
	} finally {
		await rm(workingDirectory, { recursive: true });
	}
}
