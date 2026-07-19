import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  SALAH_ORDER, SALAH_LABEL, DAY_START, DAY_END,
  DEFAULT_TIMES, DEFAULT_DURATIONS, DEFAULT_SUNRISE, DEFAULT_METHOD, CALC_METHODS, uid, toMin, fmt12, fmt24, dateKey, sameDay,
  addDays, startOfWeek, startOfMonth, daysInMonth, WEEKDAYS, MONTHS,
  occursOnDate, instancesForDate, buildSalahWindows, buildProhibitedWindows, reflow,
  AladhanProvider, HebcalProvider, buildJudaismWindows, buildGenericWindows,
  JUDAISM_ORDER, JUDAISM_LABEL, DEFAULT_JUDAISM_TIMES, DEFAULT_JUDAISM_DURATIONS, ORDER_BY_RELIGION, LABEL_BY_RELIGION,
  EVENT_COLORS, DEFAULT_EVENT_COLOR, hexToRgba,
  SALAH_WINDOW_COLORS, PROHIBITED_COLOR,
} from "./engine.js";

import { API_BASE_URL } from "./config.js";
import { authHeaders } from "./authToken.js";
import qamuWordmark from "./assets/qamu-wordmark.png";
import qamuIcon from "./assets/qamu-icon.png";

const PX_PER_MIN = 1.1;

// ---------- storage adapter ----------
// Backed by the Express/SQLite API in server/, scoped to whichever Google
// account is signed in. Auth is a bearer token (see authToken.js) sent
// explicitly on every request, rather than a cookie — cookies aren't
// reliably sent on cross-site requests (client on vercel.app, server on a
// different origin) in every browser, which was silently breaking sync
// across devices. Same get/set(key, value) shape the rest of this file
// already expects, so nothing below this block needed to change.
const store = {
  async get(key) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/kv/${encodeURIComponent(key)}`, {
        headers: { ...authHeaders() },
      });
      if (!res.ok) return null; // 404 = nothing saved yet, 401 = signed out
      const data = await res.json();
      return data.value ?? null;
    } catch {
      // ignore — network hiccup, treat as "nothing saved yet"
    }
    return null;
  },
  async set(key, value) {
    try {
      await fetch(`${API_BASE_URL}/api/kv/${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ value }),
      });
    } catch {
      // ignore — save will retry next time state changes
    }
  },
};

const SEED_TASKS = [];

// ---------- icons (Tabler-style outline, hand-drawn minimal) ----------
const Icon = {
  Year: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="4" width="18" height="17" rx="1.5"/><path d="M3 9h18M8 3v3M16 3v3"/></svg>,
  Month: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="4" width="18" height="17" rx="1.5"/><path d="M3 9h18M8 3v3M16 3v3M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/></svg>,
  Week: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="4" width="18" height="17" rx="1.5"/><path d="M3 9h18M8 3v3M16 3v3M7 13h2M11 13h2M15 13h2M7 17h2M11 17h2M15 17h2"/></svg>,
  Day: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="4" width="18" height="17" rx="1.5"/><path d="M3 9h18M8 3v3M16 3v3"/><rect x="9.5" y="12" width="5" height="6" rx="1"/></svg>,
  Locate: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>,
  Settings: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  Plus: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14M5 12h14"/></svg>,
  ChevL: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 18l-6-6 6-6"/></svg>,
  ChevR: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18l6-6-6-6"/></svg>,
  Moon: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>,
  Sun: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></svg>,
  Pin: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 1 1 18.5 10c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.2"/></svg>,
  Trash: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/></svg>,
  Repeat: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
  Link: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9 17H7a5 5 0 0 1 0-10h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8"/></svg>,
  X: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 6L6 18M6 6l12 12"/></svg>,
  Clock: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  Ring: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.2"/></svg>,
  Menu: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17"/></svg>,
};

// ---------- main ----------

