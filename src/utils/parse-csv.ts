export async function parseCsv<T = Record<string, string>>(input: Buffer) {
	const [header, ...records] = input
		.toString()
		.trimEnd()
		.split(/\r?\n/)
		.map((line) => line.trim().split(","));
	return records.map((values) => {
		const record = {} as Record<string | number, unknown>;
		values.forEach((value, index) => {
			const key = header[index];
			record[key] = value.replace(/^\"(.*)\"$/, "$1");
		});
		return record as T;
	});
}
