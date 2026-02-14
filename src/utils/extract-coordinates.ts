export const extractCoordinates = (input: string) => {
	const [lon, lat] = input.split(" ");
	return { latitude: +lat, longitude: +lon };
};
