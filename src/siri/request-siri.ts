import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
	removeNSPrefix: true,
});

export async function requestSiri(siriEndpoint: string, body: string) {
	const abortController = new AbortController();
	const timeout = setTimeout(
		() => abortController.abort("Request has timed out"),
		10_000,
	);
	const response = await fetch(siriEndpoint, {
		body,
		headers: { "Content-Type": "application/json" },
		method: "POST",
		signal: abortController.signal,
	});
	clearTimeout(timeout);
	const serialized = await response.text();
	return parser.parse(serialized);
}
