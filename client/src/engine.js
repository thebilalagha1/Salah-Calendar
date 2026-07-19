// ============================================================
// engine.js — pure scheduling + recurrence logic (no UI deps)
// ============================================================

export const SALAH_ORDER = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
export const SALAH_LABEL = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" };

// ---------- Judaism (zmanim / tefillot) ----------
export const JUDAISM_ORDER = ["shacharit", "mincha", "maariv"];
export const JUDAISM_LABEL = { shacharit: "Shacharit", mincha: "Mincha", maariv: "Maariv" };
// Manual-fallback placeholders (same role DEFAULT_TIMES plays for Islam) — only
// used when no location has been detected, so Hebcal can't be queried yet.
export const DEFAULT_JUDAISM_TIMES = { shacharit: "07:00", mincha: "13:30", maariv: "19:30" };
export const DEFAULT_JUDAISM_DURATIONS = { shacharit: 20, mincha: 20, maariv: 20 };

// Order/label lookup by religion, for the handful of call sites that need to
// render generically regardless of which one is active.
export const ORDER_BY_RELIGION = { islam: SALAH_ORDER, judaism: JUDAISM_ORDER };
export const LABEL_BY_RELIGION = { islam: SALAH_LABEL, judaism: JUDAISM_LABEL };

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
  // Judaism's three tefillot, keyed separately (no collision with the Islam
  // keys above) so every existing SALAH_WINDOW_COLORS[key] lookup throughout
  // the UI already works for both religions without further changes.
  shacharit: "#5C6BC0", // indigo — morning
  mincha: "#F9A825",    // amber — afternoon
  maariv: "#283593",    // deep indigo — night
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

// ---------- Prayer time provider architecture ----------
// Shared shape both providers resolve to, per date: a plain object whose keys
// are the religion's own field names, each an "HH:MM" local wall-clock string
// (the app already renders everything in local minutes-since-midnight — see
// buildSalahWindows below — so providers normalize into that instead of
// threading Date objects through the whole UI layer). This is the pragmatic
// version of the PrayerWindow interface: same information, shaped so the
// existing TimelineView/RingView/EventModal code needs zero changes.
//
//   AladhanProvider.fetchDate(lat, lng, date, method) -> { fajr, dhuhr, asr, maghrib, isha, sunrise } | null
//   HebcalProvider.fetchRange(lat, lng, tzid, dates)   -> { [dateKey]: { shacharitStart, shacharitEnd, minchaStart, minchaEnd, maarivStart, sunrise, chatzotNightMin } }

export const AladhanProvider = {
  religion: "islam",
  async fetchDate(lat, lng, date, method) {
    const res = await fetch(buildAladhanCoordsUrl(date, lat, lng, method));
    const json = await res.json();
    return parseAladhanTimings(json);
  },
};

export function buildHebcalZmanimRangeUrl(lat, lng, tzid, startDate, endDate) {
  return `https://www.hebcal.com/zmanim?cfg=json&latitude=${lat}&longitude=${lng}&tzid=${encodeURIComponent(tzid)}&start=${dateKey(startDate)}&end=${dateKey(endDate)}`;
}

