// ============================================================
// engine.js — pure scheduling + recurrence logic (no UI deps)
// ============================================================

export const SALAH_ORDER = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
export const SALAH_LABEL = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" };

export const DAY_START = 0;
export const DAY_END = 24 * 60;

export const DEFAULT_TIMES = { fajr: "05:10", dhuhr: "13:05", asr: "16:35", maghrib: "19:50", isha: "21:15" };
export const DEFAULT_DURATIONS = { fajr: 20, dhuhr: 20, asr: 20, maghrib: 20, isha: 20 };

// Distinct hue per salah so their window shading / brackets / ring bands never
// blend into one another (previously everything used one flat gray tint).
// Roughly follows the arc of the day: cool dawn -> warm midday -> deep dusk/night.
export const SALAH_WINDOW_COLORS = {
  fajr: "#5C6BC0",     // indigo — dawn
  dhuhr: "#F9A825",    // amber — high sun
  asr: "#EF6C00",      // deep orange — afternoon
  maghrib: "#C2185B",  // rose — sunset
  isha: "#283593",     // deep indigo — night
};
// Traditionally-discouraged prayer windows get their own warm warning tone,
// distinct from every salah color above, so they never read as "just another salah".
export const PROHIBITED_COLOR = "#C62828";
// Sunrise isn't a salah, but it marks the true end of the Fajr window and the
// start of the post-sunrise "discouraged" window, so it's tracked separately.
export const DEFAULT_SUNRISE = "06:30";

export const uid = () => Math.random().toString(36).slice(2, 10);

// ---------- event color coding (Google Calendar style palette) ----------
export const EVENT_COLORS = [
  { name: "Peacock", value: "#039BE5" },
  { name: "Tomato", value: "#D50000" },
  { name: "Tangerine", value: "#F4511E" },
  { name: "Banana", value: "#F6BF26" },
  { name: "Sage", value: "#33B679" },
  { name: "Basil", value: "#0B8043" },
  { name: "Blueberry", value: "#3F51B5" },
  { name: "Lavender", value: "#7986CB" },
  { name: "Grape", value: "#8E24AA" },
  { name: "Graphite", value: "#616161" },
];
export const DEFAULT_EVENT_COLOR = EVENT_COLORS[0].value;

export function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------- AlAdhan API helpers ----------
export const DEFAULT_METHOD = 2;
export const CALC_METHODS = [
  { value: 1, label: "University of Islamic Sciences, Karachi" },
  { value: 2, label: "Islamic Society of North America (ISNA)" },
  { value: 3, label: "Muslim World League" },
  { value: 4, label: "Umm al-Qura, Makkah" },
  { value: 5, label: "Egyptian General Authority" },
  { value: 8, label: "Gulf Region" },
  { value: 12, label: "Umm al-Qura (adjusted)" },
];

function pad2(n) {
  return String(n).padStart(2, "0");
}
// AlAdhan expects DD-MM-YYYY for date-scoped endpoints
export function formatDateForAladhan(date) {
  return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()}`;
}
export function buildAladhanCoordsUrl(date, lat, lng, method) {
  return `https://api.aladhan.com/v1/timings/${formatDateForAladhan(date)}?latitude=${lat}&longitude=${lng}&method=${method}`;
}
export function buildAladhanCityUrl(date, city, country, method) {
  return `https://api.aladhan.com/v1/timingsByCity/${formatDateForAladhan(date)}?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=${method}`;
}
// Parses AlAdhan (or compatible) JSON into { fajr, dhuhr, asr, maghrib, isha } or null if incomplete.
export function parseAladhanTimings(json) {
  const t = json?.data?.timings || json?.timings || json?.data || json;
  if (!t) return null;
  const clean = (v) => (typeof v === "string" ? v.split(" ")[0].slice(0, 5) : null);
  const mapped = {
    fajr: clean(t.Fajr || t.fajr),
    dhuhr: clean(t.Dhuhr || t.dhuhr || t.Zuhr),
    asr: clean(t.Asr || t.asr),
    maghrib: clean(t.Maghrib || t.maghrib),
    isha: clean(t.Isha || t.isha),
    sunrise: clean(t.Sunrise || t.sunrise),
  };
  return SALAH_ORDER.every((k) => mapped[k]) ? mapped : null;
}

export function toMin(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
export function fmt12(min) {
  const h24 = Math.floor(min / 60) % 24;
  const m = ((min % 60) + 60) % 60;
  const ampm = h24 >= 12 ? "pm" : "am";
  let h = h24 % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, "0")}${ampm}`;
}
// 24-hour "HH:MM" formatter — wraps the same way fmt12 does for minute values
// that run past midnight (e.g. Isha windows extending into the next day).
export function fmt24(min) {
  const h24 = Math.floor(min / 60) % 24;
  const m = ((min % 60) + 60) % 60;
  return `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
export function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
export function startOfWeek(d) {
  const r = new Date(d);
  const day = r.getDay(); // 0 = Sun
  r.setDate(r.getDate() - day);
  r.setHours(0, 0, 0, 0);
  return r;
}
export function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
export function daysInMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ---------- recurrence ----------
// task.repeat: "none" | "daily" | "weekly" | "monthly"
// task.weekdays: array of 0-6 (used when repeat === "weekly"; if empty, use start date's weekday)
// task.repeatUntil: ISO date string or null (open-ended)

