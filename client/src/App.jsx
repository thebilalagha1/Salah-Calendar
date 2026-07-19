import React, { useEffect, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { API_BASE_URL } from "./config.js";
import SalahCalendar from "./SalahCalendar.jsx";
import qamuWordmark from "./assets/qamu-wordmark.png";

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
        <style>{`html, body, #root { height: 100%; margin: 0; }`}</style>
        <div style={styles.checkingText}>Loading…</div>
      </div>
    );
  }

  if (status === "signedOut") {
    return (
      <div style={styles.centerScreen}>
        <style>{`
          html, body, #root { height: 100%; margin: 0; }
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        `}</style>
        <div style={styles.card}>
          <img src={qamuWordmark} alt="QAMU" style={styles.wordmark} />
          <div style={styles.subtitle}>Sign in to sync your prayer times and events across devices.</div>
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
    height: "100dvh",
    minHeight: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0B0B0D",
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    padding: 20,
    boxSizing: "border-box",
  },
  checkingText: { color: "#8a8a87", fontSize: 14 },
  card: {
    width: "min(340px, 100%)",
    padding: "36px 28px",
    borderRadius: 16,
    border: "1px solid #232326",
    background: "#141416",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    boxSizing: "border-box",
  },
  wordmark: { height: 34, width: "auto", marginBottom: 8 },
  subtitle: { fontSize: 13, color: "#9b9b97", textAlign: "center", marginBottom: 20, lineHeight: 1.5 },
  loginBtnWrap: { marginTop: 4 },
  error: { fontSize: 12, color: "#F26B6B", marginTop: 14, textAlign: "center" },
};
