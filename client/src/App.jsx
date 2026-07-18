import React, { useEffect, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { API_BASE_URL } from "./config.js";
import SalahCalendar from "./SalahCalendar.jsx";

export default function App() {
  const [status, setStatus] = useState("checking"); // checking | signedOut | signedIn
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");

  // On load, see if there's already a valid session cookie from a previous visit.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/me`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setStatus("signedIn");
          return;
        }
      } catch {
        // network error — fall through to signed-out screen
      }
      setStatus("signedOut");
    })();
  }, []);

  async function handleGoogleSuccess(credentialResponse) {
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: credentialResponse.credential }),
      });
      if (!res.ok) throw new Error("Sign-in failed");
      const data = await res.json();
      setUser(data.user);
      setStatus("signedIn");
    } catch {
      setError("Sign-in failed — please try again.");
    }
  }

  async function handleLogout() {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, { method: "POST", credentials: "include" });
    } catch {
      // ignore — clearing local state below is enough for the UI
    }
    setUser(null);
    setStatus("signedOut");
  }

  if (status === "checking") {
    return (
      <div style={styles.centerScreen}>
        <div style={styles.checkingText}>Loading…</div>
      </div>
    );
  }

  if (status === "signedOut") {
    return (
      <div style={styles.centerScreen}>
        <div style={styles.card}>
          <div style={styles.title}>Salah Calendar</div>
          <div style={styles.subtitle}>Sign in to sync your events across devices.</div>
          <div style={styles.loginBtnWrap}>
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError("Sign-in failed — please try again.")}
            />
          </div>
          {error && <div style={styles.error}>{error}</div>}
        </div>
      </div>
    );
  }

  return <SalahCalendar user={user} onLogout={handleLogout} />;
}

const styles = {
  centerScreen: {
    width: "100vw",
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#FAFAF9",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  checkingText: { color: "#666", fontSize: 14 },
  card: {
    width: 320,
    padding: 32,
    borderRadius: 12,
    border: "1px solid #E5E5E3",
    background: "#fff",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
  },
  title: { fontSize: 20, fontWeight: 600, color: "#111" },
  subtitle: { fontSize: 13, color: "#666", textAlign: "center", marginBottom: 18 },
  loginBtnWrap: { marginTop: 4 },
  error: { fontSize: 12, color: "#B3261E", marginTop: 12, textAlign: "center" },
};
