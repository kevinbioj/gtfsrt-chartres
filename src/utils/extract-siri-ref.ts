export function extractSiriRef(input?: string): [string, string, string, string, string] {
	if (input === undefined) {
		return ["", "", "", "", ""];
	}

	return input.split(":") as [string, string, string, string, string];
}
