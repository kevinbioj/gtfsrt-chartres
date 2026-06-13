export const GTFS_RESOURCE_URL =
	"https://transport-data-gouv-fr-resource-history-prod.cellar-c2.services.clever-cloud.com/80587/80587.20260211.113050.276767.zip";
export const PORT = 3000;
export const REFRESH_INTERVAL = Temporal.Duration.from({ minutes: 10 }).total("milliseconds");
export const REQUESTOR_REF = "opendata";
export const SIRI_ENDPOINT =
	"https://navineo.filibus.sae-chartres.ovh:4435/ProfilSiri2_0pIDF2_4Producer-FILIBUS/SiriServices";
export const SIRI_RATELIMIT = Temporal.Duration.from({ seconds: 2, milliseconds: 500 }).total("milliseconds");
export const SWEEP_THRESHOLD = Temporal.Duration.from({ minutes: 10 }).total("milliseconds");