export function occursOnDate(task, date) {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const anchor = new Date(task.date);
  anchor.setHours(0, 0, 0, 0);

  if (target < anchor) return false;
  if (task.repeatUntil) {
    const until = new Date(task.repeatUntil);
    until.setHours(0, 0, 0, 0);
    if (target > until) return false;
  }

  switch (task.repeat) {
    case "daily":
      return true;
    case "weekly": {
      const days = task.weekdays && task.weekdays.length ? task.weekdays : [anchor.getDay()];
      return days.includes(target.getDay());
    }
    case "monthly":
      return target.getDate() === anchor.getDate();
    case "none":
    default:
      return sameDay(target, anchor);
  }
}

// Expand all tasks that occur on a given date into flat instances.
export function instancesForDate(tasks, date) {
  return tasks.filter((t) => occursOnDate(t, date)).map((t) => ({ ...t, occurrenceKey: `${t.id}:${dateKey(date)}` }));
}

export function buildSalahBlocks(times, durations) {
  return SALAH_ORDER.map((key) => {
    const start = toMin(times[key]);
    return { key, label: SALAH_LABEL[key], start, end: start + durations[key], dur: durations[key] };
  }).sort((a, b) => a.start - b.start);
}

// The *full* window each salah spans — not just its short event block — for
// background shading on the calendar. A salah's window runs from its start
// until the next salah begins, except Fajr, whose window ends at sunrise
// (its true end) rather than at Dhuhr, and Isha, whose window ends at
// "Islamic midnight" — the midpoint between today's Maghrib and tomorrow's
// Fajr — rather than at the end of the calendar day. Pass nextFajr (that
// following day's Fajr time, "HH:MM") to get the correct Isha end; if
// omitted, Isha's window falls back to running to end of day. Note the
// returned windowEnd for Isha may exceed DAY_END (1440) since Islamic
// midnight typically falls shortly after 12am — callers that render a
// single fixed-height day (e.g. a day-view column) should clamp/wrap that
// overflow themselves; a circular ring naturally wraps it for free.
export function buildSalahWindows(times, sunrise, nextFajr) {
  const sorted = SALAH_ORDER
    .map((key) => ({ key, label: SALAH_LABEL[key], start: toMin(times[key]) }))
    .sort((a, b) => a.start - b.start);
  const sunriseMin = sunrise ? toMin(sunrise) : null;
  const maghribMin = toMin(times.maghrib);

  return sorted.map((s, i) => {
    let windowEnd;
    if (s.key === "fajr" && sunriseMin != null && sunriseMin > s.start) {
      windowEnd = sunriseMin;
    } else if (s.key === "isha") {
      if (nextFajr) {
        const nextFajrMin = toMin(nextFajr) + DAY_END; // following calendar day
        windowEnd = (maghribMin + nextFajrMin) / 2; // Islamic midnight
      } else {
        windowEnd = DAY_END;
      }
    } else {
      const next = sorted[i + 1];
      windowEnd = next ? next.start : DAY_END;
    }
    return { key: s.key, label: s.label, windowStart: s.start, windowEnd };
  });
}

// Approximate windows traditionally treated as discouraged for prayer: just
// after sunrise, around solar noon, and just before sunset. These are simple
// heuristics for a subtle visual cue only (not a religious ruling) — treat
// the exact minute counts as approximate and verify locally if precision matters.
export function buildProhibitedWindows(times, sunrise) {
  const dhuhr = toMin(times.dhuhr);
  const maghrib = toMin(times.maghrib);
  const sunriseMin = sunrise ? toMin(sunrise) : null;
  const windows = [];
  if (sunriseMin != null) {
    windows.push({ key: "post-sunrise", label: "Discouraged Prayer Time", start: sunriseMin, end: sunriseMin + 20 });
  }
  windows.push({ key: "zenith", label: "Discouraged Prayer Time", start: Math.max(DAY_START, dhuhr - 10), end: dhuhr });
  windows.push({ key: "pre-sunset", label: "Discouraged Prayer Time", start: Math.max(DAY_START, maghrib - 20), end: maghrib });
  return windows;
}

// Deterministic reflow: movable tasks that overlap a salah window (or a
// stagnant task) shift forward to the next free gap. Stagnant tasks never move.
export function reflow(dayTasks, salahBlocks) {
  const stagnant = dayTasks.filter((t) => !t.movable);
  const movable = dayTasks.filter((t) => t.movable).slice().sort((a, b) => a.start - b.start);

  const obstacles = [
    ...stagnant.map((t) => ({ start: t.start, end: t.start + t.dur })),
    ...salahBlocks.map((s) => ({ start: s.start, end: s.end })),
  ].sort((a, b) => a.start - b.start);

  const placed = [];
  const notes = [];

  for (const task of movable) {
    let start = task.start;
    let end = start + task.dur;
    let moved = false;
    let guard = 0;

    while (guard < 50) {
      guard++;
      const blockers = [...obstacles, ...placed.map((p) => ({ start: p.start, end: p.start + p.dur }))];
      const hit = blockers.find((o) => start < o.end && end > o.start);
      if (!hit) break;
      moved = true;
      start = hit.end;
      end = start + task.dur;
    }

    if (end > DAY_END) {
      start = DAY_END - task.dur;
      end = DAY_END;
    }
    if (moved) notes.push({ id: task.occurrenceKey || task.id, title: task.title, from: task.start, to: start });
    placed.push({ ...task, start });
  }

  return { tasks: [...stagnant, ...placed].sort((a, b) => a.start - b.start), notes };
}
