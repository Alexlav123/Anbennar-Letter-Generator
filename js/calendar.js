(function () {
  "use strict";

  const MONTHS = Object.freeze([
    Object.freeze({ name: "Castanmark", realName: "January", days: 31 }),
    Object.freeze({ name: "Esmarment", realName: "February", days: 28 }),
    Object.freeze({ name: "Bloomsdawn", realName: "March", days: 31 }),
    Object.freeze({ name: "Silversight", realName: "April", days: 30 }),
    Object.freeze({ name: "Halament", realName: "May", days: 31 }),
    Object.freeze({ name: "Suren", realName: "June", days: 30 }),
    Object.freeze({ name: "Teysuren", realName: "July", days: 31 }),
    Object.freeze({ name: "Yshdament", realName: "August", days: 31 }),
    Object.freeze({ name: "Bloomsend", realName: "September", days: 30 }),
    Object.freeze({ name: "Tearfall", realName: "October", days: 31 }),
    Object.freeze({ name: "Nerament", realName: "November", days: 30 }),
    Object.freeze({ name: "Truefrost", realName: "December", days: 31 })
  ]);

  function isLeapYear(year) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  }

  function daysInMonth(month, year) {
    if (month === 1 && isLeapYear(year)) return 29;
    return MONTHS[month]?.days || 31;
  }

  function clampDate(value, fallback = { day: 11, month: 10, year: 1444 }) {
    const year = Math.max(1, Math.trunc(Number(value?.year)) || fallback.year);
    const rawMonth = Number(value?.month);
    const month = Math.min(11, Math.max(0, Number.isFinite(rawMonth) ? Math.trunc(rawMonth) : fallback.month));
    const day = Math.min(daysInMonth(month, year), Math.max(1, Math.trunc(Number(value?.day)) || fallback.day));
    return { day, month, year };
  }

  function ordinal(day) {
    const remainder100 = day % 100;
    if (remainder100 >= 11 && remainder100 <= 13) return `${day}th`;
    switch (day % 10) {
      case 1: return `${day}st`;
      case 2: return `${day}nd`;
      case 3: return `${day}rd`;
      default: return `${day}th`;
    }
  }

  function format(value) {
    const date = clampDate(value);
    return `${ordinal(date.day)} of ${MONTHS[date.month].name}, ${date.year}`;
  }

  function firstWeekday(month, year) {
    const date = new Date(0);
    date.setUTCFullYear(year, month, 1);
    date.setUTCHours(0, 0, 0, 0);
    return date.getUTCDay();
  }

  function parseLegacy(value, fallback) {
    if (value && typeof value === "object") return clampDate(value, fallback);
    if (typeof value !== "string") return clampDate(fallback, fallback);
    const dayMatch = value.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/i);
    const yearMatch = value.match(/\b(\d{3,6})\b(?!.*\b\d{3,6}\b)/);
    const normalized = value.toLowerCase();
    const month = MONTHS.findIndex((item) => normalized.includes(item.name.toLowerCase()) || normalized.includes(item.realName.toLowerCase()));
    return clampDate({
      day: dayMatch ? Number(dayMatch[1]) : fallback.day,
      month: month >= 0 ? month : fallback.month,
      year: yearMatch ? Number(yearMatch[1]) : fallback.year
    }, fallback);
  }

  window.AnbennarCalendar = Object.freeze({ MONTHS, isLeapYear, daysInMonth, clampDate, ordinal, format, firstWeekday, parseLegacy });
})();
