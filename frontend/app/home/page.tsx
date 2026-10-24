"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { auth, db } from "../firebase";
import AuthForm from "../../components/AuthForm";

type InterviewRecord = {
  completed?: boolean;
  status?: string;
  completedAt?: unknown;
  createdAt?: unknown;
  date?: unknown;
};
type PracticeStats = { currentStreak: number; longestStreak: number };

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === "object" && value !== null && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
}
function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function calculateStreaks(records: InterviewRecord[]): PracticeStats {
  const keys = [...new Set(records.filter(r => r.completed === true || String(r.status ?? "").toLowerCase() === "completed")
    .map(r => asDate(r.completedAt ?? r.createdAt ?? r.date)).filter((d): d is Date => !!d).map(dayKey))].sort();
  if (!keys.length) return { currentStreak: 0, longestStreak: 0 };
  const keySet = new Set(keys);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  let currentStreak = 0;
  const latest = keys[keys.length - 1];
  if (latest === dayKey(today) || latest === dayKey(yesterday)) {
    const cursor = new Date(`${latest}T12:00:00`);
    while (keySet.has(dayKey(cursor))) { currentStreak++; cursor.setDate(cursor.getDate() - 1); }
  }
  let longestStreak = 0, run = 0, previous: Date | null = null;
  for (const key of keys) {
    const date = new Date(`${key}T12:00:00`);
    run = previous && Math.round((date.getTime() - previous.getTime()) / 86400000) === 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run); previous = date;
  }
  return { currentStreak, longestStreak };
}

const interviewTypes = [
  { name: "Technical Interview", description: "Core concepts, technologies and technical knowledge.", icon: "</>", tag: "KNOWLEDGE" },
  { name: "HR Interview", description: "Common recruiter questions and career conversations.", icon: "HR", tag: "COMMUNICATION" },
  { name: "Coding Interview", description: "Coding problems, logic and problem-solving skills.", icon: "{ }", tag: "PROBLEM SOLVING" },
  { name: "Behavioral Interview", description: "Teamwork, decisions and real workplace situations.", icon: "↗", tag: "SITUATIONAL" },
];

