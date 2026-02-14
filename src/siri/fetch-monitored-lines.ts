import { LINES_DISCOVERY } from "./payloads.js";
import { requestSiri } from "./request-siri.js";

type AnnotatedLine = {
	LineRef: string;
	Monitored: boolean;
};

export async function fetchMonitoredLines(siriEndpoint: string) {
	const payload = await requestSiri(siriEndpoint, LINES_DISCOVERY("opendata"));
	const annotatedLines = payload.Envelope.Body.LinesDiscoveryResponse.Answer
		.AnnotatedLineRef as AnnotatedLine[];
	return annotatedLines
		.filter((annotatedLine) => annotatedLine.Monitored)
		.map((annotatedLine) => annotatedLine.LineRef);
}
