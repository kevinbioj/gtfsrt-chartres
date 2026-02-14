import dayjs from "dayjs";

import type { Calendar } from "../gtfs/@types.js";

export function checkCalendar(calendar: Calendar) {
	const now = dayjs().subtract(4, "hours").subtract(30, "minutes");
	const nowDate = now.format("YYYYMMDD");
	// 1. If we are outside the operating period, we deny the calendar.
	if (
		!now.isBetween(
			dayjs(calendar.from, "YYYYMMDD"),
			dayjs(calendar.to, "YYYYMMDD"),
			"day",
			"[]",
		)
	)
		return false;
	// 2. If the current date is whitelisted, we allow the calendar.
	if (calendar.whitelist.includes(nowDate)) return true;
	// 3. If the current date is blacklisted, we deny the calendar.
	if (calendar.blacklist.includes(nowDate)) return false;
	// 4. We check whether the calendar runs on the current day of week.
	return calendar.days[now.day()];
}