function hhmmFromIso(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Fields needed to build all three tefillah windows. sofZmanTfillaMGA /
// minchaKetana / plagHaMincha aren't used for v1's windows but are kept on
// the mapped object so a future stricter-timing settings toggle can read
// them without another API round-trip.
const HEBCAL_REQUIRED_FIELDS = ["alotHaShachar", "sofZmanTfilla", "minchaGedola", "sunset", "tzeit7083deg", "chatzotNight", "sunrise"];

function mapHebcalFieldsForDate(fields) {
  if (!fields || !HEBCAL_REQUIRED_FIELDS.every((f) => fields[f])) return null;
  const chatzotNightHHMM = hhmmFromIso(fields.chatzotNight);
  if (!chatzotNightHHMM) return null;
  return {
    shacharitStart: hhmmFromIso(fields.alotHaShachar),
    shacharitEnd: hhmmFromIso(fields.sofZmanTfilla),
    minchaStart: hhmmFromIso(fields.minchaGedola),
    minchaEnd: hhmmFromIso(fields.sunset),
    maarivStart: hhmmFromIso(fields.tzeit7083deg),
    sunrise: hhmmFromIso(fields.sunrise),
    chatzotNightMin: toMin(chatzotNightHHMM),
    // Not read by v1's window builders — reserved for a future Gra/MGA toggle
    // or minchaKetana/plagHaMincha sub-boundary markers.
    extra: {
      sofZmanTfillaMGA: fields.sofZmanTfillaMGA || null,
      minchaKetana: fields.minchaKetana || null,
      plagHaMincha: fields.plagHaMincha || null,
    },
  };
}

// Parses a Hebcal /zmanim response into { [dateKeyString]: mappedFields }.
// Handles both the single-date shape (times.<field> = iso string) and the
// batch/range shape (times.<field>[dateKeyString] = iso string) — the batch
// shape is what this app actually uses (see HebcalProvider below), but this
// stays defensive for a single-date response too.
export function parseHebcalResponse(json) {
  const times = json?.times;
  if (!times) return {};
  const sample = Object.values(times)[0];
  const isBatch = sample != null && typeof sample === "object";
  if (!isBatch) {
    const mapped = mapHebcalFieldsForDate(times);
    return mapped && json.date ? { [json.date]: mapped } : {};
  }
  const dateKeys = new Set();
  Object.values(times).forEach((byDate) => Object.keys(byDate || {}).forEach((dk) => dateKeys.add(dk)));
  const out = {};
  for (const dk of dateKeys) {
    const fields = {};
    for (const field of Object.keys(times)) fields[field] = times[field][dk];
    const mapped = mapHebcalFieldsForDate(fields);
    if (mapped) out[dk] = mapped;
  }
  return out;
}

export const HebcalProvider = {
  religion: "judaism",
  // Hebcal recommends batching rather than one request per date, and the app
  // already fetches a whole visible range (single day or the 7 days of a
  // week) at once — so this issues exactly one request for that range,
  // extended by one extra trailing day so the last visible date's Maariv
  // window has a real "next day" chatzotNight to end at (see
  // buildJudaismWindows). Coordinates are rounded to 3 decimals (~110m) so
  // GPS jitter doesn't create a fresh cache key on every call.
  async fetchRange(lat, lng, tzid, dates) {
    if (!dates || !dates.length) return {};
    const sorted = [...dates].sort((a, b) => a - b);
    const start = sorted[0];
    const end = addDays(sorted[sorted.length - 1], 1);
    const url = buildHebcalZmanimRangeUrl(+lat.toFixed(3), +lng.toFixed(3), tzid, start, end);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Hebcal request failed (${res.status})`);
    const json = await res.json();
    return parseHebcalResponse(json);
  },
};

// Shacharit/Mincha/Maariv windows from live Hebcal data for one date.
// nextDayChatzotNightMin should be the *following* date's chatzotNightMin
// (Hebcal's chatzotNight for date D is the midpoint of the night ending at
// D's sunrise, so "tonight's" halachic midnight — the end of tonight's
// Maariv window — is tomorrow's chatzotNight field, mirroring how Isha's
// window already uses nextFajr below).
export function buildJudaismWindows(times, nextDayChatzotNightMin) {
  const maarivStart = toMin(times.maarivStart);
  const maarivEnd = nextDayChatzotNightMin != null ? nextDayChatzotNightMin + DAY_END : DAY_END;
  return [
    { key: "shacharit", label: JUDAISM_LABEL.shacharit, windowStart: toMin(times.shacharitStart), windowEnd: toMin(times.shacharitEnd) },
    { key: "mincha", label: JUDAISM_LABEL.mincha, windowStart: toMin(times.minchaStart), windowEnd: toMin(times.minchaEnd) },
    { key: "maariv", label: JUDAISM_LABEL.maariv, windowStart: maarivStart, windowEnd: maarivEnd },
  ];
}

// Generic manual-mode window builder — no solar/halachic edge cases, just
// "each window runs until the next one starts, last one runs to end of day".
// Used as the manual fallback for religions without an Islam-style
// Fajr/sunrise + Isha/midnight special case (currently: Judaism, when no
// location has been detected yet so Hebcal can't be queried).
export function buildGenericWindows(order, label, times) {
  const sorted = order
    .map((key) => ({ key, label: label[key], start: toMin(times[key]) }))
    .sort((a, b) => a.start - b.start);
  return sorted.map((s, i) => {
    const next = sorted[i + 1];
    return { key: s.key, label: s.label, windowStart: s.start, windowEnd: next ? next.start : DAY_END };
  });
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
// Parses a "YYYY-MM-DD" string (as produced by dateKey / <input type="date">) into
// a LOCAL Date at local midnight. Do not use `new Date(dateString)` for this: the
// JS spec parses bare date-only ISO strings as UTC midnight, which lands on the
// previous local calendar day for any timezone behind UTC (all of the US, etc.) —
// that off-by-one is what was causing events to appear a day earlier than saved.
export function parseDateKey(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
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
  const anchor = parseDateKey(task.date);
  anchor.setHours(0, 0, 0, 0);

  if (target < anchor) return false;
  if (task.repeatUntil) {
    const until = parseDateKey(task.repeatUntil);
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