export default function SalahCalendar({ user, onLogout }) {
  const [view, setView] = useState("ring"); // ring | day | week | month | year
  const [cursor, setCursor] = useState(new Date());
  // religion: "islam" | "judaism" | null (null = not chosen yet, show the picker)
  const [religion, setReligion] = useState(null);
  // Manual fallback templates hold BOTH religions' keys at once (fajr..isha
  // and shacharit/mincha/maariv) — one settings blob, no per-religion storage
  // key, switching religions later just reads a different subset of keys.
  const [salahTimes, setSalahTimes] = useState({ ...DEFAULT_TIMES, ...DEFAULT_JUDAISM_TIMES });
  const [durations, setDurations] = useState({ ...DEFAULT_DURATIONS, ...DEFAULT_JUDAISM_DURATIONS });
  const [sunrise, setSunrise] = useState(DEFAULT_SUNRISE); // manual fallback, used for Fajr's window end + shading
  const activeOrder = religion === "judaism" ? JUDAISM_ORDER : SALAH_ORDER;
  const activeLabel = religion === "judaism" ? JUDAISM_LABEL : SALAH_LABEL;
  const hasProhibited = religion !== "judaism"; // no halachic equivalent to makruh prayer times
  const [tasks, setTasks] = useState(SEED_TASKS);
  const [showSettings, setShowSettings] = useState(false);
  const [modal, setModal] = useState(null); // { date } or { editing: task }
  const [salahDetail, setSalahDetail] = useState(null); // { date, block, window } — read-only salah popup
  const [lastNotes, setLastNotes] = useState([]);
  const [darkMode, setDarkMode] = useState(false);
  const [use24h, setUse24h] = useState(false);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => (typeof window !== "undefined" ? window.innerWidth > 860 : true));
  const [isMobile, setIsMobile] = useState(() => (typeof window !== "undefined" ? window.innerWidth <= 860 : false));

  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth <= 860); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ---- AlAdhan integration ----
  // timesByDate caches real per-day prayer times fetched from AlAdhan, keyed by dateKey.
  const [timesByDate, setTimesByDate] = useState({});
  const [locationMode, setLocationMode] = useState("manual"); // manual | coords
  const [coords, setCoords] = useState(null); // { lat, lng }
  const [method, setMethod] = useState(DEFAULT_METHOD);
  const [locStatus, setLocStatus] = useState("idle"); // idle | locating | ok | error
  const [fetchStatus, setFetchStatus] = useState("idle"); // idle | loading | ok | error
  const inFlightRef = useMemo(() => new Set(), []);

  // ---- persistence ----
  // Events (and a few settings) are saved via the artifact's persistent
  // key-value storage so they survive reloads/new sessions on this device.
  useEffect(() => {
    (async () => {
      try {
        const evRaw = await store.get("events");
        if (evRaw) {
          const parsed = JSON.parse(evRaw);
          if (Array.isArray(parsed)) setTasks(parsed);
        }
      } catch {
        // no saved events yet — keep the seed data
      }
      try {
        const stRaw = await store.get("settings");
        if (stRaw) {
          const s = JSON.parse(stRaw);
          if (s.salahTimes) setSalahTimes((prev) => ({ ...prev, ...s.salahTimes }));
          if (s.durations) setDurations((prev) => ({ ...prev, ...s.durations }));
          if (s.sunrise) setSunrise(s.sunrise);
          if (typeof s.darkMode === "boolean") setDarkMode(s.darkMode);
          if (typeof s.use24h === "boolean") setUse24h(s.use24h);
          if (s.locationMode) setLocationMode(s.locationMode);
          if (s.coords) setCoords(s.coords);
          if (typeof s.method === "number") setMethod(s.method);
          if (s.religion === "islam" || s.religion === "judaism") setReligion(s.religion);
        }
      } catch {
        // no saved settings yet — keep the defaults
      }
      setStorageLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!storageLoaded) return;
    store.set("events", JSON.stringify(tasks));
  }, [tasks, storageLoaded]);

  useEffect(() => {
    if (!storageLoaded) return;
    store.set("settings", JSON.stringify({ salahTimes, durations, sunrise, darkMode, use24h, locationMode, coords, method, religion }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salahTimes, durations, sunrise, darkMode, use24h, locationMode, coords, method, religion, storageLoaded]);

  // Browser's IANA zone — passed to Hebcal as tzid. In practice this matches
  // the location the user detected coordinates for, since both come from the
  // same device; a per-location tzid lookup would be more rigorous but isn't
  // needed for v1.
  const tzid = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
  }, []);

  function getTimesForDate(date) {
    // Live provider entries carry their own sunrise (and, for Judaism, every
    // other zmanim field); the manual fallback template doesn't have a
    // per-key sunrise, so attach the manual sunrise setting to it here.
    return timesByDate[dateKey(date)] || { ...salahTimes, sunrise };
  }

  // Windows first (each religion's own edge-case logic lives in engine.js),
  // then blocks are derived from windows: a window's start IS the prayer's
  // own clock time for both religions (buildSalahWindows already sets each
  // Islam window's start to that salah's own time; buildJudaismWindows does
  // the same for shacharit/mincha/maariv), so one function covers both.
  function windowsForDate(date) {
    if (religion === "judaism") {
      const live = timesByDate[dateKey(date)];
      if (live) {
        const nextLive = timesByDate[dateKey(addDays(date, 1))];
        return buildJudaismWindows(live, nextLive ? nextLive.chatzotNightMin : null);
      }
      return buildGenericWindows(JUDAISM_ORDER, JUDAISM_LABEL, salahTimes);
    }
    const t = getTimesForDate(date);
    const nextFajr = getTimesForDate(addDays(date, 1)).fajr;
    return buildSalahWindows(t, t.sunrise, nextFajr);
  }
  function salahBlocksForDate(date) {
    return windowsForDate(date)
      .map((w) => {
        const dur = durations[w.key] ?? 20;
        return { key: w.key, label: w.label, start: w.windowStart, end: w.windowStart + dur, dur };
      })
      .sort((a, b) => a.start - b.start);
  }
  function salahWindowsForDate(date) {
    return windowsForDate(date);
  }
  function prohibitedWindowsForDate(date) {
    if (!hasProhibited) return []; // no halachic equivalent for Judaism's three tefillot
    const t = getTimesForDate(date);
    return buildProhibitedWindows(t, t.sunrise);
  }

  const fetchIslamDate = useCallback(async (date) => {
    const key = dateKey(date);
    if (locationMode === "manual" || !coords || inFlightRef.has(key)) return;
    inFlightRef.add(key);
    try {
      const mapped = await AladhanProvider.fetchDate(coords.lat, coords.lng, date, method);
      if (mapped) {
        setTimesByDate((prev) => ({ ...prev, [key]: mapped }));
        setFetchStatus("ok");
      } else {
        setFetchStatus("error");
      }
    } catch {
      setFetchStatus("error");
    } finally {
      inFlightRef.delete(key);
    }
  }, [locationMode, coords, method]);

  const fetchJudaismRange = useCallback(async (dates) => {
    if (locationMode === "manual" || !coords || !dates.length) return;
    const rangeKey = `hebcal:${dates.map(dateKey).join(",")}`;
    if (inFlightRef.has(rangeKey)) return;
    inFlightRef.add(rangeKey);
    try {
      const byDate = await HebcalProvider.fetchRange(coords.lat, coords.lng, tzid, dates);
      if (Object.keys(byDate).length) {
        setTimesByDate((prev) => ({ ...prev, ...byDate }));
        setFetchStatus("ok");
      } else {
        setFetchStatus("error");
      }
    } catch {
      setFetchStatus("error");
    } finally {
      inFlightRef.delete(rangeKey);
    }
  }, [locationMode, coords, tzid]);

  // Auto-fetch prayer times for whichever dates are currently visible (day/week/ring views).
  useEffect(() => {
    if (locationMode === "manual") return;
    let dates = [];
    if (view === "day" || view === "ring") dates = [cursor];
    else if (view === "week") {
      const start = startOfWeek(cursor);
      dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    } else return; // month/year don't need salah blocks
    const missing = dates.filter((d) => !timesByDate[dateKey(d)]);
    if (!missing.length) return;
    if (religion === "judaism") {
      fetchJudaismRange(missing); // one batch call for the whole visible range
    } else {
      missing.forEach((d) => fetchIslamDate(d));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, dateKey(cursor), locationMode, coords, method, religion]);

  // The two religions' cached entries have different field shapes (Islam:
  // fajr/dhuhr/... ; Judaism: shacharitStart/minchaStart/...), so clear the
  // cache whenever religion changes rather than risk mixing shapes.
  useEffect(() => {
    setTimesByDate({});
  }, [religion]);

  function detectLocation() {
    if (!navigator.geolocation) {
      setLocStatus("error");
      return;
    }
    setLocStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: +pos.coords.latitude.toFixed(4), lng: +pos.coords.longitude.toFixed(4) });
        setLocationMode("coords");
        setLocStatus("ok");
        setTimesByDate({}); // clear cache, new location
      },
      () => setLocStatus("error"),
      { timeout: 10000 }
    );
  }

  const goToday = () => setCursor(new Date());
  const nav = (dir) => {
    const c = new Date(cursor);
    if (view === "year") c.setFullYear(c.getFullYear() + dir);
    else if (view === "month") c.setMonth(c.getMonth() + dir);
    else if (view === "week") c.setDate(c.getDate() + dir * 7);
    else c.setDate(c.getDate() + dir); // day, ring
    setCursor(c);
  };

  function addOrUpdateTask(payload) {
    if (payload.id) {
      setTasks((ts) => ts.map((t) => (t.id === payload.id ? payload : t)));
    } else {
      setTasks((ts) => [...ts, { ...payload, id: uid() }]);
    }
    setModal(null);
  }
  function removeTask(id) {
    setTasks((ts) => ts.filter((t) => t.id !== id));
    setModal(null);
  }

  const theme = darkMode ? THEME_DARK : THEME_LIGHT;

  if (storageLoaded && !religion) {
    return (
      <ReligionPicker
        darkMode={darkMode}
        onPick={(r) => setReligion(r)}
      />
    );
  }

  return (
    <div className="sc-app" style={{ ...S.app, ...theme }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        html, body, #root { height: 100%; margin: 0; overscroll-behavior: none; background: ${darkMode ? "#18181B" : "#FFFFFF"}; }
        .sc-app {
          --week-timecol-w: 56px;
          --week-daycol-w: 110px;
        }
        @media (max-width: 860px) {
          .sc-app { --week-timecol-w: 50px; --week-daycol-w: 76px; }
        }
        .sc-scroll::-webkit-scrollbar-thumb { background: var(--hairline); border-radius: 3px; }

        /* app-wide smoothing: light/dark toggling and any colour-only style
           change (active states, theme swap) eases instead of snapping */
        .sc-app, .sc-app * {
          transition: background-color 220ms ease, border-color 220ms ease, color 220ms ease, box-shadow 220ms ease;
        }

        .sc-btn { cursor: pointer; transition: background 120ms ease, transform 120ms ease, box-shadow 120ms ease; }
        .sc-btn:hover { background: var(--subtle); }
        .sc-btn:active { transform: scale(0.96); }

        /* sidebar nav items (Ring/Day/Week/Month/Year, Settings): icon nudges
           up and grows slightly, a left accent bar grows in, and the whole
           row shifts right a touch — like the row is leaning toward you */
        .sc-nav-btn { position: relative; overflow: hidden; }
        .sc-nav-btn::before {
          content: ""; position: absolute; left: 0; top: 50%; width: 3px; height: 0;
          background: currentColor; border-radius: 0 3px 3px 0; transform: translateY(-50%);
          transition: height 220ms cubic-bezier(.22,1,.36,1);
        }
        .sc-nav-btn:hover::before { height: 55%; }
        .sc-nav-btn.sc-nav-active::before { height: 68%; }
        .sc-nav-btn svg { transition: transform 220ms cubic-bezier(.22,1,.36,1); }
        .sc-nav-btn:hover svg { transform: scale(1.15) translateY(-1px); }
        .sc-nav-btn:hover { transform: translateX(3px); }
        .sc-nav-btn:active { transform: translateX(3px) scale(0.96); }

        /* "New event" — the one bordered, emphasized action in the sidebar */
        .sc-primary-btn { transition: background 140ms ease, transform 160ms cubic-bezier(.22,1,.36,1), box-shadow 160ms ease, color 140ms ease; }
        .sc-primary-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.16); background: var(--ink); color: var(--bg); }
        .sc-primary-btn:active { transform: translateY(0) scale(0.97); }
        .sc-primary-btn svg { transition: transform 260ms cubic-bezier(.22,1,.36,1); }
        .sc-primary-btn:hover svg { transform: rotate(90deg); }

        /* Today — lifts off the page like a real button being pressed */
        .sc-today-btn { transition: background 120ms ease, transform 160ms cubic-bezier(.22,1,.36,1), box-shadow 160ms ease, border-color 160ms ease; }
        .sc-today-btn:hover { transform: translateY(-1px); box-shadow: 0 3px 10px rgba(0,0,0,0.12); border-color: var(--ink); }
        .sc-today-btn:active { transform: translateY(0) scale(0.95); }

        /* generic icon-only buttons (chevrons, theme toggle, close) */
        .sc-icon-btn svg { transition: transform 200ms cubic-bezier(.22,1,.36,1); }
        .sc-icon-btn:hover svg { transform: scale(1.18); }
        .sc-chev-left:hover svg { transform: translateX(-2px) scale(1.15); }
        .sc-chev-right:hover svg { transform: translateX(2px) scale(1.15); }
        .sc-theme-toggle:hover svg { transform: rotate(20deg) scale(1.15); }
        .sc-close-btn:hover svg { transform: rotate(90deg) scale(1.1); }
        .sc-close-btn:hover { background: rgba(229,57,53,0.1); }

        .sc-cell { cursor: pointer; transition: background 120ms ease; }
        .sc-cell:hover { background: var(--subtle); }

        .sc-block { transition: top 420ms cubic-bezier(.22,1,.36,1), left 420ms cubic-bezier(.22,1,.36,1), box-shadow 150ms ease, transform 150ms ease; }
        .sc-block:hover { box-shadow: 0 4px 14px rgba(0,0,0,0.12); transform: translateY(-1px); z-index: 5; }

        .sc-salah-block { transition: box-shadow 150ms ease, transform 150ms ease, filter 150ms ease; }
        .sc-salah-block:hover { box-shadow: 0 4px 14px rgba(0,0,0,0.10); transform: translateY(-1px); filter: brightness(1.04); }
        .sc-salah-block:active { transform: translateY(0) scale(0.99); }

        .sc-bracket { transition: opacity 150ms ease, filter 150ms ease; }
        .sc-bracket:hover { filter: brightness(1.15); }

        .sc-flash { animation: scFlash 900ms ease; }
        @keyframes scFlash { 0% { box-shadow: 0 0 0 1.5px var(--ink); } 100% { box-shadow: 0 0 0 0px transparent; } }

        .sc-fade { animation: scFade 220ms cubic-bezier(.22,1,.36,1) both; }
        @keyframes scFade { from { opacity:0; transform: translateY(4px);} to {opacity:1; transform:none;} }

        .sc-modal-pop { animation: scModalPop 240ms cubic-bezier(.22,1,.36,1) both; }
        @keyframes scModalPop { from { opacity:0; transform: translateY(6px) scale(0.97); } to { opacity:1; transform:none; } }

        .sc-drawer-slide { animation: scDrawerSlide 260ms cubic-bezier(.22,1,.36,1) both; }
        @keyframes scDrawerSlide { from { opacity:0; transform: translateX(16px); } to { opacity:1; transform:none; } }

        .sc-overlay-fade { animation: scOverlayFade 180ms ease both; }
        @keyframes scOverlayFade { from { opacity:0; } to { opacity:1; } }

        .sc-view-enter { animation: scViewEnter 260ms cubic-bezier(.22,1,.36,1) both; }
        @keyframes scViewEnter { from { opacity:0; transform: translateY(6px); } to { opacity:1; transform:none; } }

        .sc-now-pulse { transform-box: fill-box; transform-origin: center; animation: scNowPulse 2.4s ease-out infinite; }
        @keyframes scNowPulse { 0% { transform: scale(1); opacity: 0.35; } 70% { transform: scale(2.8); opacity: 0; } 100% { opacity: 0; } }

        input, select, textarea { font-family: 'Inter', sans-serif; }
        input[type="time"]::-webkit-calendar-picker-indicator, input[type="date"]::-webkit-calendar-picker-indicator { opacity: 0.5; cursor: pointer; }
        input[type="time"]::-webkit-datetime-edit, input[type="date"]::-webkit-datetime-edit { flex: 0 1 auto; text-align: left; padding: 0; }
        input[type="time"]::-webkit-datetime-edit-fields-wrapper, input[type="date"]::-webkit-datetime-edit-fields-wrapper { display: flex; }

        /* only rendered at all when isMobile (see JSX) — dims the calendar
           behind the overlaid sidebar and closes it on tap */
        .sc-sidebar-backdrop {
          position: fixed; inset: 0; z-index: 39;
          background: rgba(17,17,17,0.32);
        }

        .sc-ring-canvas { width: min(500px, 88vw); height: min(500px, 88vw); }

        @media (max-width: 860px) {
          input, select, textarea { font-size: 16px !important; }
          .sc-topbar { flex-wrap: wrap; row-gap: 8px; padding: 10px 12px !important; }
          .sc-legend { justify-content: flex-start; max-width: 100% !important; gap: 10px !important; }
          .sc-modal { width: auto !important; max-width: calc(100vw - 32px); }
          .sc-dt-row { flex-direction: column !important; flex-wrap: nowrap !important; }
          .sc-dt-field { flex: 1 1 auto !important; width: 100% !important; }
          .sc-drawer { width: 100vw !important; max-width: 100vw; overflow-x: hidden !important; }
          .sc-settings-row { flex-wrap: wrap !important; row-gap: 6px !important; }
          .sc-week-outer { -webkit-overflow-scrolling: touch; }
          .sc-ring-wrap { flex-direction: column !important; gap: 14px !important; padding: 14px !important; }
          .sc-ring-canvas { width: min(420px, 90vw); height: min(420px, 90vw); }
          .sc-month-day-num { font-size: 11px !important; width: 18px !important; height: 18px !important; }
          .sc-month-cell { padding: 4px !important; }
          .sc-month-event { font-size: 10px !important; padding: 1px 4px !important; }
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important; scroll-behavior: auto !important;
          }
        }
      `}</style>

      {/* backdrop — only exists on narrow screens, where the sidebar has to
          overlay the calendar instead of pushing it (no room for both).
          Tapping it closes the panel. On wide screens the sidebar pushes the
          main content over instead, so there's nothing to dim or block. */}
      {isMobile && sidebarOpen && <div className="sc-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      {/* ---------- sidebar ---------- */}
      <div
        className="sc-sidebar"
        style={
          isMobile
            ? { ...S.sidebar, ...S.sidebarMobile, transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)" }
            : { ...S.sidebar, width: sidebarOpen ? 210 : 0, borderRightWidth: sidebarOpen ? 1 : 0 }
        }
      >
        <div style={S.sidebarInner}>
          <div style={S.brand}>
            <img src={qamuWordmark} alt="QAMU" style={S.brandLockup} />
            <button
              className="sc-btn sc-icon-btn sc-close-btn"
              style={{ ...S.iconOnlyBtn, marginLeft: "auto", flexShrink: 0 }}
              onClick={() => setSidebarOpen(false)}
              aria-label="Close panel"
            >
              <Icon.X width={15} height={15} />
            </button>
          </div>

          <div style={S.navGroup}>
            {[
              ["ring", "Ring", Icon.Ring],
              ["day", "Day", Icon.Day],
              ["week", "Week", Icon.Week],
              ["month", "Month", Icon.Month],
              ["year", "Year", Icon.Year],
            ].map(([key, label, IconC]) => (
              <button
                key={key}
                className={`sc-btn sc-nav-btn ${view === key ? "sc-nav-active" : ""}`}
                style={{ ...S.navBtn, ...(view === key ? S.navBtnActive : {}) }}
                onClick={() => {
                  setView(key);
                  if (isMobile) setSidebarOpen(false);
                }}
              >
                <IconC width={15} height={15} />
                {label}
              </button>
            ))}
          </div>

          <button
            className="sc-btn sc-nav-btn"
            style={S.navBtn}
            onClick={() => {
              setShowSettings((v) => !v);
              if (isMobile) setSidebarOpen(false);
            }}
          >
            <Icon.Settings width={15} height={15} />
            Settings
          </button>

          <button
            className="sc-btn sc-primary-btn"
            style={{ ...S.navBtn, marginTop: "auto", border: "1px solid var(--ink)", justifyContent: "center" }}
            onClick={() => {
              setModal({ date: cursor });
              if (isMobile) setSidebarOpen(false);
            }}
          >
            <Icon.Plus width={14} height={14} />
            New event
          </button>
        </div>
      </div>

      {/* ---------- main ---------- */}
      <div style={S.main}>
        <div style={S.topbar} className="sc-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              className="sc-btn sc-icon-btn"
              style={S.iconOnlyBtn}
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label={sidebarOpen ? "Hide panel" : "Show panel"}
              title={sidebarOpen ? "Hide panel" : "Show panel"}
            >
              <Icon.Menu width={16} height={16} />
            </button>
            {!sidebarOpen && <img src={qamuIcon} alt="" style={S.topbarMark} />}
            <button className="sc-btn sc-icon-btn sc-chev-left" style={S.iconOnlyBtn} onClick={() => nav(-1)} aria-label="Previous"><Icon.ChevL width={16} height={16} /></button>
            <button className="sc-btn sc-icon-btn sc-chev-right" style={S.iconOnlyBtn} onClick={() => nav(1)} aria-label="Next"><Icon.ChevR width={16} height={16} /></button>
            <div style={S.periodLabel}>
              {view === "year" && cursor.getFullYear()}
              {view === "month" && `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`}
              {view === "week" && weekLabel(cursor)}
              {(view === "day" || view === "ring") && dayLabel(cursor)}
            </div>
            <button className="sc-btn sc-today-btn" style={S.todayBtn} onClick={goToday}>Today</button>
            <button
              className="sc-btn sc-icon-btn sc-theme-toggle"
              style={S.iconOnlyBtn}
              onClick={() => setDarkMode((v) => !v)}
              aria-label="Toggle dark mode"
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {darkMode ? <Icon.Sun width={15} height={15} /> : <Icon.Moon width={15} height={15} />}
            </button>
          </div>
          <div style={S.legend} className="sc-legend">
            <span style={S.legendItem} title={`The prayer's exact time block, colored per prayer — ${activeOrder.map((k) => activeLabel[k]).join(", ")}`}>
              <i style={{ ...S.legendSwatchSalah, backgroundImage: salahBandsCss(activeOrder) }} />{religion === "judaism" ? "Tefillah" : "Salah"}
            </span>
            {(view === "day" || view === "week" || view === "ring") && (
              <>
                <span style={S.legendItem} title={`Prayer window, colored per prayer — ${activeOrder.map((k) => activeLabel[k]).join(", ")}`}>
                  <i style={{ ...S.legendSwatchWindow, backgroundImage: salahBandsCss(activeOrder) }} />Prayer window
                </span>
                {hasProhibited && (
                  <span style={S.legendItem} title="Approximate — times traditionally treated as discouraged for prayer (just after sunrise, around solar noon, just before sunset)">
                    <i style={S.legendSwatchProhibited} />Discouraged
                  </span>
                )}
              </>
            )}
            <span style={S.legendItem}><i style={S.legendSwatchFixed} />Fixed</span>
            <span style={S.legendItem}><i style={S.legendSwatchMovable} />Movable</span>
          </div>
        </div>

        <div key={view} className="sc-view-enter" style={S.viewFrame}>
          {view === "ring" && (
            <RingView
              cursor={cursor}
              tasks={tasks}
              salahBlocksForDate={salahBlocksForDate}
              salahWindowsForDate={salahWindowsForDate}
              prohibitedWindowsForDate={prohibitedWindowsForDate}
              religion={religion}
              onEditTask={(t) => setModal({ editing: t })}
              onViewSalah={(date, block, win) => setSalahDetail({ date, block, win })}
              use24h={use24h}
            />
          )}
          {view === "year" && (
            <YearView
              cursor={cursor}
              tasks={tasks}
              onPickMonth={(d) => { setCursor(d); setView("month"); }}
            />
          )}
          {view === "month" && (
            <MonthView
              cursor={cursor}
              tasks={tasks}
              onPickDay={(d) => { setCursor(d); setView("day"); }}
              onAddOnDay={(d) => setModal({ date: d })}
              use24h={use24h}
            />
          )}
          {view === "week" && (
            <TimelineView
              dates={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i))}
              tasks={tasks}
              salahBlocksForDate={salahBlocksForDate}
              salahWindowsForDate={salahWindowsForDate}
              prohibitedWindowsForDate={prohibitedWindowsForDate}
              activeOrder={activeOrder}
              activeLabel={activeLabel}
              onEditTask={(t) => setModal({ editing: t })}
              onViewSalah={(date, block, win) => setSalahDetail({ date, block, win })}
              onAddAt={(date, startMin, durMin) => setModal({ date, start: startMin, dur: durMin })}
              onPickDate={(d) => { setCursor(d); setView("day"); }}
              lastNotes={lastNotes}
              setLastNotes={setLastNotes}
              use24h={use24h}
              isMobile={isMobile}
            />
          )}
          {view === "day" && (
            <TimelineView
              dates={[cursor]}
              tasks={tasks}
              salahBlocksForDate={salahBlocksForDate}
              salahWindowsForDate={salahWindowsForDate}
              prohibitedWindowsForDate={prohibitedWindowsForDate}
              activeOrder={activeOrder}
              activeLabel={activeLabel}
              onEditTask={(t) => setModal({ editing: t })}
              onViewSalah={(date, block, win) => setSalahDetail({ date, block, win })}
              onAddAt={(date, startMin, durMin) => setModal({ date, start: startMin, dur: durMin })}
              lastNotes={lastNotes}
              setLastNotes={setLastNotes}
              use24h={use24h}
              isMobile={isMobile}
            />
          )}
        </div>
      </div>

      {/* ---------- settings drawer ---------- */}
      {showSettings && (
        <div style={S.drawerOverlay} className="sc-overlay-fade" onClick={() => setShowSettings(false)}>
          <div style={S.drawer} onClick={(e) => e.stopPropagation()} className="sc-drawer-slide sc-drawer">
            <div style={S.drawerHead}>
              <div style={S.drawerTitle}>Settings</div>
              <button className="sc-btn sc-icon-btn sc-close-btn" style={S.iconOnlyBtn} onClick={() => setShowSettings(false)}><Icon.X width={16} height={16} /></button>
            </div>

            {user && (
              <>
                <div style={S.sectionLabel}>Account</div>
                <div className="sc-settings-row" style={{ ...S.settingsRow, justifyContent: "space-between" }}>
                  <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name || user.email}</span>
                    <span style={{ fontSize: 11, color: "#8a8a86" }}>{user.email}</span>
                  </div>
                  <button className="sc-btn" style={S.textBtn} onClick={onLogout}>Sign out</button>
                </div>
              </>
            )}

            <div style={S.sectionLabel}>Appearance</div>
            <div style={S.segmented}>
              <button className="sc-btn" style={{ ...S.segBtn, ...(!darkMode ? S.segBtnActive : {}) }} onClick={() => setDarkMode(false)}>
                Light
              </button>
              <button className="sc-btn" style={{ ...S.segBtn, ...(darkMode ? S.segBtnActive : {}) }} onClick={() => setDarkMode(true)}>
                Dark
              </button>
            </div>

            <div style={S.sectionLabel}>Time format</div>
            <div style={S.segmented}>
              <button className="sc-btn" style={{ ...S.segBtn, ...(!use24h ? S.segBtnActive : {}) }} onClick={() => setUse24h(false)}>
                12-hour
              </button>
              <button className="sc-btn" style={{ ...S.segBtn, ...(use24h ? S.segBtnActive : {}) }} onClick={() => setUse24h(true)}>
                24-hour
              </button>
            </div>

            <div style={S.sectionLabel}>Calendar</div>
            <div style={S.segmented}>
              <button className="sc-btn" style={{ ...S.segBtn, ...(religion !== "judaism" ? S.segBtnActive : {}) }} onClick={() => setReligion("islam")}>
                Islam
              </button>
              <button className="sc-btn" style={{ ...S.segBtn, ...(religion === "judaism" ? S.segBtnActive : {}) }} onClick={() => setReligion("judaism")}>
                Judaism
              </button>
            </div>

            <div style={S.sectionLabel}>Prayer time source</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="sc-btn" style={{ ...S.darkBtn, justifyContent: "center", width: "100%" }} onClick={detectLocation}>
                <Icon.Locate width={13} height={13} />
                {locStatus === "locating" ? "Locating…" : "Detect my location"}
              </button>
              {locationMode === "coords" && coords && (
                <div style={S.statusOk}>Using {coords.lat}, {coords.lng}</div>
              )}
              {locStatus === "error" && <div style={S.statusErr}>Couldn't get your location. Check your browser's location permission and try again.</div>}

              {religion !== "judaism" && (
                <div className="sc-settings-row" style={S.settingsRow}>
                  <div style={S.settingsLabel}>Method</div>
                  <select style={{ ...S.input, marginLeft: "auto", minWidth: 0 }} value={method} onChange={(e) => { setMethod(Number(e.target.value)); setTimesByDate({}); }}>
                    {CALC_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              )}

              {locationMode !== "manual" && fetchStatus === "ok" && (
                <div style={S.statusOk}>Prayer times are live from {religion === "judaism" ? "Hebcal" : "AlAdhan"} for your location.</div>
              )}
              {locationMode !== "manual" && fetchStatus === "error" && <div style={S.statusErr}>Couldn't fetch times — showing manual defaults below instead.</div>}
              {locationMode === "manual" && (
                <div style={S.hint}>No location set yet — using the manual times below for every day. Detect your location to pull real daily times from {religion === "judaism" ? "Hebcal" : "AlAdhan"}.</div>
              )}
              {religion === "judaism" && (
                <div style={S.hint}>
                  Zmanim times courtesy of <a href="https://www.hebcal.com" target="_blank" rel="noreferrer" style={{ color: "inherit" }}>Hebcal.com</a>, licensed under{" "}
                  <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer" style={{ color: "inherit" }}>CC BY 4.0</a>.
                </div>
              )}
            </div>

            <div style={S.sectionLabel}>Manual times {locationMode !== "manual" ? "(fallback)" : ""} and window length</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {activeOrder.map((key) => (
                <div key={key} className="sc-settings-row" style={S.settingsRow}>
                  <div style={S.settingsLabel}>{activeLabel[key]}</div>
                  <input type="time" value={salahTimes[key]} onChange={(e) => setSalahTimes((s) => ({ ...s, [key]: e.target.value }))} style={{ ...S.timeInput, colorScheme: darkMode ? "dark" : "light" }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                    <input
                      type="number" min={5} max={120}
                      value={durations[key]}
                      onChange={(e) => setDurations((d) => ({ ...d, [key]: Math.max(5, Number(e.target.value) || 0) }))}
                      style={S.numInput}
                    />
                    <span style={S.durUnit}>min</span>
                  </div>
                </div>
              ))}
              {religion !== "judaism" && (
                <div className="sc-settings-row" style={S.settingsRow}>
                  <div style={S.settingsLabel}>Sunrise</div>
                  <input
                    type="time"
                    value={sunrise}
                    onChange={(e) => setSunrise(e.target.value)}
                    style={{ ...S.timeInput, colorScheme: darkMode ? "dark" : "light" }}
                  />
                  <span style={{ ...S.durUnit, marginLeft: "auto" }}>ends Fajr's window</span>
                </div>
              )}
            </div>
            <p style={S.hint}>
              {religion === "judaism"
                ? (locationMode !== "manual"
                    ? "Shacharit, Mincha, and Maariv windows are pulled from Hebcal automatically; the times above are only used as a fallback."
                    : "Each window runs until the next one starts, so these times only set where each window begins.")
                : (locationMode !== "manual"
                    ? "Sunrise is pulled from AlAdhan automatically; the time above is only used as a fallback."
                    : "Used to shade the Fajr prayer window on the calendar and mark the post-sunrise discouraged time.")}
            </p>
          </div>
        </div>
      )}

      {/* ---------- event modal ---------- */}
      {modal && (
        <EventModal
          data={modal}
          onClose={() => setModal(null)}
          onSave={addOrUpdateTask}
          onDelete={removeTask}
          darkMode={darkMode}
        />
      )}

      {/* ---------- salah detail (read-only) ---------- */}
      {salahDetail && (
        <SalahDetailModal
          data={salahDetail}
          onClose={() => setSalahDetail(null)}
          use24h={use24h}
        />
      )}
    </div>
  );
}

