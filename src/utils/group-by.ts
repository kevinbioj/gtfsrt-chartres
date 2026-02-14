export function groupBy<K, V>(data: V[], fn: (value: V, index: number) => K) {
	const map = new Map<K, V[]>();
	for (let i = 0; i < data.length; ++i) {
		const item = data[i];
		const key = fn(item, i);
		const list = map.get(key);
		if (typeof list !== "undefined") list.push(item);
		else map.set(key, [item]);
	}
	return map;
}
