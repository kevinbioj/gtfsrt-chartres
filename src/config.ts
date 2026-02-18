import { Temporal } from "temporal-polyfill";

export const GTFS_RESOURCE_URL = "https://www.data.gouv.fr/api/1/datasets/r/8d4c3e5c-1702-4649-b47a-b16c6016dcc6";
export const PORT = 3000;
export const REFRESH_INTERVAL = Temporal.Duration.from({ minutes: 10 }).total("milliseconds");
export const REQUESTOR_REF = "opendata";
export const SIRI_ENDPOINT =
	"https://navineo.filibus.sae-chartres.ovh:4435/ProfilSiri2_0pIDF2_4Producer-FILIBUS/SiriServices";
export const SIRI_RATELIMIT = Temporal.Duration.from({ seconds: 2, milliseconds: 500 }).total("milliseconds");
export const SWEEP_THRESHOLD = Temporal.Duration.from({ minutes: 10 }).total("milliseconds");