export default function PrepwiseHomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<PracticeStats>({ currentStreak: 0, longestStreak: 0 });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let alive = true;
    const unsubscribe = onAuthStateChanged(auth, async currentUser => {
      if (!alive) return;
      setUser(currentUser); setLoading(false);
      if (!currentUser) { setStats({ currentStreak: 0, longestStreak: 0 }); return; }
      try {
        const snapshot = await getDocs(collection(db, "users", currentUser.uid, "interviews"));
        if (alive) setStats(calculateStreaks(snapshot.docs.map(d => d.data() as InterviewRecord)));
      } catch (error) { console.error("Unable to load practice streak:", error); }
    });
    return () => { alive = false; unsubscribe(); };
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    try { await signOut(auth); } catch (error) { console.error("Sign out failed:", error); setSigningOut(false); }
  }

  if (loading) return <main style={s.loading}>Loading Prepwise…</main>;
  if (!user) return <AuthForm />;

  return (
    <main style={s.page}>
      <header style={s.header}>
        <Link href="/home" style={s.logo}><span style={s.logoMark}>P</span><span>prepwise</span></Link>
        <nav style={s.nav} aria-label="Main navigation">
          <Link href="/home" style={{ ...s.navLink, ...s.navActive }}>Home</Link>
          <Link href="/dashboard" style={s.navLink}>Dashboard</Link>
          <Link href="/public-profile" style={s.navLink}>Profile</Link>
        </nav>
        <div style={s.accountArea}>
          <span style={s.userEmail} title={user.email ?? "Signed in"}>{user.email?.split("@")[0] ?? "Account"}</span>
          <button type="button" onClick={() => setSettingsOpen(v => !v)} aria-expanded={settingsOpen} aria-label="Account settings" style={s.avatarButton}>
            {(user.displayName?.[0] || user.email?.[0] || "U").toUpperCase()}
          </button>
          {settingsOpen && <div style={s.menu}>
            <div style={s.menuEmail}>{user.email ?? "Signed in"}</div>
            <Link href="/public-profile" style={s.menuLink} onClick={() => setSettingsOpen(false)}>Profile settings</Link>
            <button type="button" onClick={handleSignOut} disabled={signingOut} style={s.signOut}>{signingOut ? "Signing out…" : "Sign out"}</button>
          </div>}
        </div>
      </header>

      <div style={s.content}>
        <section style={s.intro}>
          <div>
            <div style={s.overline}>INTERVIEW PREPARATION</div>
            <h1 style={s.title}>Prepare with purpose.</h1>
            <p style={s.subtitle}>Choose a practice format and build confidence for your next interview.</p>
          </div>
          <div style={s.streakBox}>
            <div style={s.streakIcon}>↗</div>
            <div><div style={s.streakCaption}>CURRENT STREAK</div><div style={s.streakNumber}>{stats.currentStreak} <span>{stats.currentStreak === 1 ? "day" : "days"}</span></div></div>
            <div style={s.streakDivider} />
            <div><div style={s.streakCaption}>PERSONAL BEST</div><div style={s.streakNumber}>{stats.longestStreak} <span>{stats.longestStreak === 1 ? "day" : "days"}</span></div></div>
          </div>
        </section>

        <section style={s.section}>
          <div style={s.sectionTop}><div><h2 style={s.sectionTitle}>Choose an interview</h2><p style={s.sectionSub}>Select a format to configure your practice session.</p></div><span style={s.count}>04 FORMATS</span></div>
          <div style={s.grid}>
            {interviewTypes.map((item, index) => <Link key={item.name} href={`/?type=${encodeURIComponent(item.name)}`} style={s.card}>
              <div style={s.cardTop}><span style={s.cardIcon}>{item.icon}</span><span style={s.cardIndex}>0{index + 1}</span></div>
              <div style={s.cardTag}>{item.tag}</div>
              <h3 style={s.cardTitle}>{item.name}</h3>
              <p style={s.cardDescription}>{item.description}</p>
              <div style={s.cardBottom}><span>Set up practice</span><span style={s.arrow}>↗</span></div>
            </Link>)}
          </div>
        </section>
        <footer style={s.footer}><span>PREPWISE</span><span>Consistent practice. Better interviews.</span></footer>
      </div>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#f5faf6", color: "#18382a", fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  loading: { minHeight: "100vh", display: "grid", placeItems: "center", background: "#f5faf6", color: "#18382a", fontFamily: "system-ui, sans-serif" },
  header: { height: 72, padding: "0 clamp(20px, 6vw, 88px)", display: "flex", alignItems: "center", gap: 36, background: "#fff", borderBottom: "1px solid #e7eaf0", position: "relative" },
  logo: { display: "flex", alignItems: "center", gap: 10, color: "#17202b", textDecoration: "none", fontSize: 21, fontWeight: 750, letterSpacing: "-0.8px", whiteSpace: "nowrap" },
  logoMark: { display: "grid", placeItems: "center", width: 31, height: 31, borderRadius: 9, background: "#34794f", color: "white", fontSize: 17, fontWeight: 800, letterSpacing: 0 },
  nav: { display: "flex", alignItems: "center", gap: 28, flex: 1, height: "100%" },
  navLink: { display: "flex", alignItems: "center", height: "100%", color: "#65796b", textDecoration: "none", fontSize: 13, fontWeight: 550, borderBottom: "2px solid transparent", paddingTop: 2 },
  navActive: { color: "#34794f", borderBottomColor: "#34794f" },
  accountArea: { display: "flex", alignItems: "center", gap: 12, position: "relative" },
  userEmail: { maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#667085", fontSize: 12 },
  avatarButton: { width: 35, height: 35, borderRadius: "50%", border: "1px solid #d8deea", background: "#eaf4ec", color: "#28623e", fontWeight: 750, cursor: "pointer" },
  menu: { position: "absolute", top: 47, right: 0, width: 190, padding: 8, background: "#fff", border: "1px solid #e1e6ee", borderRadius: 10, boxShadow: "0 12px 30px rgba(25, 37, 58, .12)", zIndex: 10 },
  menuEmail: { padding: "10px 9px", fontSize: 11, color: "#788396", borderBottom: "1px solid #edf0f4", overflowWrap: "anywhere" },
  menuLink: { display: "block", padding: "11px 9px", color: "#253247", textDecoration: "none", fontSize: 13 },
  signOut: { display: "block", width: "100%", textAlign: "left", padding: "11px 9px", border: 0, borderTop: "1px solid #edf0f4", background: "white", color: "#b42318", fontSize: 13, cursor: "pointer" },
  content: { maxWidth: 1180, margin: "0 auto", padding: "0 clamp(20px, 5vw, 54px)" },
  intro: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 30, padding: "58px 0 46px", borderBottom: "1px solid #e4e8ef", flexWrap: "wrap" },
  overline: { color: "#34794f", fontSize: 10, fontWeight: 750, letterSpacing: 1.8, marginBottom: 13 },
  title: { margin: 0, fontSize: "clamp(29px, 4vw, 42px)", letterSpacing: "-1.8px", lineHeight: 1.12, fontWeight: 700, color: "#18382a" },
  subtitle: { margin: "13px 0 0", color: "#65796b", fontSize: 14, lineHeight: 1.7 },
  streakBox: { display: "flex", alignItems: "center", gap: 19, padding: "17px 21px", background: "#fff", border: "1px solid #e1e6ee", borderRadius: 12, boxShadow: "0 3px 10px rgba(30, 45, 70, .025)" },
  streakIcon: { width: 38, height: 38, display: "grid", placeItems: "center", borderRadius: 10, background: "#eaf4ec", color: "#34794f", fontSize: 23, fontWeight: 500 },
  streakCaption: { color: "#8a94a5", fontSize: 9, fontWeight: 750, letterSpacing: 1.1, marginBottom: 6, whiteSpace: "nowrap" },
  streakNumber: { fontSize: 23, lineHeight: 1, fontWeight: 700, letterSpacing: "-0.8px", color: "#245638", whiteSpace: "nowrap" },
  streakDivider: { width: 1, height: 37, background: "#e4e8ef", margin: "0 2px" },
  section: { padding: "38px 0 54px" },
  sectionTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, marginBottom: 22 },
  sectionTitle: { margin: 0, fontSize: 21, letterSpacing: "-0.6px", fontWeight: 700, color: "#18382a" },
  sectionSub: { margin: "7px 0 0", color: "#7a8595", fontSize: 13 },
  count: { padding: "7px 10px", border: "1px solid #dfe5ed", borderRadius: 6, color: "#34794f", fontSize: 9, fontWeight: 750, letterSpacing: 1, whiteSpace: "nowrap" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 235px), 1fr))", gap: 16 },
  card: { minHeight: 246, display: "flex", flexDirection: "column", padding: 23, background: "#fff", border: "1px solid #e1e6ee", borderRadius: 11, color: "inherit", textDecoration: "none", boxShadow: "0 2px 7px rgba(25, 37, 58, .025)", transition: "border-color .15s ease, transform .15s ease, box-shadow .15s ease" },
  cardTop: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 23 },
  cardIcon: { display: "grid", placeItems: "center", minWidth: 43, height: 43, padding: "0 6px", borderRadius: 9, background: "#eaf4ec", border: "1px solid #dce9df", color: "#28623e", fontSize: 15, fontWeight: 750, letterSpacing: "-0.5px" },
  cardIndex: { color: "#a2b6a7", fontSize: 11, fontWeight: 700, letterSpacing: 1 },
  cardTag: { color: "#34794f", fontSize: 9, fontWeight: 750, letterSpacing: 1.1, marginBottom: 9 },
  cardTitle: { margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: "-0.35px", color: "#18382a" },
  cardDescription: { margin: "9px 0 22px", color: "#65796b", fontSize: 12, lineHeight: 1.7, flex: 1 },
  cardBottom: { display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 14, borderTop: "1px solid #edf0f4", color: "#34794f", fontSize: 11, fontWeight: 700 },
  arrow: { fontSize: 18, fontWeight: 400 },
  footer: { display: "flex", justifyContent: "space-between", gap: 15, padding: "18px 0 25px", borderTop: "1px solid #e4e8ef", color: "#98a1af", fontSize: 10 },
};
