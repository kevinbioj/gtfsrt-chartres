import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
	removeNSPrefix: true,
});

export async function requestSiri(siriEndpoint: string, body: string) {
	const response = await fetch(siriEndpoint, {
		body,
		headers: { "Content-Type": "application/xml" },
		method: "POST",
		signal: AbortSignal.timeout(10_000),
	});

	const serialized = await response.text();
	return parser.parse(serialized);
}