// One-time picker shown after sign-in until a religion is chosen. The choice
// is persisted through the same settings kv blob as everything else (see the
// storage effects above) — this component itself has no storage logic.
function ReligionPicker({ darkMode, onPick }) {
  const theme = darkMode ? THEME_DARK : THEME_LIGHT;
  return (
    <div style={{ ...styles_rp.screen, ...theme }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        html, body, #root { height: 100%; margin: 0; overscroll-behavior: none; background: ${darkMode ? "#18181B" : "#FFFFFF"}; }
      `}</style>
      <div style={styles_rp.card}>
        <div style={styles_rp.title}>Which calendar would you like?</div>
        <div style={styles_rp.subtitle}>This sets which prayer schedule shows up — you can change it later in Settings.</div>
        <button className="sc-btn" style={styles_rp.optionBtn} onClick={() => onPick("islam")}>
          <div style={styles_rp.optionTitle}>Islam</div>
          <div style={styles_rp.optionDesc}>Fajr, Dhuhr, Asr, Maghrib, Isha — via AlAdhan</div>
        </button>
        <button className="sc-btn" style={styles_rp.optionBtn} onClick={() => onPick("judaism")}>
          <div style={styles_rp.optionTitle}>Judaism</div>
          <div style={styles_rp.optionDesc}>Shacharit, Mincha, Maariv — via Hebcal.com</div>
        </button>
      </div>
    </div>
  );
}
const styles_rp = {
  screen: {
    width: "100vw", height: "100dvh", minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center",
    background: "var(--bg)", color: "var(--ink)", fontFamily: "'Inter', system-ui, -apple-system, sans-serif", padding: 20, boxSizing: "border-box",
  },
  card: {
    width: "min(360px, 100%)", padding: "32px 28px", borderRadius: 16, border: "1px solid var(--hairline)",
    background: "var(--surface)", display: "flex", flexDirection: "column", gap: 10, boxSizing: "border-box",
  },
  title: { fontSize: 17, fontWeight: 600, textAlign: "center" },
  subtitle: { fontSize: 12.5, color: "var(--muted)", textAlign: "center", lineHeight: 1.5, marginBottom: 10 },
  optionBtn: {
    display: "flex", flexDirection: "column", gap: 3, textAlign: "left", padding: "14px 16px", borderRadius: 10,
    border: "1px solid var(--hairline)", background: "transparent", color: "var(--ink)", fontFamily: "inherit",
  },
  optionTitle: { fontSize: 14.5, fontWeight: 600 },
  optionDesc: { fontSize: 12, color: "var(--muted)" },
};

function weekLabel(cursor) {
  const start = startOfWeek(cursor);
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  if (sameMonth) return `${MONTHS[start.getMonth()]} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`;
  return `${MONTHS[start.getMonth()].slice(0, 3)} ${start.getDate()} – ${MONTHS[end.getMonth()].slice(0, 3)} ${end.getDate()}, ${end.getFullYear()}`;
}

function dayLabel(cursor) {
  return `${WEEKDAYS[cursor.getDay()]}, ${MONTHS[cursor.getMonth()].slice(0, 3)} ${cursor.getDate()}, ${cursor.getFullYear()}`;
}

// Fits a label inside the ring's empty center by shrinking its font size down
// to a floor, then truncating with an ellipsis if it's still too wide at that
// floor — so long event/salah/window titles never spill out past the inner
// ring's stroke instead of staying contained within it.
function fitCenterText(text, maxWidth, baseSize, minSize) {
  const avgCharW = 0.56; // rough average glyph width as a fraction of font-size, for Inter
  let fontSize = baseSize;
  const naturalWidth = text.length * avgCharW * fontSize;
  if (naturalWidth > maxWidth) {
    fontSize = Math.max(minSize, maxWidth / (text.length * avgCharW));
  }
  let displayText = text;
  if (fontSize <= minSize + 0.01) {
    const maxChars = Math.max(3, Math.floor(maxWidth / (avgCharW * fontSize)));
    if (text.length > maxChars) displayText = `${text.slice(0, Math.max(1, maxChars - 1))}…`;
  }
  return { fontSize, text: displayText };
}

// ============================================================
// Year view
// ============================================================
function YearView({ cursor, tasks, onPickMonth }) {
  const year = cursor.getFullYear();
  return (
    <div style={S.yearGrid} className="sc-scroll">
      {MONTHS.map((name, mIdx) => {
        const first = new Date(year, mIdx, 1);
        const numDays = daysInMonth(first);
        const startPad = first.getDay();
        const cells = [];
        for (let i = 0; i < startPad; i++) cells.push(null);
        for (let d = 1; d <= numDays; d++) cells.push(d);

        return (
          <div key={mIdx} style={S.miniMonth} className="sc-cell" onClick={() => onPickMonth(new Date(year, mIdx, 1))}>
            <div style={S.miniMonthTitle}>{name}</div>
            <div style={S.miniWeekRow}>
              {WEEKDAYS.map((w) => <span key={w} style={S.miniWeekday}>{w[0]}</span>)}
            </div>
            <div style={S.miniGrid}>
              {cells.map((d, i) => {
                if (d === null) return <span key={i} />;
                const date = new Date(year, mIdx, d);
                const isToday = sameDay(date, new Date());
                const hasEvents = tasks.some((t) => occursOnDate(t, date));
                return (
                  <span key={i} style={{ ...S.miniDay, ...(isToday ? S.miniDayToday : {}) }}>
                    {d}
                    {hasEvents && <i style={S.miniDot} />}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Month view
// ============================================================
function MonthView({ cursor, tasks, onPickDay, onAddOnDay, use24h }) {
  const fmtT = use24h ? fmt24 : fmt12;
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const numDays = daysInMonth(first);
  const startPad = first.getDay();
  const totalCells = Math.ceil((startPad + numDays) / 7) * 7;

  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startPad + 1;
    if (dayNum < 1 || dayNum > numDays) {
      cells.push(null);
    } else {
      cells.push(new Date(year, month, dayNum));
    }
  }

  return (
    <div style={S.monthWrap}>
      <div style={S.monthWeekRow}>
        {WEEKDAYS.map((w) => <div key={w} style={S.monthWeekday}>{w}</div>)}
      </div>
      <div style={S.monthGrid}>
        {cells.map((date, i) => {
          if (!date) return <div key={i} style={S.monthCellEmpty} />;
          const isToday = sameDay(date, new Date());
          const dayEvents = tasks.filter((t) => occursOnDate(t, date)).sort((a, b) => a.start - b.start);
          return (
            <div key={i} className="sc-cell sc-month-cell" style={S.monthCell} onClick={() => onPickDay(date)}>
              <div style={S.monthCellHead}>
                <span className="sc-month-day-num" style={{ ...S.monthDayNum, ...(isToday ? S.monthDayNumToday : {}) }}>{date.getDate()}</span>
                <button
                  className="sc-btn"
                  style={S.monthAddBtn}
                  onClick={(e) => { e.stopPropagation(); onAddOnDay(date); }}
                  aria-label="Add event"
                >
                  <Icon.Plus width={11} height={11} />
                </button>
              </div>
              <div style={S.monthEvents}>
                {dayEvents.slice(0, 3).map((t) => (
                  <div
                    key={t.id}
                    className="sc-month-event"
                    style={{
                      ...S.monthEventChip,
                      background: t.color || DEFAULT_EVENT_COLOR,
                      color: "#fff",
                      border: t.movable ? "1px dashed rgba(255,255,255,0.7)" : "1px solid rgba(255,255,255,0.85)",
                    }}
                  >
                    {t.repeat !== "none" && <Icon.Repeat width={9} height={9} style={{ marginRight: 3, flexShrink: 0 }} />}
                    <span style={S.monthEventText}>{fmtT(t.start)} {t.title}</span>
                  </div>
                ))}
                {dayEvents.length > 3 && <div style={S.monthMore}>+{dayEvents.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Timeline view (Day = 1 column, Week = 7 columns) with salah reflow
// ============================================================
function TimelineView({ dates, tasks, salahBlocksForDate, salahWindowsForDate, prohibitedWindowsForDate, activeOrder, activeLabel, onEditTask, onViewSalah, onAddAt, onPickDate, lastNotes, setLastNotes, use24h, isMobile }) {
  const fmtT = use24h ? fmt24 : fmt12;
  const isSingleDay = dates.length === 1;
  const colRefs = useRef({});
  const dragRef = useRef(null); // { key, date, startMin, curMin }
  const [dragVisual, setDragVisual] = useState(null); // { key, startMin, curMin }
  const [hover, setHover] = useState(null); // { key, min }

  function minuteFromEvent(e, colEl) {
    const rect = colEl.getBoundingClientRect();
    const y = e.clientY - rect.top;
    let m = DAY_START + Math.round(y / PX_PER_MIN / 15) * 15;
    return Math.max(DAY_START, Math.min(DAY_END, m));
  }

  useEffect(() => {
    function handleMove(e) {
      if (!dragRef.current) return;
      const el = colRefs.current[dragRef.current.key];
      if (!el) return;
      const m = minuteFromEvent(e, el);
      dragRef.current.curMin = m;
      setDragVisual({ key: dragRef.current.key, startMin: dragRef.current.startMin, curMin: m });
    }
    function handleUp() {
      const d = dragRef.current;
      if (!d) return;
      let start = Math.min(d.startMin, d.curMin);
      let end = Math.max(d.startMin, d.curMin);
      if (end - start < 15) end = start + 30; // plain tap/click -> default 30-min event
      dragRef.current = null;
      setDragVisual(null);
      onAddAt(d.date, start, end - start);
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onAddAt]);

  const dayData = useMemo(() => {
    return dates.map((d) => {
      const dayTasks = instancesForDate(tasks, d);
      const blocks = salahBlocksForDate(d);
      const windows = salahWindowsForDate(d);
      const prohibited = prohibitedWindowsForDate(d);
      // The last prayer of the day (Isha for Islam, Maariv for Judaism) can
      // run past midnight into halachic/Islamic midnight. Clamp each
      // window's rendered height to the visible day, then carry yesterday's
      // overflow in as a short strip at the very top of today so the
      // extension is visible. `realEnd` keeps the true, unclamped end time
      // (which may read past 24:00) so labels can show the real end time
      // instead of a misleading flat "12:00am".
      const lastKey = activeOrder[activeOrder.length - 1];
      const prevLast = salahWindowsForDate(addDays(d, -1)).find((w) => w.key === lastKey);
      const overflow = prevLast ? prevLast.windowEnd - DAY_END : 0;
      const displayWindows = windows.map((w) => ({ ...w, realEnd: w.windowEnd, windowEnd: Math.min(w.windowEnd, DAY_END) }));
      if (overflow > 0) {
        displayWindows.unshift({ key: lastKey, label: activeLabel[lastKey], windowStart: DAY_START, windowEnd: DAY_START + overflow, realEnd: DAY_START + overflow, continued: true });
      }
      const { tasks: laidOut, notes } = reflow(dayTasks, blocks);
      return { date: d, tasks: laidOut, notes, blocks, windows: displayWindows, prohibited };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    JSON.stringify(tasks),
    dates.map(dateKey).join(","),
    dates.map((d) => JSON.stringify(salahBlocksForDate(d))).join("|"),
    dates.map((d) => JSON.stringify(salahWindowsForDate(d))).join("|"),
    dates.map((d) => JSON.stringify(salahWindowsForDate(addDays(d, -1)))).join("|"),
    dates.map((d) => JSON.stringify(prohibitedWindowsForDate(d))).join("|"),
  ]);

  useEffect(() => {
    const allNotes = dayData.flatMap((d) => d.notes);
    setLastNotes(allNotes);
  }, [JSON.stringify(dayData.map((d) => d.notes))]);

  const totalMin = DAY_END - DAY_START;
  const trackHeight = totalMin * PX_PER_MIN;
  const hourMarks = [];
  for (let m = DAY_START; m <= DAY_END; m += 60) hourMarks.push(m);

  const [nowMin, setNowMin] = useState(() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); });
  useEffect(() => {
    const iv = setInterval(() => {
      const n = new Date();
      setNowMin(n.getHours() * 60 + n.getMinutes());
    }, 30000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div style={S.weekWrap}>
      {lastNotes.length > 0 && (
        <div style={S.reasonBar} className="sc-fade" key={JSON.stringify(lastNotes)}>
          <span style={{ fontWeight: 500 }}>Adjusted for prayer times — </span>
          {lastNotes.slice(0, 3).map((n, i) => (
            <span key={i}>{n.title} moved to {fmtT(n.to)}{i < Math.min(lastNotes.length, 3) - 1 ? "; " : ""}</span>
          ))}
          {lastNotes.length > 3 && <span> and {lastNotes.length - 3} more.</span>}
        </div>
      )}

      <div className="sc-week-outer" style={{ flex: 1, minHeight: 0, overflowX: isMobile ? "hidden" : "auto", overflowY: "hidden", WebkitOverflowScrolling: "touch" }}>
      <div
        style={{
          display: "flex", flexDirection: "column", height: "100%",
          minWidth: isMobile ? "100%" : `calc(var(--week-timecol-w) + ${dates.length} * var(--week-daycol-w))`,
          width: isMobile ? "100%" : undefined,
        }}
      >
        <div style={S.weekGridHead}>
          <div style={S.weekTimeCol} />
          {dates.map((d, i) => (
            <div
              key={dateKey(d)}
              style={{ ...S.weekDayHead, ...(isMobile ? { minWidth: 0, flexBasis: 0 } : {}) }}
              className={!isSingleDay ? "sc-cell" : undefined}
              onClick={!isSingleDay ? () => onPickDate(d) : undefined}
            >
              <div style={S.weekDayName}>{isSingleDay ? WEEKDAYS[d.getDay()].toUpperCase() : WEEKDAYS[d.getDay()]}</div>
              <div style={{ ...S.weekDayNum, ...(sameDay(d, new Date()) ? S.weekDayNumToday : {}) }}>{d.getDate()}</div>
            </div>
          ))}
          {isMobile && <div style={{ width: 10, flexShrink: 0 }} />}
        </div>

        <div style={S.weekScroll} className="sc-scroll">
          <div style={{ position: "relative", height: trackHeight, display: "flex" }}>
            <div style={{ ...S.weekTimeCol, position: "relative" }}>
              {hourMarks.map((m) => (
                <span key={m} style={{ ...S.hourLabel, top: Math.max(0, (m - DAY_START) * PX_PER_MIN - 6) }}>{fmtT(m)}</span>
              ))}
            </div>

          {dayData.map(({ date, tasks: dayTasks, blocks, windows, prohibited }, dayIdx) => {
            const colKey = dateKey(date);
            return (
              <div
                key={colKey}
                ref={(el) => { colRefs.current[colKey] = el; }}
                style={{ ...S.dayCol, ...(isMobile ? { minWidth: 0, flexBasis: 0 } : {}), ...(dayIdx === dayData.length - 1 ? { borderRight: `1px solid ${HAIRLINE}` } : {}), cursor: "pointer" }}
                onPointerDown={(e) => {
                  if (!e.isPrimary) return;
                  if (e.target !== e.currentTarget) return;
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  const m = minuteFromEvent(e, e.currentTarget);
                  dragRef.current = { key: colKey, date, startMin: m, curMin: m };
                  setDragVisual({ key: colKey, startMin: m, curMin: m });
                }}
                onPointerMove={(e) => {
                  if (dragRef.current) return;
                  if (e.target !== e.currentTarget) { setHover((h) => (h && h.key === colKey ? null : h)); return; }
                  const m = minuteFromEvent(e, e.currentTarget);
                  setHover((h) => (h && h.key === colKey && h.min === m ? h : { key: colKey, min: m }));
                }}
                onPointerLeave={() => setHover((h) => (h && h.key === colKey ? null : h))}
              >
                {/* full salah windows (e.g. Fajr through sunrise), each in its own
                    color so adjacent windows never blend into one another */}
                {windows.map((w) => (
                  <div
                    key={`win-${w.key}${w.continued ? "-cont" : ""}`}
                    title={`${w.label}${w.continued ? " (continued from last night, past midnight)" : ""}`}
                    style={{
                      position: "absolute", left: 0, right: 0, pointerEvents: "none",
                      top: (w.windowStart - DAY_START) * PX_PER_MIN,
                      height: Math.max(0, w.windowEnd - w.windowStart) * PX_PER_MIN,
                      background: hexToRgba(SALAH_WINDOW_COLORS[w.key], 0.13),
                      borderTop: w.continued ? `1px dashed ${hexToRgba(SALAH_WINDOW_COLORS[w.key], 0.5)}` : "none",
                    }}
                  />
                ))}

                {/* traditionally discouraged prayer windows, in a distinct warm tone */}
                {prohibited.map((p) => {
                  const start = Math.max(DAY_START, p.start);
                  const end = Math.min(DAY_END, p.end);
                  if (end <= start) return null;
                  return (
                    <div
                      key={`proh-${p.key}`}
                      title={p.label}
                      style={{
                        position: "absolute", left: 0, right: 0, pointerEvents: "none",
                        top: (start - DAY_START) * PX_PER_MIN,
                        height: (end - start) * PX_PER_MIN,
                        background: hexToRgba(PROHIBITED_COLOR, 0.1),
                        backgroundImage: `repeating-linear-gradient(45deg, ${hexToRgba(PROHIBITED_COLOR, 0.28)} 0 4px, transparent 4px 8px)`,
                      }}
                    />
                  );
                })}

                {hourMarks.map((m) => (
                  <div key={m} style={{ ...S.hourLine, top: (m - DAY_START) * PX_PER_MIN }} />
                ))}

                {/* 15-min hover highlight */}
                {!dragVisual && hover?.key === colKey && (
                  <div
                    style={{
                      position: "absolute", left: 2, right: 2, pointerEvents: "none",
                      top: (hover.min - DAY_START) * PX_PER_MIN, height: 15 * PX_PER_MIN,
                      background: SUBTLE_BG, borderRadius: 4,
                    }}
                  />
                )}

                {/* drag-to-create selection */}
                {dragVisual && dragVisual.key === colKey && (
                  <div
                    style={{
                      position: "absolute", left: 2, right: 2, pointerEvents: "none",
                      top: (Math.min(dragVisual.startMin, dragVisual.curMin) - DAY_START) * PX_PER_MIN,
                      height: Math.max(15, Math.abs(dragVisual.curMin - dragVisual.startMin)) * PX_PER_MIN,
                      background: hexToRgba(DEFAULT_EVENT_COLOR, 0.16),
                      border: `1.5px dashed ${hexToRgba(DEFAULT_EVENT_COLOR, 0.6)}`,
                      borderRadius: 4,
                    }}
                  />
                )}

                {blocks.map((s) => (
                  <div
                    key={s.key}
                    className="sc-salah-block"
                    title={`View ${s.label} time`}
                    style={{
                      ...S.salahBlock,
                      top: (s.start - DAY_START) * PX_PER_MIN,
                      height: Math.max(18, s.dur * PX_PER_MIN),
                      background: hexToRgba(SALAH_WINDOW_COLORS[s.key], 0.16),
                      borderColor: hexToRgba(SALAH_WINDOW_COLORS[s.key], 0.7),
                      borderLeft: `3px solid ${SALAH_WINDOW_COLORS[s.key]}`,
                      cursor: "pointer",
                    }}
                    onClick={() => onViewSalah && onViewSalah(date, s, windows.find((w) => w.key === s.key))}
                  >
                    <span style={S.salahName}>{s.label}</span>
                  </div>
                ))}

                {dayTasks.map((t) => {
                  const wasMoved = lastNotes.some((n) => n.id === (t.occurrenceKey || t.id));
                  const color = t.color || DEFAULT_EVENT_COLOR;
                  const heightPx = Math.max(20, t.dur * PX_PER_MIN);
                  const isShort = heightPx < 34;
                  return (
                    <div
                      key={t.occurrenceKey || t.id}
                      className={`sc-block sc-cell ${wasMoved ? "sc-flash" : ""}`}
                      style={{
                        ...S.taskBlock,
                        top: (t.start - DAY_START) * PX_PER_MIN,
                        height: heightPx,
                        justifyContent: isShort ? "center" : "flex-start",
                        padding: isShort ? "0 7px" : "3px 7px",
                        background: hexToRgba(color, 0.14),
                        border: `1px ${t.movable ? "dashed" : "solid"} ${hexToRgba(color, 0.5)}`,
                        borderLeft: `3px solid ${color}`,
                      }}
                      onClick={() => onEditTask(t)}
                    >
                      {isShort ? (
                        <div style={{ ...S.taskTitleRow, minWidth: 0 }}>
                          {t.repeat !== "none" && <Icon.Repeat width={9} height={9} style={{ flexShrink: 0, opacity: 0.55 }} />}
                          <span style={{ ...S.taskTitle, minWidth: 0 }}>{t.title}</span>
                          <span style={{ ...S.taskTime, marginLeft: "auto", flexShrink: 0 }}>{fmtT(t.start)}</span>
                        </div>
                      ) : (
                        <>
                          <div style={S.taskTitleRow}>
                            {t.repeat !== "none" && <Icon.Repeat width={9} height={9} style={{ flexShrink: 0, opacity: 0.55 }} />}
                            <span style={S.taskTitle}>{t.title}</span>
                          </div>
                          <span style={S.taskTime}>{fmtT(t.start)}–{fmtT(t.start + t.dur)}</span>
                        </>
                      )}
                    </div>
                  );
                })}

                {sameDay(date, new Date()) && nowMin >= DAY_START && nowMin <= DAY_END && (
                  <div style={{ ...S.nowLine, top: (nowMin - DAY_START) * PX_PER_MIN }}>
                    <span style={S.nowDot} />
                  </div>
                )}
              </div>
            );
          })}
          {isMobile && <div style={{ width: 10, flexShrink: 0 }} />}

          {/* Day view only: scaling brackets in a single margin on the right side
              of the calendar (clear of the time labels on the left) tracing
              exactly which stretch of the day belongs to each salah window /
              prohibited window, color-matched to the shading in the column,
              with the exact from–to time span written out next to each bracket.
              Salah windows and prohibited windows share one merged, time-sorted
              lane rather than two separate columns. Isha's label uses the real
              (unclamped) end time, so it reads correctly even when the window
              runs past midnight, instead of always flattening to 12:00am. */}
          {isSingleDay && dayData[0] && (() => {
            const brackets = [
              ...dayData[0].windows.map((w) => ({
                id: `win-${w.key}${w.continued ? "-cont" : ""}`,
                type: "window",
                label: w.label,
                continued: w.continued,
                start: w.windowStart,
                end: w.windowEnd,
                realEnd: w.realEnd ?? w.windowEnd,
                color: SALAH_WINDOW_COLORS[w.key],
              })),
              ...dayData[0].prohibited
                .map((p) => ({
                  id: `proh-${p.key}`,
                  type: "prohibited",
                  label: p.label,
                  start: Math.max(DAY_START, p.start),
                  end: Math.min(DAY_END, p.end),
                  color: PROHIBITED_COLOR,
                }))
                .map((b) => ({ ...b, realEnd: b.end }))
                .filter((b) => b.end > b.start),
            ].sort((a, b) => a.start - b.start);

            // Two adjacent windows can sit close enough in time (e.g. Fajr
            // ending right as the post-Fajr Discouraged window begins) that
            // a vertically-centered label would spill into its neighbor's
            // space. Instead of centering each label independently, lay
            // them out in one pass, top to bottom, and push any label down
            // just enough to clear the one above it, so labels never overlap.
            const LABEL_H = 24; // approx. rendered height of the two-line label
            const LABEL_GAP = 3; // minimum breathing room between labels
            let prevLabelBottom = -Infinity;
            const placed = brackets.map((b) => {
              const top = (b.start - DAY_START) * PX_PER_MIN;
              const height = Math.max(3, (b.end - b.start) * PX_PER_MIN);
              let labelTop = top + height / 2 - LABEL_H / 2;
              if (labelTop < prevLabelBottom + LABEL_GAP) labelTop = prevLabelBottom + LABEL_GAP;
              prevLabelBottom = labelTop + LABEL_H;
              return { ...b, top, height, labelTop };
            });

            return (
              <div style={{ width: 122, flexShrink: 0, position: "relative" }}>
                {placed.map((b) => {
                  const isProhibited = b.type === "prohibited";
                  return (
                    <div
                      key={b.id}
                      title={`${isProhibited ? "Discouraged" : b.label}${b.continued ? " (continued past midnight)" : ""} — ${fmtT(b.start)}–${fmtT(b.realEnd)}`}
                      style={{ position: "absolute", left: 4, top: b.top, height: b.height, width: 112 }}
                    >
                      {!isProhibited && (
                        <div className="sc-bracket" style={{
                          position: "absolute", left: 0, top: 0, bottom: 0, width: 7,
                          borderRight: `2px solid ${b.color}`,
                          borderTop: `2px solid ${b.color}`,
                          borderBottom: `2px solid ${b.color}`,
                          borderTopRightRadius: 3, borderBottomRightRadius: 3,
                          opacity: 0.9,
                        }} />
                      )}
                      <div style={{
                        position: "absolute", left: 13, top: b.labelTop - b.top,
                        fontSize: 9.5, lineHeight: 1.3, color: b.color, whiteSpace: "nowrap",
                      }}>
                        <div style={{ fontWeight: 600 }}>{isProhibited ? "Discouraged" : b.label}{b.continued ? " ↩" : ""}</div>
                        <div style={{ opacity: 0.8, fontWeight: 400 }}>{fmtT(b.start)}–{fmtT(b.realEnd)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
        </div>
      </div>
      </div>
    </div>
  );
}

// ============================================================
// Ring view — the whole day laid out as a 24-hour color-coded ring
// ============================================================
function RingView({ cursor, tasks, salahBlocksForDate, salahWindowsForDate, prohibitedWindowsForDate, religion, onEditTask, onViewSalah, use24h }) {
  const fmtT = use24h ? fmt24 : fmt12;
  const kindLabel = religion === "judaism" ? "Tefillah" : "Salah";
  const [hovered, setHovered] = useState(null); // { key, title, start, dur, kind }
  const [nowMin, setNowMin] = useState(() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); });

  useEffect(() => {
    const iv = setInterval(() => {
      const n = new Date();
      setNowMin(n.getHours() * 60 + n.getMinutes());
    }, 30000);
    return () => clearInterval(iv);
  }, []);

  const dayTasksRaw = useMemo(() => instancesForDate(tasks, cursor), [JSON.stringify(tasks), dateKey(cursor)]);
  const blocks = useMemo(() => salahBlocksForDate(cursor), [dateKey(cursor)]);
  const windows = useMemo(() => salahWindowsForDate(cursor), [dateKey(cursor)]);
  const prohibited = useMemo(() => prohibitedWindowsForDate(cursor), [dateKey(cursor)]);
  const { tasks: dayTasks } = useMemo(() => reflow(dayTasksRaw, blocks), [JSON.stringify(dayTasksRaw), JSON.stringify(blocks)]);

  const size = 500;
  const cx = size / 2;
  const cy = size / 2;
  // Inner "events" ring — the tighter, clickable ring of non-salah events only.
  const ringR = 100;
  const ringWidth = 34;
  // Outer "salah" ring — larger, sits outside the events ring and holds
  // everything salah-related: continuous per-salah window shading, prohibited
  // windows, and the salah events themselves. All three layers are hoverable.
  const outerR = 165;
  const outerWidth = 40;
  const isToday = sameDay(cursor, new Date());

  const angleForMin = (min) => (min / 1440) * 360 - 90;
  const polar = (r, min) => {
    const a = (angleForMin(min) * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const hourTicks = Array.from({ length: 24 }, (_, h) => h * 60);

  // Legend combines both rings: salah events (outer) and non-salah events (inner).
  const legendItems = [
    ...blocks.map((s) => ({ key: `salah:${s.key}`, title: s.label, start: s.start, dur: s.dur, kind: kindLabel, color: SALAH_WINDOW_COLORS[s.key], isSalah: true, salahBlock: s })),
    ...dayTasks.map((t) => ({
      key: t.occurrenceKey || t.id, title: t.title, start: t.start, dur: t.dur,
      kind: t.movable ? "Movable" : "Fixed", color: t.color || DEFAULT_EVENT_COLOR, task: t,
    })),
  ].sort((a, b) => a.start - b.start);

  return (
    <div style={S.ringWrap} className="sc-ring-wrap">
      <div style={S.ringCanvasWrap} className="sc-ring-canvas">
        <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" style={{ maxWidth: 540, maxHeight: 540 }}>
          {/* All minute->angle arcs (dasharray-based) are drawn by native SVG
              circles starting at 3 o'clock (0deg) sweeping clockwise, but every
              other coordinate in this view (hour ticks, the now-line, labels)
              is placed with polar()/angleForMin(), which starts minute 0 at
              12 o'clock (-90deg). Without correcting for that 90deg gap, every
              salah window/tick/task arc renders 6 hours away from where its
              own hour-tick and the now-line actually are. Rotating just the
              arc layer -90deg around the center re-aligns the two coordinate
              systems so a salah block, its hour label, and "now" all agree. */}
          <g transform={`rotate(-90 ${cx} ${cy})`}>
          {/* ---------- outer salah ring: windows shaded, prohibited times, salah events ---------- */}
          <circle cx={cx} cy={cy} r={outerR} fill="none" style={{ stroke: HAIRLINE }} strokeWidth={outerWidth} />

          {/* continuous salah window shading, color-coded so Dhuhr–Isha never blend.
              Hoverable — shows exactly which stretch of the day the window covers,
              same as legend/inner-ring hover does for discrete items. */}
          {windows.map((w) => {
            const dur = Math.min(1440, w.windowEnd - w.windowStart);
            const key = `window:${w.key}`;
            const isHovered = hovered?.key === key;
            return (
              <circle
                key={`owin-${w.key}`}
                cx={cx} cy={cy} r={outerR}
                fill="none"
                style={{ stroke: SALAH_WINDOW_COLORS[w.key], cursor: "pointer", transition: "opacity 120ms ease, stroke-dashoffset 500ms cubic-bezier(.22,1,.36,1), stroke-dasharray 500ms cubic-bezier(.22,1,.36,1)" }}
                strokeWidth={outerWidth}
                strokeDasharray={`${dur} ${1440 - dur}`}
                strokeDashoffset={-w.windowStart}
                pathLength={1440}
                strokeLinecap="butt"
                opacity={isHovered ? 0.5 : 0.32}
                onMouseEnter={() => setHovered({ key, title: `${w.label} window`, start: w.windowStart, dur: w.windowEnd - w.windowStart, kind: "Prayer window" })}
                onMouseLeave={() => setHovered(null)}
              />
            );
          })}

          {/* prohibited windows, in their own warning tone, layered on top. Hoverable too. */}
          {prohibited.map((p) => {
            const start = Math.max(0, p.start);
            const end = Math.min(1440, p.end);
            const dur = Math.max(0, end - start);
            if (dur <= 0) return null;
            const key = `prohibited:${p.key}`;
            const isHovered = hovered?.key === key;
            return (
              <circle
                key={`oproh-${p.key}`}
                cx={cx} cy={cy} r={outerR}
                fill="none"
                style={{ stroke: PROHIBITED_COLOR, cursor: "pointer", transition: "opacity 120ms ease, stroke-dashoffset 500ms cubic-bezier(.22,1,.36,1), stroke-dasharray 500ms cubic-bezier(.22,1,.36,1)" }}
                strokeWidth={outerWidth}
                strokeDasharray={`${dur} ${1440 - dur}`}
                strokeDashoffset={-start}
                pathLength={1440}
                strokeLinecap="butt"
                opacity={isHovered ? 0.75 : 0.55}
                onMouseEnter={() => setHovered({ key, title: p.label, start, dur, kind: "Discouraged" })}
                onMouseLeave={() => setHovered(null)}
              />
            );
          })}

          {/* the salah events themselves — bolder core within their window band.
              This is the outer ring's equivalent of the inner ring's clickable
              blocks: hover shows exactly when the salah is. */}
          {blocks.map((s) => {
            const key = `salah:${s.key}`;
            const isHovered = hovered?.key === key;
            return (
              <circle
                key={`otick-${s.key}`}
                cx={cx} cy={cy} r={outerR}
                fill="none"
                style={{ stroke: SALAH_WINDOW_COLORS[s.key], cursor: "pointer", transition: "stroke-width 120ms ease, stroke-dashoffset 500ms cubic-bezier(.22,1,.36,1), stroke-dasharray 500ms cubic-bezier(.22,1,.36,1)" }}
                strokeWidth={isHovered ? outerWidth * 0.42 + 8 : outerWidth * 0.42}
                strokeDasharray={`${s.dur} ${1440 - s.dur}`}
                strokeDashoffset={-s.start}
                pathLength={1440}
                strokeLinecap="butt"
                opacity={0.95}
                onMouseEnter={() => setHovered({ key, title: s.label, start: s.start, dur: s.dur, kind: kindLabel })}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onViewSalah && onViewSalah(cursor, s, windows.find((w) => w.key === s.key))}
              />
            );
          })}

          </g>

          {/* hour ticks + labels, outside everything */}
          {hourTicks.map((m) => {
            const inner = polar(outerR + outerWidth / 2 + 5, m);
            const outer = polar(outerR + outerWidth / 2 + 13, m);
            const label = polar(outerR + outerWidth / 2 + 28, m);
            const showLabel = m % 180 === 0;
            return (
              <g key={m}>
                <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} style={{ stroke: GRAY_TEXT }} strokeWidth={1} opacity={0.5} />
                {showLabel && (
                  <text x={label.x} y={label.y + 3} fontSize="10" textAnchor="middle" style={{ fill: GRAY_TEXT }} fontFamily="Inter, sans-serif">
                    {fmtT(m).replace(":00", "")}
                  </text>
                )}
              </g>
            );
          })}

          {/* ---------- inner activities ring: discrete, clickable non-salah events only ---------- */}
          <g transform={`rotate(-90 ${cx} ${cy})`}>
          <circle cx={cx} cy={cy} r={ringR} fill="none" style={{ stroke: HAIRLINE }} strokeWidth={ringWidth} />

          {dayTasks.map((t) => {
            const key = t.occurrenceKey || t.id;
            const color = t.color || DEFAULT_EVENT_COLOR;
            const isHovered = hovered?.key === key;
            return (
              <circle
                key={key}
                cx={cx} cy={cy} r={ringR}
                fill="none"
                style={{ stroke: color, cursor: "pointer", transition: "stroke-width 120ms ease, stroke-dashoffset 500ms cubic-bezier(.22,1,.36,1)" }}
                strokeWidth={isHovered ? ringWidth + 8 : ringWidth}
                strokeDasharray={`${Math.max(t.dur, 4)} ${1440 - Math.max(t.dur, 4)}`}
                strokeDashoffset={-t.start}
                pathLength={1440}
                strokeLinecap={t.dur < 20 ? "round" : "butt"}
                onMouseEnter={() => setHovered({ key, title: t.title, start: t.start, dur: t.dur, kind: t.movable ? "Movable" : "Fixed" })}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onEditTask(t)}
              />
            );
          })}
          </g>

          {/* now marker, spanning both rings — gently pulses and glides to its
              new position each time nowMin ticks forward, instead of jumping */}
          {isToday && (() => {
            const p1 = polar(ringR - ringWidth / 2 - 6, nowMin);
            const p2 = polar(outerR + outerWidth / 2 + 6, nowMin);
            const tip = polar(outerR + outerWidth / 2 + 6, nowMin);
            return (
              <g style={{ transition: "transform 600ms cubic-bezier(.22,1,.36,1)" }}>
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#E53935" strokeWidth={2} />
                <circle cx={tip.x} cy={tip.y} r={5} fill="#E53935" opacity={0.25} className="sc-now-pulse" />
                <circle cx={tip.x} cy={tip.y} r={2.5} fill="#E53935" />
              </g>
            );
          })()}

          {/* center label — sized to stay inside the inner ring's clear area,
              even for long event/window titles, rather than spilling onto the ring. */}
          {(() => {
            const innerClearR = ringR - ringWidth / 2 - 6;
            const maxTextWidth = innerClearR * 1.7;
            const titleText = hovered ? hovered.title : dayLabel(cursor).split(",").slice(0, 2).join(",");
            const subtitleText = hovered
              ? `${fmtT(hovered.start)} – ${fmtT(hovered.start + hovered.dur)} · ${hovered.kind}`
              : `${dayTasks.length} event${dayTasks.length === 1 ? "" : "s"} today`;
            const title = fitCenterText(titleText, maxTextWidth, 13, 9);
            const subtitle = fitCenterText(subtitleText, maxTextWidth, 11, 8);
            return (
              <>
                <text x={cx} y={cy - 6} textAnchor="middle" fontSize={title.fontSize} fontWeight="600" style={{ fill: BLACK }} fontFamily="Inter, sans-serif">
                  {title.text}
                </text>
                <text x={cx} y={cy + 12} textAnchor="middle" fontSize={subtitle.fontSize} style={{ fill: GRAY_TEXT }} fontFamily="Inter, sans-serif">
                  {subtitle.text}
                </text>
              </>
            );
          })()}
        </svg>
      </div>
      <div style={S.ringLegend}>
        <div style={S.sectionLabel}>Today</div>
        {legendItems.length === 0 && <div style={{ ...S.hint, marginTop: 0 }}>Nothing scheduled — enjoy the quiet.</div>}
        {legendItems.map((item) => (
          <div
            key={item.key}
            className="sc-cell"
            style={{ ...S.ringLegendRow, ...(hovered?.key === item.key ? S.ringLegendRowActive : {}), cursor: item.task || item.isSalah ? "pointer" : "default" }}
            onMouseEnter={() => setHovered({ key: item.key, title: item.title, start: item.start, dur: item.dur, kind: item.kind })}
            onMouseLeave={() => setHovered(null)}
            onClick={
              item.task
                ? () => onEditTask(item.task)
                : item.isSalah
                ? () => onViewSalah && onViewSalah(cursor, item.salahBlock, windows.find((w) => w.key === item.salahBlock.key))
                : undefined
            }
          >
            <i style={{ ...S.ringLegendDot, background: item.color }} />
            <span style={S.ringLegendTitle}>{item.title}</span>
            <span style={S.ringLegendTime}>{fmtT(item.start)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Event modal — add / edit with recurrence controls
// ============================================================
function EventModal({ data, onClose, onSave, onDelete, darkMode }) {
  const editing = data.editing || null;
  const baseDate = editing ? editing.date : dateKey(data.date || new Date());
  const baseStart = editing ? editing.start : (data.start ?? 9 * 60);

  const [title, setTitle] = useState(editing?.title || "");
  const [date, setDate] = useState(baseDate);
  const [time, setTime] = useState(minToHHMM(baseStart));
  const [dur, setDur] = useState(editing?.dur || data.dur || 30);
  const [movable, setMovable] = useState(editing ? editing.movable : true);
  const [repeat, setRepeat] = useState(editing?.repeat || "none");
  const [weekdays, setWeekdays] = useState(editing?.weekdays || []);
  const [repeatUntil, setRepeatUntil] = useState(editing?.repeatUntil || "");
  const [color, setColor] = useState(editing?.color || DEFAULT_EVENT_COLOR);
  const dateInputRef = useRef(null);
  const timeInputRef = useRef(null);
  function openPicker(ref) {
    if (!ref.current) return;
    if (typeof ref.current.showPicker === "function") { try { ref.current.showPicker(); return; } catch (e) {} }
    ref.current.focus();
  }
  function formatDateDisplay(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return "";
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  function formatTimeDisplay(hhmm) {
    if (!hhmm) return "";
    const [h, m] = hhmm.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return "";
    return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function minToHHMM(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function toggleWeekday(idx) {
    setWeekdays((w) => (w.includes(idx) ? w.filter((x) => x !== idx) : [...w, idx].sort()));
  }

  function handleSave() {
    if (!title.trim()) return;
    onSave({
      id: editing?.id,
      title: title.trim(),
      date,
      start: toMin(time),
      dur: Math.max(5, Number(dur) || 30),
      movable,
      repeat,
      weekdays: repeat === "weekly" ? weekdays : [],
      repeatUntil: repeat === "none" ? null : (repeatUntil || null),
      color,
    });
  }

  return (
    <div style={S.modalOverlay} className="sc-overlay-fade" onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()} className="sc-fade sc-modal-pop sc-modal">
        <div style={S.modalHead}>
          <div style={S.modalTitle}>{editing ? "Edit event" : "New event"}</div>
          <button className="sc-btn sc-icon-btn sc-close-btn" style={S.iconOnlyBtn} onClick={onClose}><Icon.X width={16} height={16} /></button>
        </div>

        <label style={S.fieldLabel}>Title</label>
        <input style={S.input} autoFocus={typeof window !== "undefined" && window.innerWidth > 860} placeholder="Name this event" value={title} onChange={(e) => setTitle(e.target.value)} />

        <div className="sc-dt-row" style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
          <div className="sc-dt-field" style={{ flex: "1 1 150px" }}>
            <label style={S.fieldLabel}>Date</label>
            <div style={{ position: "relative" }}>
              <div style={{ ...S.input, width: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", pointerEvents: "none" }}>
                {formatDateDisplay(date)}
              </div>
              <input
                ref={dateInputRef}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                onClick={() => openPicker(dateInputRef)}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, border: "none", padding: 0, margin: 0, colorScheme: darkMode ? "dark" : "light", cursor: "pointer" }}
              />
            </div>
          </div>
          <div className="sc-dt-field" style={{ flex: "1 1 100px" }}>
            <label style={S.fieldLabel}>Start</label>
            <div style={{ position: "relative" }}>
              <div style={{ ...S.input, width: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", pointerEvents: "none" }}>
                {formatTimeDisplay(time)}
              </div>
              <input
                ref={timeInputRef}
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                onClick={() => openPicker(timeInputRef)}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, border: "none", padding: 0, margin: 0, cursor: "pointer" }}
              />
            </div>
          </div>
          <div className="sc-dt-field" style={{ flex: "1 1 90px" }}>
            <label style={S.fieldLabel}>Duration (min)</label>
            <input type="number" min={5} style={{ ...S.input, width: "100%" }} value={dur} onChange={(e) => setDur(e.target.value)} />
          </div>
        </div>

        <div style={S.modalDivider} />

        <label style={S.fieldLabel}>Repeats</label>
        <div style={S.segmented}>
          {["none", "daily", "weekly", "monthly"].map((r) => (
            <button key={r} className="sc-btn" style={{ ...S.segBtn, ...(repeat === r ? S.segBtnActive : {}) }} onClick={() => setRepeat(r)}>
              {r === "none" ? "Doesn't repeat" : r[0].toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>

        {repeat === "weekly" && (
          <div style={{ marginTop: 10 }}>
            <label style={S.fieldLabel}>On these days</label>
            <div style={{ display: "flex", gap: 5 }}>
              {WEEKDAYS.map((w, idx) => (
                <button
                  key={w}
                  className="sc-btn"
                  style={{ ...S.dayToggle, ...(weekdays.includes(idx) ? S.dayToggleActive : {}) }}
                  onClick={() => toggleWeekday(idx)}
                >
                  {w[0]}
                </button>
              ))}
            </div>
          </div>
        )}

        {repeat !== "none" && (
          <div style={{ marginTop: 10 }}>
            <label style={S.fieldLabel}>Ends (optional)</label>
            <input type="date" style={{ ...S.input, width: 180 }} value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} />
          </div>
        )}

        <div style={S.modalDivider} />

        <label style={S.fieldLabel}>Color</label>
        <div style={S.colorRow}>
          {EVENT_COLORS.map((c) => (
            <button
              key={c.value}
              className="sc-btn"
              aria-label={c.name}
              title={c.name}
              onClick={() => setColor(c.value)}
              style={{
                ...S.colorSwatch,
                background: c.value,
                boxShadow: color === c.value ? `0 0 0 2px var(--surface), 0 0 0 3.5px ${c.value}` : "none",
              }}
            />
          ))}
        </div>

        <div style={S.modalDivider} />

        <label style={S.fieldLabel}>Flexibility</label>
        <div style={S.segmented}>
          <button className="sc-btn" style={{ ...S.segBtn, ...(movable ? S.segBtnActive : {}) }} onClick={() => setMovable(true)}>
            <Icon.Pin width={12} height={12} /> Movable
          </button>
          <button className="sc-btn" style={{ ...S.segBtn, ...(!movable ? S.segBtnActive : {}) }} onClick={() => setMovable(false)}>
            Fixed
          </button>
        </div>
        <p style={S.hint}>
          {movable ? "Shifts automatically if a prayer window overlaps it." : "Never moves, even if a prayer window overlaps it."}
        </p>

        <div style={S.modalFooter}>
          {editing && (
            <button className="sc-btn" style={S.deleteBtn} onClick={() => onDelete(editing.id)}>
              <Icon.Trash width={13} height={13} /> Delete
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="sc-btn" style={S.textBtn} onClick={onClose}>Cancel</button>
          <button className="sc-btn" style={S.darkBtn} onClick={handleSave}>{editing ? "Save changes" : "Add event"}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Salah detail — read-only popup for tapping a salah block.
// Prayer times are computed, not user-editable, so this never offers
// edit/delete controls the way EventModal does for regular events.
// ============================================================
function SalahDetailModal({ data, onClose, use24h }) {
  const fmtT = use24h ? fmt24 : fmt12;
  const { date, block, win } = data;
  const color = SALAH_WINDOW_COLORS[block.key];

  return (
    <div style={S.modalOverlay} className="sc-overlay-fade" onClick={onClose}>
      <div style={{ ...S.modal, width: 340 }} onClick={(e) => e.stopPropagation()} className="sc-fade sc-modal-pop sc-modal">
        <div style={S.modalHead}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <i style={{ width: 11, height: 11, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
            <div style={S.modalTitle}>{block.label}</div>
          </div>
          <button className="sc-btn sc-icon-btn sc-close-btn" style={S.iconOnlyBtn} onClick={onClose}><Icon.X width={16} height={16} /></button>
        </div>

        <div style={{ fontSize: 12.5, color: GRAY_TEXT, marginBottom: 14 }}>{dayLabel(date)}</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "8px 10px", background: hexToRgba(color, 0.1), borderRadius: 7, border: `1px solid ${hexToRgba(color, 0.35)}` }}>
            <span style={{ fontSize: 12, color: GRAY_TEXT }}>Prayer time</span>
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>{fmtT(block.start)}–{fmtT(block.start + block.dur)}</span>
          </div>
          {win && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "8px 10px", background: SUBTLE_BG, borderRadius: 7 }}>
              <span style={{ fontSize: 12, color: GRAY_TEXT }}>Window</span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{fmtT(win.windowStart)}–{fmtT(win.realEnd ?? win.windowEnd)}</span>
            </div>
          )}
        </div>

        <p style={S.hint}>Prayer times are calculated automatically and can't be edited directly — adjust the location (or calculation method, for Islam) in Settings instead.</p>

        <div style={{ ...S.modalFooter, justifyContent: "flex-end" }}>
          <button className="sc-btn" style={S.textBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// styles — strict black / white / gray, Notion-flavored
// ============================================================
const BLACK = "var(--ink)";
const GRAY_TEXT = "var(--muted)";
const HAIRLINE = "var(--hairline)";
const SUBTLE_BG = "var(--subtle)";
const WHITE = "var(--surface)";
const ACCENT = "var(--accent)";
const ACCENT_TEXT = "var(--accent-ink)";

// Light/dark palettes applied as CSS custom properties on the app root.
const THEME_LIGHT = {
  "--bg": "#FFFFFF",
  "--surface": "#FFFFFF",
  "--ink": "#111111",
  "--muted": "#6B6B68",
  "--hairline": "#E9E9E7",
  "--subtle": "#F7F7F5",
  "--accent": "#111111",
  "--accent-ink": "#FFFFFF",
};
const THEME_DARK = {
  "--bg": "#18181B",
  "--surface": "#1E1E22",
  "--ink": "#EDEDEC",
  "--muted": "#9B9B97",
  "--hairline": "#303034",
  "--subtle": "#252529",
  "--accent": "#EDEDEC",
  "--accent-ink": "#111111",
};

// Builds a CSS gradient with hard color stops (no blending) across the
// active religion's prayer colors — used for legend swatches so they
// accurately show "one flat color per prayer" rather than a smoothly-blended
// gradient, which doesn't correspond to anything the app actually renders.
// Defaults to the Islam order so any stray no-arg call (e.g. before a
// religion is chosen) still renders something reasonable.
function salahBandsCss(order = SALAH_ORDER) {
  const n = order.length;
  const stops = [];
  order.forEach((k, i) => {
    const from = (i / n) * 100;
    const to = ((i + 1) / n) * 100;
    const c = SALAH_WINDOW_COLORS[k];
    stops.push(`${c} ${from}%`, `${c} ${to}%`);
  });
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

const S = {
  app: {
    position: "relative",
    display: "flex",
    fontFamily: "'Inter', -apple-system, sans-serif",
    background: WHITE,
    color: BLACK,
    overflow: "hidden",
    height: "100dvh",
    width: "100vw",
  },
  sidebar: {
    position: "relative",
    top: 0,
    bottom: 0,
    zIndex: 25,
    borderRight: `1px solid ${HAIRLINE}`,
    background: WHITE,
    flexShrink: 0,
    overflow: "hidden",
    transition: "width 260ms cubic-bezier(.22,1,.36,1), border-right-width 260ms ease",
  },
  // applied on top of `sidebar` only when isMobile — switches it from an
  // in-flow panel that pushes the calendar over, to a fixed overlay that
  // slides on top of it (there's no room to push on a small screen).
  sidebarMobile: {
    position: "fixed",
    left: 0,
    top: 0,
    bottom: 0,
    width: "min(80vw, 280px)",
    zIndex: 40,
    transition: "transform 260ms cubic-bezier(.22,1,.36,1)",
    boxShadow: "2px 0 18px rgba(0,0,0,0.18)",
  },
  // fixed-width content holder inside the sidebar — the outer `sidebar`
  // element is what animates (width on desktop, transform on mobile); this
  // inner div stays a constant width so the nav labels never wrap/reflow
  // mid-animation, they just get clipped in and out by the outer overflow.
  sidebarInner: {
    width: 210,
    minWidth: 210,
    height: "100%",
    boxSizing: "border-box",
    padding: "16px 10px",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  brand: { display: "flex", alignItems: "center", gap: 8, padding: "4px 4px 16px 6px" },
  brandLockup: { height: 22, width: "auto", display: "block" },
  brandTitle: { fontSize: 13.5, fontWeight: 600, lineHeight: 1.2 },
  brandSub: { fontSize: 11, color: GRAY_TEXT },
  topbarMark: { height: 20, width: "auto", display: "block", marginRight: 2 },
  navGroup: { display: "flex", flexDirection: "column", gap: 1, marginBottom: 8 },
  navBtn: {
    display: "flex", alignItems: "center", gap: 8,
    background: "transparent", border: "none", borderRadius: 6,
    padding: "7px 8px", fontSize: 13, color: BLACK, textAlign: "left",
  },
  navBtnActive: { background: SUBTLE_BG, fontWeight: 500 },
  iconOnlyBtn: {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 26, height: 26, background: "transparent", border: "none", borderRadius: 6, color: BLACK,
  },
  main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  viewFrame: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" },
  topbar: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 18px", borderBottom: `1px solid ${HAIRLINE}`, flexShrink: 0,
  },
  periodLabel: { fontSize: 14.5, fontWeight: 600, margin: "0 4px" },
  todayBtn: {
    fontSize: 12, border: `1px solid ${HAIRLINE}`, borderRadius: 6, padding: "5px 10px", background: "transparent", color: BLACK, marginLeft: 6,
  },
  legend: { display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 520, alignItems: "center" },
  legendItem: { display: "flex", alignItems: "center", fontSize: 11.5, color: GRAY_TEXT, whiteSpace: "nowrap" },
  legendSwatchSalah: {
    width: 14, height: 9, borderRadius: 2, display: "inline-block", marginRight: 5,
    backgroundImage: salahBandsCss(), opacity: 0.95,
  },
  legendSwatchFixed: { width: 9, height: 2, background: BLACK, display: "inline-block", marginRight: 5, marginBottom: 1 },
  legendSwatchMovable: { width: 9, height: 0, borderTop: `2px dashed ${BLACK}`, display: "inline-block", marginRight: 5, marginBottom: 3 },
  legendSwatchWindow: {
    width: 14, height: 9, borderRadius: 2, display: "inline-block", marginRight: 5,
    backgroundImage: salahBandsCss(), opacity: 0.32,
  },
  legendSwatchProhibited: {
    width: 12, height: 10, borderRadius: 2, display: "inline-block", marginRight: 5,
    backgroundColor: hexToRgba(PROHIBITED_COLOR, 0.18),
    backgroundImage: `repeating-linear-gradient(45deg, ${PROHIBITED_COLOR} 0 1.5px, transparent 1.5px 4px)`,
    border: `1.5px solid ${PROHIBITED_COLOR}`,
  },

  // year view
  yearGrid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12,
    padding: 18, overflowY: "auto", flex: 1, alignContent: "start",
  },
  miniMonth: { border: `1px solid ${HAIRLINE}`, borderRadius: 8, padding: 10 },
  miniMonthTitle: { fontSize: 12.5, fontWeight: 600, marginBottom: 6 },
  miniWeekRow: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 2 },
  miniWeekday: { fontSize: 9, color: GRAY_TEXT, textAlign: "center" },
  miniGrid: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", rowGap: 3 },
  miniDay: { fontSize: 10, textAlign: "center", position: "relative", color: BLACK, padding: "2px 0" },
  miniDayToday: { fontWeight: 700, background: ACCENT, color: ACCENT_TEXT, borderRadius: 3 },
  miniDot: { width: 3, height: 3, borderRadius: 2, background: BLACK, position: "absolute", bottom: -1, left: "50%", transform: "translateX(-50%)" },

  // month view
  monthWrap: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 },
  monthWeekRow: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: `1px solid ${HAIRLINE}`, flexShrink: 0 },
  monthWeekday: { fontSize: 11.5, color: GRAY_TEXT, textAlign: "center", padding: "8px 0", fontWeight: 500 },
  monthGrid: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", gridAutoRows: "1fr", flex: 1, minHeight: 0 },
  monthCellEmpty: { borderRight: `1px solid ${HAIRLINE}`, borderBottom: `1px solid ${HAIRLINE}` },
  monthCell: { borderRight: `1px solid ${HAIRLINE}`, borderBottom: `1px solid ${HAIRLINE}`, padding: 6, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" },
  monthCellHead: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  monthDayNum: { fontSize: 12, color: BLACK, width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 5 },
  monthDayNumToday: { background: ACCENT, color: ACCENT_TEXT, fontWeight: 600 },
  monthAddBtn: { width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", borderRadius: 4, color: GRAY_TEXT, opacity: 0 },
  monthEvents: { display: "flex", flexDirection: "column", gap: 2, marginTop: 4, overflow: "hidden" },
  monthEventChip: { display: "flex", alignItems: "center", fontSize: 10.5, padding: "2px 4px", borderRadius: 4, overflow: "hidden", whiteSpace: "nowrap" },
  chipMovable: { background: SUBTLE_BG, color: BLACK },
  chipFixed: { background: WHITE, color: BLACK, border: `1px dashed ${HAIRLINE}` },
  monthEventText: { overflow: "hidden", textOverflow: "ellipsis" },
  monthMore: { fontSize: 9.5, color: GRAY_TEXT, paddingLeft: 4 },

  // week view
  weekWrap: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 },
  reasonBar: { fontSize: 12, padding: "8px 18px", borderBottom: `1px solid ${HAIRLINE}`, background: SUBTLE_BG, color: BLACK, flexShrink: 0 },
  weekGridHead: { display: "flex", borderBottom: `1px solid ${HAIRLINE}`, flexShrink: 0 },
  weekTimeCol: { width: "var(--week-timecol-w)", flexShrink: 0 },
  weekDayHead: { flex: 1, minWidth: "var(--week-daycol-w)", textAlign: "center", padding: "8px 0" },
  weekDayName: { fontSize: 10.5, color: GRAY_TEXT, textTransform: "uppercase", letterSpacing: 0.3 },
  weekDayNum: { fontSize: 15, fontWeight: 500, marginTop: 2, display: "inline-flex", width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  weekDayNumToday: { background: ACCENT, color: ACCENT_TEXT },
  weekScroll: { flex: 1, overflowY: "auto", overflowX: "visible" },
  hourLabel: { position: "absolute", left: 6, fontSize: 10, color: GRAY_TEXT },
  dayCol: { flex: 1, minWidth: "var(--week-daycol-w)", position: "relative", borderLeft: `1px solid ${HAIRLINE}`, touchAction: "none" },
  hourLine: { position: "absolute", left: 0, right: 0, borderTop: `1px solid ${HAIRLINE}` },
  salahBlock: {
    position: "absolute", left: 2, right: 2, background: SUBTLE_BG,
    border: `1px solid ${BLACK}`, borderRadius: 4, padding: "1px 6px", overflow: "hidden",
    display: "flex", alignItems: "center",
  },
  salahName: { fontSize: 10, fontWeight: 500, color: BLACK, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block", maxWidth: "100%" },
  taskBlock: {
    position: "absolute", left: 3, right: 3, background: WHITE,
    border: `1px solid ${HAIRLINE}`, borderRadius: 5,
    display: "flex", flexDirection: "column", gap: 1, overflow: "hidden",
  },
  taskTitleRow: { display: "flex", alignItems: "center", gap: 4, minWidth: 0, width: "100%" },
  taskTitle: { fontSize: 11.5, fontWeight: 500, color: BLACK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.15, minWidth: 0 },
  taskTime: { fontSize: 9.5, color: GRAY_TEXT, lineHeight: 1.15, whiteSpace: "nowrap" },

  // settings drawer
  drawerOverlay: { position: "absolute", inset: 0, background: "rgba(17,17,17,0.06)", display: "flex", justifyContent: "flex-end", zIndex: 20 },
  drawer: { width: 340, background: WHITE, borderLeft: `1px solid ${HAIRLINE}`, padding: 18, overflowY: "auto", overflowX: "hidden", boxSizing: "border-box" },
  drawerHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  drawerTitle: { fontSize: 15, fontWeight: 600 },
  sectionLabel: { fontSize: 11, fontWeight: 600, color: GRAY_TEXT, textTransform: "uppercase", letterSpacing: 0.4, margin: "16px 0 8px" },
  input: {
    flex: 1, background: WHITE, border: `1px solid ${HAIRLINE}`, borderRadius: 6,
    color: BLACK, padding: "7px 9px", fontSize: 13, width: "100%",
  },
  darkBtn: {
    display: "flex", alignItems: "center", gap: 5, background: ACCENT, color: ACCENT_TEXT,
    border: "none", borderRadius: 6, padding: "7px 12px", fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap",
  },
  statusOk: { fontSize: 11.5, color: BLACK, marginBottom: 8 },
  statusErr: { fontSize: 11.5, color: GRAY_TEXT, marginBottom: 8 },
  settingsRow: { display: "flex", alignItems: "center", gap: 8, border: `1px solid ${HAIRLINE}`, borderRadius: 6, padding: "6px 8px" },
  settingsLabel: { fontSize: 12.5, fontWeight: 500, width: 56, flexShrink: 0 },
  timeInput: { border: `1px solid ${HAIRLINE}`, borderRadius: 5, padding: "4px 6px", fontSize: 12, width: 92, flexShrink: 0 },
  numInput: { width: 46, border: `1px solid ${HAIRLINE}`, borderRadius: 5, padding: "4px 5px", fontSize: 12 },
  durUnit: { fontSize: 11, color: GRAY_TEXT },

  // modal
  modalOverlay: { position: "absolute", inset: 0, background: "rgba(17,17,17,0.12)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30, padding: 16 },
  modal: {
    width: 420, background: WHITE, border: `1px solid ${HAIRLINE}`, borderRadius: 10, padding: 20,
    boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
    maxHeight: "calc(100dvh - 32px)", overflowY: "auto", overflowX: "hidden",
  },
  modalHead: {
    display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14,
    position: "sticky", top: -20, background: WHITE, paddingTop: 20, marginTop: -20, zIndex: 1,
  },
  modalTitle: { fontSize: 15, fontWeight: 600 },
  fieldLabel: { fontSize: 11, fontWeight: 500, color: GRAY_TEXT, display: "block", marginBottom: 5 },
  modalDivider: { borderTop: `1px solid ${HAIRLINE}`, margin: "16px 0" },
  segmented: { display: "flex", gap: 6, flexWrap: "wrap" },
  segBtn: {
    display: "flex", alignItems: "center", gap: 5, fontSize: 12, padding: "6px 11px",
    border: `1px solid ${HAIRLINE}`, borderRadius: 6, background: WHITE, color: BLACK,
  },
  segBtnActive: { background: ACCENT, color: ACCENT_TEXT, borderColor: ACCENT },
  dayToggle: { width: 28, height: 28, borderRadius: 14, border: `1px solid ${HAIRLINE}`, background: WHITE, fontSize: 11.5, color: BLACK },
  dayToggleActive: { background: ACCENT, color: ACCENT_TEXT, borderColor: ACCENT },
  hint: { fontSize: 11.5, color: GRAY_TEXT, marginTop: 8, lineHeight: 1.5 },
  modalFooter: { display: "flex", alignItems: "center", gap: 8, marginTop: 20 },
  deleteBtn: { display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: GRAY_TEXT, background: "transparent", border: "none", padding: "6px 4px" },
  textBtn: { fontSize: 12.5, background: "transparent", border: `1px solid ${HAIRLINE}`, borderRadius: 6, padding: "7px 12px", color: BLACK },

  // color picker
  colorRow: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 2 },
  colorSwatch: { width: 22, height: 22, borderRadius: "50%", border: "none", padding: 0 },

  // now-time indicator (week/day timeline)
  nowLine: { position: "absolute", left: 0, right: 0, height: 0, borderTop: "2px solid #E53935", zIndex: 6 },
  nowDot: { position: "absolute", left: -4, top: -4, width: 8, height: 8, borderRadius: "50%", background: "#E53935" },

  // ring view
  ringWrap: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 32, padding: 24, minHeight: 0, overflow: "auto" },
  ringCanvasWrap: { display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  ringLegend: { width: 200, maxHeight: 420, overflowY: "auto", flexShrink: 0 },
  ringLegendRow: { display: "flex", alignItems: "center", gap: 7, padding: "6px 6px", borderRadius: 6 },
  ringLegendRowActive: { background: SUBTLE_BG },
  ringLegendDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  ringLegendTitle: { fontSize: 12.5, color: BLACK, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  ringLegendTime: { fontSize: 11, color: GRAY_TEXT, flexShrink: 0 },
};
