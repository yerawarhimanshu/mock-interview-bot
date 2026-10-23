"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  type Timestamp,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "../firebase";

type Interview = {
  id: string;
  topic?: string;
  difficulty?: string;
  totalQuestions?: number;
  score?: number;
  summary?: string;
  conversation?: { role: "bot" | "user"; content: string }[];
  completed?: boolean;
  createdAt?: Timestamp | Date | string | null;
  startedAt?: Timestamp | Date | string | null;
  completedAt?: Timestamp | Date | string | null;
  durationSeconds?: number | string | null;
  interviewType?: string;
};

type Profile = {
  name?: string;
  email?: string;
  projectName?: string;
  projectDescription?: string;
  certificationName?: string;
  certificationUrl?: string;
};

type AchievementBadge = {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  current: number;
  target: number;
  earned: boolean;
};

function getDate(value: Interview["createdAt"]): Date | null {
  if (!value) return null;
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (value instanceof Date) return value;
  if (typeof value === "object" && "toDate" in value) {
    try {
      return value.toDate();
    } catch {
      return null;
    }
  }
  return null;
}

function formatDate(value: Interview["createdAt"]) {
  const date = getDate(value);
  return date
    ? date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Date unavailable";
}

function getDurationSeconds(value: Interview["durationSeconds"]): number | null {
  if (value === null || value === undefined || value === "") return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds) : null;
}

function formatDuration(value: Interview["durationSeconds"]): string {
  const seconds = getDurationSeconds(value);
  if (seconds === null) return "Not recorded";
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) return `${minutes} min`;
  return `${minutes} min ${remainingSeconds} sec`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile>({});
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);
  const [search, setSearch] = useState("");
  const [topicFilter, setTopicFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "score">("newest");
  const [showAllBadges, setShowAllBadges] = useState(false);

  useEffect(() => {
    let unsubscribeInterviews: (() => void) | undefined;
    let active = true;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      unsubscribeInterviews?.();

      if (!currentUser) {
        setUser(null);
        setInterviews([]);
        setProfile({});
        setLoading(false);
        router.replace("/");
        return;
      }

      setUser(currentUser);
      setLoading(true);
      setError("");

      try {
        const profileRef = doc(db, "users", currentUser.uid);
        const profileSnap = await getDoc(profileRef);
        if (!active) return;

        const profileData = profileSnap.exists() ? profileSnap.data() : {};
        let publicProfileData: Record<string, unknown> = {};
        try {
          const publicSnap = await getDoc(doc(db, "publicProfiles", currentUser.uid));
          if (publicSnap.exists()) publicProfileData = publicSnap.data();
        } catch (publicProfileError) {
          console.warn("Could not load public profile achievements:", publicProfileError);
        }
        if (!active) return;
        setProfile({
          name: String(profileData.name || currentUser.displayName || ""),
          email: String(profileData.email || currentUser.email || ""),
          projectName: String(publicProfileData.projectName || ""),
          projectDescription: String(publicProfileData.projectDescription || ""),
          certificationName: String(publicProfileData.certificationName || ""),
          certificationUrl: String(publicProfileData.certificationUrl || ""),
        });
      } catch (e) {
        console.error("Could not load profile:", e);
        setProfile({
          name: currentUser.displayName || "",
          email: currentUser.email || "",
        });
      }

      const interviewsRef = collection(db, "users", currentUser.uid, "interviews");
      unsubscribeInterviews = onSnapshot(
        interviewsRef,
        (snapshot) => {
          const records: Interview[] = snapshot.docs.map((item) => ({
            id: item.id,
            ...(item.data() as Omit<Interview, "id">),
          }));

          records.sort((a, b) => {
            const dateA = getDate(a.createdAt)?.getTime() ?? 0;
            const dateB = getDate(b.createdAt)?.getTime() ?? 0;
            return dateB - dateA;
          });

          setInterviews(records);
          setLoading(false);
        },
        (snapshotError) => {
          console.error("Could not load interviews:", snapshotError);
          setError(
            "Couldn't load your interview history. Check your Firestore rules and internet connection."
          );
          setLoading(false);
        }
      );
    });

    return () => {
      active = false;
      unsubscribeInterviews?.();
      unsubscribeAuth();
    };
  }, [router]);

  const completedInterviews = useMemo(
    () => interviews.filter((item) => item.completed === true),
    [interviews]
  );

  const averageScore = useMemo(() => {
    const scores = completedInterviews
      .map((item) => Number(item.score))
      .filter((score) => Number.isFinite(score) && score >= 0 && score <= 100);

    if (scores.length === 0) return null;
    return Math.round(scores.reduce((total, score) => total + score, 0) / scores.length);
  }, [completedInterviews]);

  const bestScore = useMemo(() => {
    const scores = completedInterviews
      .map((item) => Number(item.score))
      .filter((score) => Number.isFinite(score) && score >= 0 && score <= 100);
    return scores.length ? Math.max(...scores) : null;
  }, [completedInterviews]);

  const weakTopics = useMemo(() => {
    const topicScores = new Map<string, number[]>();
    completedInterviews.forEach((item) => {
      if (!item.topic || !Number.isFinite(Number(item.score))) return;
      const scores = topicScores.get(item.topic) ?? [];
      scores.push(Number(item.score));
      topicScores.set(item.topic, scores);
    });

    return Array.from(topicScores.entries())
      .map(([topic, scores]) => ({
        topic,
        average: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
      }))
      .sort((a, b) => a.average - b.average)
      .slice(0, 3);
  }, [completedInterviews]);

  const topics = Array.from(new Set(completedInterviews.map((item) => item.topic).filter((value): value is string => Boolean(value))));
  const difficulties = Array.from(new Set(completedInterviews.map((item) => item.difficulty).filter((value): value is string => Boolean(value))));
  const filteredInterviews = useMemo(() => {
    const query = search.trim().toLowerCase();
    return completedInterviews.filter((item) => {
      const matchesSearch = !query || (item.topic || "").toLowerCase().includes(query) || (item.summary || "").toLowerCase().includes(query);
      return matchesSearch && (topicFilter === "all" || item.topic === topicFilter) && (difficultyFilter === "all" || item.difficulty === difficultyFilter);
    }).sort((a, b) => {
      if (sortOrder === "score") return (Number(b.score) || -1) - (Number(a.score) || -1);
      const aTime = getDate(a.createdAt)?.getTime() ?? 0;
      const bTime = getDate(b.createdAt)?.getTime() ?? 0;
      return sortOrder === "newest" ? bTime - aTime : aTime - bTime;
    });
  }, [completedInterviews, search, topicFilter, difficultyFilter, sortOrder]);
  const chartPoints = useMemo(() => completedInterviews
    .map((item) => ({ id: item.id, date: getDate(item.createdAt), score: Number(item.score) }))
    .filter((item): item is { id: string; date: Date; score: number } => item.date !== null && Number.isFinite(item.score) && item.score >= 0 && item.score <= 100)
    .sort((a, b) => a.date.getTime() - b.date.getTime()), [completedInterviews]);

  const latestInterview = useMemo(
    () => completedInterviews.find((item) => Array.isArray(item.conversation) && item.conversation.length > 0) ?? completedInterviews[0] ?? null,
    [completedInterviews]
  );

  const completedDays = new Set(
    completedInterviews
      .map((item) => getDate(item.completedAt || item.createdAt)?.toDateString())
      .filter((value): value is string => Boolean(value))
  ).size;
  const technicalInterviews = completedInterviews.filter((item) =>
    (item.interviewType || item.topic || "").toLowerCase().includes("technical")
  ).length;
  const topicCount = new Set(completedInterviews.map((item) => item.topic?.trim().toLowerCase()).filter(Boolean)).size;
  const communicationScoredCount = 0; // The current interview records do not expose a separate communication score.
  const badgeList: AchievementBadge[] = [
    { id: "first", title: "First Interview", description: "Complete your first mock interview.", icon: "🎯", category: "Getting Started", current: Math.min(completedInterviews.length, 1), target: 1, earned: completedInterviews.length >= 1 },
    { id: "practice-5", title: "Practice Builder", description: "Complete 5 mock interviews.", icon: "📘", category: "Consistency", current: Math.min(completedInterviews.length, 5), target: 5, earned: completedInterviews.length >= 5 },
    { id: "champion-10", title: "Interview Champion", description: "Complete 10 mock interviews.", icon: "🏆", category: "Milestone", current: Math.min(completedInterviews.length, 10), target: 10, earned: completedInterviews.length >= 10 },
    { id: "interview-pro-25", title: "Interview Pro", description: "Complete 25 mock interviews.", icon: "🚀", category: "Advanced", current: Math.min(completedInterviews.length, 25), target: 25, earned: completedInterviews.length >= 25 },
    { id: "consistent", title: "Consistent Learner", description: "Practice on 5 different days.", icon: "🔥", category: "Consistency", current: Math.min(completedDays, 5), target: 5, earned: completedDays >= 5 },
    { id: "technical", title: "Technical Thinker", description: "Complete 5 technical interviews.", icon: "💻", category: "Technical", current: Math.min(technicalInterviews, 5), target: 5, earned: technicalInterviews >= 5 },
    { id: "communicator", title: "Clear Communicator", description: "Reach 80% communication score in 3 interviews.", icon: "💬", category: "Soft Skills", current: communicationScoredCount, target: 3, earned: false },
    { id: "high-score", title: "High Scorer", description: "Score 80% or above in one interview.", icon: "⭐", category: "Performance", current: Math.min(bestScore ?? 0, 80), target: 80, earned: bestScore !== null && bestScore >= 80 },
    { id: "excellence", title: "Excellence Award", description: "Score 95% or above in one interview.", icon: "💎", category: "Performance", current: Math.min(bestScore ?? 0, 95), target: 95, earned: bestScore !== null && bestScore >= 95 },
    { id: "topic-explorer", title: "Topic Explorer", description: "Practice at least 5 different topics.", icon: "🧠", category: "Learning", current: Math.min(topicCount, 5), target: 5, earned: topicCount >= 5 },
    { id: "project-builder", title: "Project Builder", description: "Add a featured project to your profile.", icon: "🛠️", category: "Career Growth", current: profile.projectName?.trim() && profile.projectDescription?.trim() ? 1 : 0, target: 1, earned: Boolean(profile.projectName?.trim() && profile.projectDescription?.trim()) },
    { id: "certification", title: "Certification Achiever", description: "Add certification details and a proof link.", icon: "🎓", category: "Career Growth", current: profile.certificationName?.trim() && profile.certificationUrl?.trim() ? 1 : 0, target: 1, earned: Boolean(profile.certificationName?.trim() && profile.certificationUrl?.trim()) },
  ];
  const earnedBadgeCount = badgeList.filter((badge) => badge.earned).length;

  const displayName =
    profile.name?.trim() ||
    user?.displayName?.trim() ||
    user?.email?.split("@")[0] ||
    "Student";

  async function handleLogout() {
    try {
      await signOut(auth);
      router.replace("/");
    } catch (e) {
      console.error("Logout failed:", e);
      setError("Couldn't sign out. Please try again.");
    }
  }

  if (loading) {
    return (
      <main className="loadingScreen">
        <div className="loader" />
        <p>Loading your dashboard...</p>
      <style jsx>{styles}</style>
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="page">
      <header className="topbar">
        <button className="brand" onClick={() => router.push("/home")} aria-label="Go to home">
          <span className="brandIcon">✦</span>
          <span>Prepwise<span className="brandDot">.</span></span>
        </button>
        <nav className="navActions">
          <button className="navLink" onClick={() => router.push("/home")}>Home</button>
          <button className="navLink active">Dashboard</button>
          <button className="logoutButton" onClick={handleLogout}>Sign out</button>
        </nav>
      </header>

      <section className="content">
        <div className="welcomeRow">
          <div>
            <p className="eyebrow">YOUR LEARNING SPACE</p>
            <h1>Welcome back, {displayName.split(" ")[0]}! <span>🌱</span></h1>
            <p className="muted">Track your practice, learn from feedback, and keep improving.</p>
          </div>
          <button className="primaryButton" onClick={() => router.push("/")}>
            <span>＋</span> Start new interview
          </button>
        </div>

        {error && <div className="errorBox" role="alert">{error}</div>}

        <section className="profileStrip">
          <div className="avatar">{displayName.charAt(0).toUpperCase()}</div>
          <div className="profileText">
            <strong>{displayName}</strong>
            <span>{profile.email || user.email || "Email unavailable"}</span>
          </div>
          <span className="studentBadge"><span className="statusDot" /> Student account</span>
        </section>

        <section className="statsGrid" aria-label="Interview statistics">
          <article className="statCard">
            <div className="statTop"><span>Total completed</span><span className="statIcon green">✓</span></div>
            <strong className="statValue">{completedInterviews.length}</strong>
            <span className="statHint">Completed interviews</span>
          </article>
          <article className="statCard">
            <div className="statTop"><span>Average score</span><span className="statIcon mint">◎</span></div>
            <strong className="statValue">{averageScore === null ? "—" : `${averageScore}%`}</strong>
            <span className="statHint">Across scored interviews</span>
          </article>
          <article className="statCard">
            <div className="statTop"><span>Personal best</span><span className="statIcon lime">↗</span></div>
            <strong className="statValue">{bestScore === null ? "—" : `${bestScore}%`}</strong>
            <span className="statHint">Your highest score</span>
          </article>
          <article className="statCard">
            <div className="statTop"><span>Topics practiced</span><span className="statIcon sage">▤</span></div>
            <strong className="statValue">{new Set(completedInterviews.map((item) => item.topic).filter(Boolean)).size}</strong>
            <span className="statHint">Unique interview topics</span>
          </article>
        </section>

        <section className="panel achievementPanel" aria-label="Achievement badges">
          <div className="panelHeader">
            <div><h2>Achievement badges</h2><p>Unlock badges as you practice and improve.</p></div>
            <div className="badgeHeaderActions"><span className="countBadge">{earnedBadgeCount} / {badgeList.length} earned</span><button type="button" className="viewAllBadges" onClick={() => setShowAllBadges(true)}>View all →</button></div>
          </div>
          <div className="badgePreviewGrid">
            {badgeList.slice(0, 2).map((badge) => <article key={badge.id} className={`achievementCard ${badge.earned ? "isEarned" : "isLocked"}`}>
              <div className="achievementCardTop"><div className="achievementIcon">{badge.icon}</div><span className={`achievementStatus ${badge.earned ? "earnedStatus" : "lockedStatus"}`}>{badge.earned ? "✓ Earned" : "🔒 Locked"}</span></div>
              <h3>{badge.title}</h3><p>{badge.description}</p>
              <div className="achievementCategory">{badge.category}</div>
              <div className="achievementProgressRow"><div className="achievementTrack"><div className="achievementFill" style={{ width: `${Math.min(100, (badge.current / badge.target) * 100)}%` }} /></div><span>{badge.current} / {badge.target}</span></div>
            </article>)}
          </div>
        </section>

        {showAllBadges && <div className="badgesOverlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAllBadges(false); }}>
          <section className="badgesModal" role="dialog" aria-modal="true" aria-labelledby="all-badges-title">
            <div className="badgesModalHeader"><div><p className="eyebrow">YOUR PROGRESS</p><h2 id="all-badges-title">All achievement badges</h2><p>{earnedBadgeCount} of {badgeList.length} badges earned</p></div><button type="button" className="closeBadges" onClick={() => setShowAllBadges(false)} aria-label="Close badges">×</button></div>
            <div className="allBadgesGrid">{badgeList.map((badge) => <article key={badge.id} className={`achievementCard ${badge.earned ? "isEarned" : "isLocked"}`}>
              <div className="achievementCardTop"><div className="achievementIcon">{badge.earned ? badge.icon : "🔒"}</div><span className={`achievementStatus ${badge.earned ? "earnedStatus" : "lockedStatus"}`}>{badge.earned ? "✓ Earned" : "Locked"}</span></div>
              <h3>{badge.title}</h3><p>{badge.description}</p><div className="achievementCategory">{badge.category}</div>
              <div className="achievementProgressRow"><div className="achievementTrack"><div className="achievementFill" style={{ width: `${Math.min(100, (badge.current / badge.target) * 100)}%` }} /></div><span>{badge.current} / {badge.target}</span></div>
            </article>)}</div>
            <p className="badgeDataNote">Badges are based on saved interview and profile data. Communication badges stay locked until a separate communication score is saved.</p>
          </section>
        </div>}

        <section className="panel chartPanel">
          <div className="panelHeader"><div><h2>Performance over time</h2><p>Scores from your saved completed interviews</p></div><span className="countBadge">LIVE DATA</span></div>
          {chartPoints.length === 0 ? <div className="miniEmpty">Your chart will appear after an interview with a saved score and date.</div> : <div className="chartBody">
            <div className="chartLatest"><strong>{chartPoints[chartPoints.length - 1].score}<span>/100</span></strong><small>Latest scored interview</small></div>
            <div className="chartBars">{chartPoints.map((point, index) => <div className="chartColumn" key={point.id} title={`${point.score}/100 · ${formatDate(point.date)}`}><div className="chartBarTrack"><div className="chartBarFill" style={{height: `${Math.max(point.score, 2)}%`}} /></div><strong>{point.score}</strong><small>{point.date.toLocaleDateString("en-IN", {day:"numeric", month:"short"})}</small></div>)}</div>
            {chartPoints.length === 1 && <p className="chartNote">Complete more interviews to see your performance trend.</p>}
          </div>}
        </section>

        <section className="panel latestReviewPanel">
          <div className="panelHeader">
            <div>
              <h2>Latest interview review</h2>
              <p>Open your latest interview report to see all questions, answers, and AI feedback.</p>
            </div>
          </div>
          {!latestInterview ? (
            <div className="miniEmpty">Complete an interview to see your latest review here.</div>
          ) : (
            <div className="latestReviewBody compactLatestReview">
              <div className="latestReviewMeta">
                <span>{latestInterview.topic || "Untitled interview"}</span>
                <span>{latestInterview.difficulty || "Level not set"}</span>
                <strong>{Number.isFinite(Number(latestInterview.score)) ? `${Math.round(Number(latestInterview.score))}/100` : "Score unavailable"}</strong>
              </div>
              <p className="latestReviewHint">
                {latestInterview.summary?.trim()
                  ? "Your interview report is ready, including the saved AI feedback."
                  : "Your saved interview report is ready to view."}
              </p>
              <button
                type="button"
                className="viewReport latestFullReportButton"
                onClick={() => {
                  setSelectedInterview(latestInterview);
                  setTimeout(() => {
                    document.getElementById("selected-interview-report")?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }, 120);
                }}
              >
                View full report ↓
              </button>
            </div>
          )}
        </section>

        <div className="mainGrid">
          <section className="panel historyPanel">
            <div className="panelHeader">
              <div>
                <h2>Interview history</h2>
                <p>Your saved interview results from Firebase</p>
              </div>
              <span className="countBadge">{completedInterviews.length} sessions</span>
            </div>

            <div className="historyFilters">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search topics or feedback..." aria-label="Search interviews" />
              <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)} aria-label="Filter by topic"><option value="all">All topics</option>{topics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}</select>
              <select value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)} aria-label="Filter by difficulty"><option value="all">All levels</option>{difficulties.map((level) => <option key={level} value={level}>{level}</option>)}</select>
              <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest" | "score")} aria-label="Sort interviews"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="score">Highest score</option></select>
            </div>
            {completedInterviews.length === 0 ? (
              <div className="emptyState">
                <div className="emptyIcon">📝</div>
                <h3>Your journey starts here</h3>
                <p>Complete your first mock interview and your results will appear here.</p>
                <button className="primaryButton small" onClick={() => router.push("/")}>Start an interview</button>
              </div>
            ) : filteredInterviews.length === 0 ? (
              <div className="miniEmpty">No interviews match your search or filters.</div>
            ) : (
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr><th>TOPIC</th><th>LEVEL</th><th>DATE</th><th>SCORE</th><th>REPORT</th></tr>
                  </thead>
                  <tbody>
                    {filteredInterviews.map((item) => {
                      const score = Number(item.score);
                      const validScore = Number.isFinite(score) && score >= 0 && score <= 100;
                      return (
                        <tr key={item.id} className="historyRow" onClick={() => { setSelectedInterview(item); setTimeout(() => document.getElementById("selected-interview-report")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setSelectedInterview(item); }}>
                          <td>
                            <div className="topicCell">
                              <span className="topicMark">✦</span>
                              <span>{item.topic || "Untitled interview"}</span>
                            </div>
                          </td>
                          <td><span className="levelBadge">{item.difficulty || "Not specified"}</span></td>
                          <td className="dateCell">{formatDate(item.createdAt)}</td>
                          <td>
                            <span className={`scorePill ${validScore && score >= 70 ? "scoreGood" : validScore && score >= 40 ? "scoreMid" : "scoreLow"}`}>
                              {validScore ? `${Math.round(score)}/100` : "N/A"}
                            </span>
                          </td>
                          <td><button type="button" className="viewReport" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedInterview(item); setTimeout(() => document.getElementById("selected-interview-report")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }}>View report ↗</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <aside className="sideColumn">
            <section className="panel progressPanel">
              <div className="panelHeader">
                <div><h2>Performance</h2><p>Based on your saved scores</p></div>
              </div>
              {averageScore === null ? (
                <div className="miniEmpty">Your performance summary will appear after your first scored interview.</div>
              ) : (
                <>
                  <div className="progressScore">{averageScore}<span>/100</span></div>
                  <div className="progressTrack"><div className="progressFill" style={{ width: `${averageScore}%` }} /></div>
                  <p className="progressCaption">
                    {averageScore >= 80 ? "Excellent progress — keep challenging yourself!" : averageScore >= 60 ? "Good foundation. Keep practicing to improve." : averageScore >= 40 ? "You're building skills. Review feedback and try again." : "Focus on fundamentals and practice one concept at a time."}
                  </p>
                </>
              )}
            </section>

            <section className="panel weakPanel">
              <div className="panelHeader">
                <div><h2>Topics to revisit</h2><p>Lowest average scores first</p></div>
              </div>
              {weakTopics.length === 0 ? (
                <div className="miniEmpty">Complete interviews on different topics to discover where to focus.</div>
              ) : (
                <div className="weakList">
                  {weakTopics.map((item) => (
                    <div className="weakItem" key={item.topic}>
                      <div className="weakTop"><span>{item.topic}</span><strong>{item.average}%</strong></div>
                      <div className="weakTrack"><div className="weakFill" style={{ width: `${item.average}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="tipCard">
              <span className="tipIcon">✧</span>
              <div><strong>Small steps, real growth</strong><p>Read each AI feedback report and practice the concepts you missed before your next round.</p></div>
            </section>
          </aside>
        </div>

        <section className="panel timingPanel" aria-label="Interview timing records">
          <div className="panelHeader">
            <div>
              <h2>Interview Timing</h2>
              <p>Actual time taken for each completed interview</p>
            </div>
            <span className="countBadge">{completedInterviews.length} interviews</span>
          </div>
          {completedInterviews.length === 0 ? (
            <div className="miniEmpty timingEmpty">Complete an interview to see its duration here.</div>
          ) : (
            <div className="timingList">
              {completedInterviews.map((item, index) => (
                <article className="timingItem" key={item.id}>
                  <div className="timingIcon" aria-hidden="true">⏱</div>
                  <div className="timingDetails">
                    <strong>{item.topic || `Interview ${index + 1}`}</strong>
                    <span>{item.interviewType || item.difficulty || "Interview"} · {formatDate(item.createdAt)}</span>
                  </div>
                  <div className="timingDuration">{formatDuration(item.durationSeconds)}</div>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="footer">Made for consistent practice <span>•</span> Keep growing, one interview at a time.</footer>
      </section>

      {selectedInterview && (
        <section className="panel inlineReport" id="selected-interview-report">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">INTERVIEW REVIEW</p>
              <h2>AI feedback report</h2>
              <p>{selectedInterview.topic || "Untitled interview"} · {selectedInterview.difficulty || "Level not set"} · {formatDate(selectedInterview.createdAt)}</p>
            </div>
            <button type="button" className="logoutButton" onClick={() => setSelectedInterview(null)}>Close report ×</button>
          </div>
          <div className="inlineReportBody">
            <div className="feedbackScore">
              <span>Final score</span>
              <strong>
                {Number.isFinite(Number(selectedInterview.score)) &&
                Number(selectedInterview.score) >= 0 &&
                Number(selectedInterview.score) <= 100
                  ? `${Math.round(Number(selectedInterview.score))}/100`
                  : "N/A"}
              </strong>
            </div>
            <div className="feedbackText">
              {selectedInterview.summary?.trim() || "No feedback summary was saved for this interview."}
            </div>
            <section className="questionReview">
              <h3>Question-wise conversation</h3>
              {selectedInterview.conversation?.length ? (
                <div className="conversationList">
                  {selectedInterview.conversation.map((entry, index) => (
                    <article
                      className={`conversationItem ${entry.role === "user" ? "candidateEntry" : "interviewerEntry"}`}
                      key={`${selectedInterview.id}-${index}-${entry.role}`}
                    >
                      <span className="conversationRole">
                        {entry.role === "user" ? "Your answer" : "Interviewer / AI feedback"}
                      </span>
                      <p>{entry.content}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="noConversation">
                  This interview only has a final summary saved. Full question-and-answer history is available for interviews completed after conversation saving was added.
                </p>
              )}
            </section>
            <div className="inlineReportActions">
              <button type="button" className="primaryButton small" onClick={() => router.push("/")}>Practice again</button>
            </div>
          </div>
        </section>
      )}
      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  :global(*) { box-sizing: border-box; }
  :global(body) { margin: 0; background: #f5f8f3; }
  .page { min-height: 100vh; background: #f5f8f3; color: #20372c; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .loadingScreen { min-height: 100vh; display: flex; flex-direction: column; gap: 14px; align-items: center; justify-content: center; background: #f5f8f3; color: #45634f; font-family: Inter, system-ui, sans-serif; }
  .loader { width: 34px; height: 34px; border: 3px solid #dce8dc; border-top-color: #4b805d; border-radius: 50%; animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .topbar { height: 76px; padding: 0 6.5%; display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,.92); border-bottom: 1px solid #e7eee5; }
  .brand { border: 0; background: none; display: flex; align-items: center; gap: 10px; font-size: 22px; font-weight: 800; letter-spacing: -.7px; color: #244b35; cursor: pointer; }
  .brandIcon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 11px; background: #e3f0df; color: #39724c; font-size: 20px; }
  .brandDot { color: #77a66f; }
  .navActions { display: flex; align-items: center; gap: 24px; }
  .navLink { border: 0; background: none; color: #6d7e71; font-size: 14px; font-weight: 600; cursor: pointer; padding: 10px 0; }
  .navLink.active { color: #326b45; }
  .logoutButton { border: 1px solid #dce7da; background: white; border-radius: 10px; padding: 10px 16px; color: #45634f; font-weight: 650; cursor: pointer; }
  .content { width: min(1220px, 88%); margin: 0 auto; padding: 42px 0 24px; }
  .welcomeRow { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 28px; }
  .eyebrow { margin: 0 0 10px; color: #729173; font-size: 11px; letter-spacing: 1.7px; font-weight: 800; }
  h1 { margin: 0; font-size: clamp(26px, 3vw, 36px); line-height: 1.2; letter-spacing: -1.1px; color: #203d2b; }
  h1 span { font-size: .78em; }
  .muted { color: #7a8c7d; font-size: 14px; margin: 11px 0 0; }
  .primaryButton { display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: #477b52; color: white; border: 0; border-radius: 11px; padding: 13px 18px; font-size: 13px; font-weight: 750; box-shadow: 0 5px 12px rgba(57,105,66,.14); cursor: pointer; transition: transform .15s, background .15s; white-space: nowrap; }
  .primaryButton:hover { background: #376944; transform: translateY(-1px); }
  .primaryButton span { font-size: 19px; line-height: 12px; }
  .primaryButton.small { padding: 11px 15px; margin-top: 8px; }
  .errorBox { padding: 12px 15px; border: 1px solid #f1c4bb; background: #fff4f1; color: #9a4236; border-radius: 10px; margin-bottom: 18px; font-size: 13px; }
  .profileStrip { display: flex; align-items: center; gap: 14px; background: white; border: 1px solid #e7eee4; border-radius: 16px; padding: 17px 20px; margin-bottom: 20px; box-shadow: 0 4px 16px rgba(39,75,46,.025); }
  .avatar { display: grid; place-items: center; width: 48px; height: 48px; flex: 0 0 48px; border-radius: 15px; background: #e6f1e1; color: #3d754b; font-size: 20px; font-weight: 800; }
  .profileText { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .profileText strong { font-size: 14px; color: #294a34; }
  .profileText span { color: #849286; font-size: 12px; overflow-wrap: anywhere; }
  .studentBadge { margin-left: auto; display: flex; align-items: center; gap: 8px; background: #f0f7ed; color: #55805a; border-radius: 20px; padding: 8px 11px; font-size: 11px; font-weight: 750; white-space: nowrap; }
  .statusDot { width: 7px; height: 7px; border-radius: 50%; background: #6fa56e; }
  .statsGrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 20px; }
  .statCard { background: white; border: 1px solid #e7eee4; border-radius: 15px; padding: 20px; min-width: 0; box-shadow: 0 4px 16px rgba(39,75,46,.025); }
  .statTop { display: flex; justify-content: space-between; align-items: center; gap: 8px; color: #7a8a7c; font-size: 12px; font-weight: 650; }
  .statIcon { display: grid; place-items: center; width: 31px; height: 31px; border-radius: 10px; font-weight: 800; font-size: 15px; }
  .green { color: #4b8055; background: #eaf5e7; } .mint { color: #39877a; background: #e3f5ef; } .lime { color: #81933d; background: #f1f5dc; } .sage { color: #65846b; background: #edf3eb; }
  .statValue { display: block; font-size: 31px; line-height: 1.2; letter-spacing: -1px; color: #294934; margin-top: 14px; }
  .statHint { display: block; color: #98a398; font-size: 11px; margin-top: 7px; }
  .inlineReport { margin: 20px 0; scroll-margin-top: 28px; }\n  .inlineReportBody { padding: 20px 22px 24px; }\n  .inlineReport .feedbackText { margin-top: 14px; }\n  .inlineReportActions { display:flex; justify-content:flex-end; margin-top:16px; }\n  .latestReviewPanel { margin-bottom: 20px; }\n  .compactLatestReview { display:flex; flex-wrap:wrap; align-items:center; gap:12px; }\n  .compactLatestReview .latestReviewMeta { flex:1 1 100%; margin-bottom:0; }\n  .latestReviewHint { margin:0; color:#819181; font-size:12px; line-height:1.6; flex:1 1 260px; }\n  .latestFullReportButton { flex:0 0 auto; }
  .latestReviewBody { padding: 18px 22px 22px; }
  .latestReviewMeta { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:15px; }
  .latestReviewMeta span,.latestReviewMeta strong { padding:8px 10px; border-radius:8px; background:#f0f6ed; color:#658065; font-size:11px; font-weight:650; }
  .latestReviewMeta strong { margin-left:auto; color:#477b52; background:#e8f4e5; }
  .latestConversation { display:flex; flex-direction:column; gap:10px; }
  .latestReviewBody .conversationItem p { font-size:13px; }
  .latestSummary { margin-top:16px; padding:15px; border:1px solid #e7eee3; border-radius:12px; background:#fbfcfa; }
  .latestSummary h3 { margin:0 0 7px; color:#294a34; font-size:13px; }
  .latestSummary p { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; color:#4e6351; font-size:12px; line-height:1.75; }
  .mainGrid { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(280px, .9fr); gap: 20px; align-items: start; }
  .panel { background: white; border: 1px solid #e7eee4; border-radius: 16px; box-shadow: 0 4px 16px rgba(39,75,46,.025); overflow: hidden; }
  .panelHeader { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 21px 22px; border-bottom: 1px solid #edf1eb; }
  .panelHeader h2 { margin: 0; font-size: 15px; color: #294a34; letter-spacing: -.2px; }
  .panelHeader p { margin: 6px 0 0; color: #94a094; font-size: 11px; }
  .countBadge { border-radius: 20px; padding: 7px 10px; background: #f0f6ed; color: #638064; font-size: 10px; font-weight: 750; white-space: nowrap; }
  .tableWrap { width: 100%; overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; min-width: 560px; text-align: left; }
  th { padding: 13px 20px; color: #a0aaa0; background: #fbfcfa; font-size: 9px; letter-spacing: 1px; font-weight: 800; }
  td { padding: 16px 20px; border-top: 1px solid #f0f3ee; font-size: 12px; color: #687a6b; }
  .topicCell { display: flex; align-items: center; gap: 10px; min-width: 175px; max-width: 260px; color: #3d5943; font-weight: 700; }
  .topicCell > span:last-child { overflow-wrap: anywhere; }
  .topicMark { flex: 0 0 27px; display: grid; place-items: center; width: 27px; height: 27px; border-radius: 9px; background: #edf5e9; color: #608c5d; }
  .levelBadge { display: inline-block; background: #f3f6f1; color: #758775; border-radius: 6px; padding: 6px 8px; font-size: 10px; white-space: nowrap; }
  .dateCell { white-space: nowrap; color: #91a091; }
  .scorePill { display: inline-block; min-width: 57px; text-align: center; border-radius: 7px; padding: 7px 8px; font-size: 11px; font-weight: 800; white-space: nowrap; }
  .scoreGood { color: #34744a; background: #e9f5e8; } .scoreMid { color: #8b7831; background: #faf4df; } .scoreLow { color: #a75d4e; background: #fff0eb; }
  .emptyState { padding: 42px 24px 46px; text-align: center; }
  .emptyIcon { display: grid; place-items: center; width: 54px; height: 54px; margin: 0 auto 14px; border-radius: 17px; background: #edf5e9; font-size: 24px; }
  .emptyState h3 { margin: 0; color: #385940; font-size: 15px; }
  .emptyState p { max-width: 300px; margin: 9px auto 14px; color: #89978a; font-size: 12px; line-height: 1.6; }
  .sideColumn { display: flex; flex-direction: column; gap: 18px; }
  .progressPanel, .weakPanel { padding-bottom: 20px; }
  .progressPanel .panelHeader, .weakPanel .panelHeader { padding-bottom: 17px; }
  .progressScore { padding: 20px 22px 8px; color: #376b43; font-size: 39px; font-weight: 800; letter-spacing: -1.5px; }
  .progressScore span { font-size: 14px; font-weight: 650; color: #94a394; letter-spacing: 0; }
  .progressTrack { margin: 0 22px; height: 8px; border-radius: 20px; background: #edf2ea; overflow: hidden; }
  .progressFill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, #8dbd7d, #477b52); }
  .progressCaption { margin: 13px 22px 0; color: #899789; font-size: 11px; line-height: 1.6; }
  .miniEmpty { margin: 0 22px; padding: 14px; border-radius: 10px; background: #f7faf5; color: #8a9989; font-size: 11px; line-height: 1.6; }
  .weakList { padding: 0 22px; display: flex; flex-direction: column; gap: 16px; }
  .weakTop { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; color: #607461; font-size: 11px; margin-bottom: 8px; }
  .weakTop span { overflow-wrap: anywhere; } .weakTop strong { color: #9c7057; white-space: nowrap; }
  .weakTrack { height: 6px; border-radius: 20px; background: #f0f3ed; overflow: hidden; }
  .weakFill { height: 100%; border-radius: inherit; background: #b6ca8c; }
  .tipCard { display: flex; gap: 12px; padding: 17px; background: #eaf3e5; border: 1px solid #dcebd5; border-radius: 15px; }
  .tipIcon { display: grid; place-items: center; flex: 0 0 30px; height: 30px; border-radius: 10px; background: white; color: #57825b; font-size: 18px; }
  .tipCard strong { color: #416849; font-size: 12px; }
  .tipCard p { color: #789079; font-size: 11px; line-height: 1.6; margin: 6px 0 0; }
  .footer { text-align: center; padding: 30px 0 8px; color: #a0ada0; font-size: 11px; }
  .footer span { padding: 0 7px; color: #8bb181; }
  @media (max-width: 900px) { .statsGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .mainGrid { grid-template-columns: 1fr; } .sideColumn { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); } .tipCard { grid-column: 1 / -1; } }
  @media (max-width: 600px) { .topbar { height: 66px; padding: 0 5%; } .brand { font-size: 19px; } .navActions { gap: 12px; } .navLink { font-size: 12px; } .logoutButton { padding: 8px 10px; font-size: 11px; } .content { width: 90%; padding-top: 30px; } .welcomeRow { align-items: flex-start; flex-direction: column; } .welcomeRow .primaryButton { width: 100%; } .profileStrip { padding: 14px; gap: 10px; } .studentBadge { font-size: 0; padding: 9px; } .studentBadge .statusDot { width: 8px; height: 8px; } .statsGrid { gap: 10px; } .statCard { padding: 15px; } .statValue { font-size: 27px; } .statTop { font-size: 11px; } .sideColumn { display: flex; } .panelHeader { padding: 18px 16px; } .footer { line-height: 1.8; } }

  .timingPanel { margin-top: 20px; }
  .timingList { display: flex; flex-direction: column; }
  .timingItem { display: flex; align-items: center; gap: 14px; padding: 15px 22px; border-bottom: 1px solid #f0f3ee; }
  .timingItem:last-child { border-bottom: 0; }
  .timingIcon { display: grid; place-items: center; width: 40px; height: 40px; flex: 0 0 40px; border-radius: 12px; background: #edf5e9; font-size: 19px; }
  .timingDetails { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 5px; }
  .timingDetails strong { color: #385940; font-size: 12px; overflow-wrap: anywhere; }
  .timingDetails span { color: #94a094; font-size: 10px; }
  .timingDuration { padding: 8px 11px; border-radius: 9px; background: #eaf5e8; color: #34744a; font-size: 12px; font-weight: 800; white-space: nowrap; }
  .timingEmpty { margin: 18px 22px; }
  @media(max-width:600px) { .timingItem { padding: 13px 14px; gap: 10px; } .timingDuration { padding: 7px 8px; font-size: 11px; } }
  .chartPanel { margin-bottom: 20px; }
  .chartBody { padding: 18px 22px 20px; }
  .chartLatest { display:flex; align-items:baseline; gap:10px; margin-bottom:15px; }
  .chartLatest strong { color:#376b43; font-size:30px; letter-spacing:-1px; }
  .chartLatest strong span { color:#94a394; font-size:12px; letter-spacing:0; }
  .chartLatest small,.chartNote { color:#899789; font-size:11px; }
  .chartBars { height:190px; display:flex; align-items:stretch; gap:clamp(8px,2vw,22px); padding:10px 4px 0; overflow-x:auto; }
  .chartColumn { min-width:44px; flex:1; display:flex; flex-direction:column; align-items:center; gap:5px; color:#819181; font-size:10px; }
  .chartBarTrack { width:min(32px,70%); flex:1; display:flex; align-items:flex-end; border-radius:8px 8px 3px 3px; background:#f0f4ed; overflow:hidden; }
  .chartBarFill { width:100%; min-height:3px; background:linear-gradient(180deg,#8fbd7d,#477b52); border-radius:7px 7px 2px 2px; }
  .chartColumn strong { color:#477b52; font-size:10px; }
  .chartColumn small { white-space:nowrap; }
  .historyFilters { display:flex; flex-wrap:wrap; gap:9px; padding:14px 20px; border-bottom:1px solid #edf1eb; background:#fcfdfb; }
  .historyFilters input,.historyFilters select { min-height:37px; border:1px solid #e1e9dd; border-radius:9px; background:white; color:#526b56; padding:0 11px; font:inherit; font-size:11px; }
  .historyFilters input { flex:1; min-width:160px; outline-color:#8ab38a; }
  .historyFilters select { min-width:115px; max-width:190px; }
  .historyRow { cursor:pointer; }
  .historyRow:hover,.historyRow:focus { background:#f7faf5; outline:none; }
  .viewReport { border:1px solid #dce8d9; background:white; color:#477b52; border-radius:8px; padding:7px 9px; font-size:10px; font-weight:750; white-space:nowrap; cursor:pointer; }
  .viewReport:hover { background:#edf5e9; }
  .feedbackOverlay { position:fixed; inset:0; z-index:500; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(22,40,27,.52); backdrop-filter:blur(4px); }
  .feedbackModal { width:min(680px,100%); max-height:85vh; overflow:auto; padding:25px; background:white; border:1px solid #e0ebdc; border-radius:20px; box-shadow:0 25px 80px rgba(20,45,26,.22); }
  .feedbackHeader { display:flex; justify-content:space-between; gap:15px; align-items:flex-start; }
  .feedbackHeader h2 { margin:0; color:#294a34; font-size:23px; }
  .closeFeedback { width:35px; height:35px; border:1px solid #e2eade; border-radius:10px; background:#f8faf6; color:#55745b; font-size:24px; cursor:pointer; }
  .feedbackMeta { display:flex; flex-wrap:wrap; gap:8px; margin:18px 0; }
  .feedbackMeta span { padding:8px 10px; border-radius:8px; background:#f0f6ed; color:#658065; font-size:10px; }
  .feedbackScore { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; margin-bottom:15px; border:1px solid #e7eee3; border-radius:13px; background:#f8fbf6; color:#788a79; font-size:12px; }
  .feedbackScore strong { color:#477b52; font-size:24px; }
  .questionReview{margin-top:18px}.questionReview h3{font-size:14px;color:#294a34;margin:0 0 10px}.conversationList{display:flex;flex-direction:column;gap:9px}.conversationItem{padding:12px 14px;border-radius:10px;border:1px solid #e7eee3;background:#fbfcfa}.conversationItem.candidateEntry{background:#f0f7ed;border-color:#dcebd7}.conversationRole{font-size:10px;font-weight:800;letter-spacing:.3px;color:#638064;text-transform:uppercase}.conversationItem p{margin:6px 0 0;color:#4e6351;font-size:12px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}.noConversation{padding:12px 14px;border-radius:10px;background:#fff8e9;color:#866c36;font-size:12px;line-height:1.7}
  .feedbackText { white-space:pre-wrap; overflow-wrap:anywhere; padding:18px; border:1px solid #edf1e9; border-radius:12px; background:#fbfcfa; color:#4e6351; font-size:13px; line-height:1.8; }
  .feedbackActions { display:flex; justify-content:flex-end; gap:10px; margin-top:18px; }
  @media(max-width:600px) { .historyFilters { padding:12px; } .historyFilters input { flex-basis:100%; } .historyFilters select { flex:1; max-width:none; } .feedbackModal { padding:18px; } .feedbackHeader h2 { font-size:20px; } }
  .achievementPanel { margin-bottom:20px; }
  .badgeHeaderActions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; justify-content:flex-end; }
  .viewAllBadges { border:1px solid #dce8d9; background:#fff; color:#477b52; border-radius:9px; padding:8px 11px; font-size:11px; font-weight:750; cursor:pointer; white-space:nowrap; }
  .viewAllBadges:hover { background:#edf5e9; }
  .badgePreviewGrid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; padding:18px 22px 22px; }
  .achievementCard { min-width:0; border:1px solid #e4ece1; border-radius:14px; padding:15px; background:linear-gradient(145deg,#f2faf3,#fff); }
  .achievementCard.isLocked { border-color:#e4ebf5; background:linear-gradient(145deg,#f5f8fd,#fff); }
  .achievementCardTop { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:12px; }
  .achievementIcon { display:grid; place-items:center; width:43px; height:43px; flex:0 0 43px; border-radius:13px; border:1px solid #cfe5d2; background:#fff; box-shadow:0 2px 7px rgba(50,100,60,.07); font-size:23px; }
  .isLocked .achievementIcon { filter:grayscale(1); opacity:.55; border-color:#dce4ef; background:#f0f3f8; }
  .achievementStatus { border-radius:20px; padding:6px 8px; font-size:10px; font-weight:800; white-space:nowrap; }
  .earnedStatus { background:#ddf7e6; color:#25814b; }
  .lockedStatus { background:#edf2f8; color:#71829a; }
  .achievementCard h3 { margin:0 0 5px; color:#294a34; font-size:13px; font-weight:800; }
  .achievementCard p { min-height:34px; margin:0; color:#758675; font-size:11px; line-height:1.55; }
  .achievementCategory { display:inline-block; margin-top:10px; padding:5px 8px; border-radius:20px; background:#edf5e9; color:#56805a; font-size:10px; font-weight:700; }
  .isLocked .achievementCategory { background:#eef3fa; color:#7b8ba3; }
  .achievementProgressRow { display:flex; align-items:center; gap:9px; margin-top:13px; color:#66816a; font-size:10px; font-weight:800; }
  .achievementTrack { flex:1; height:7px; border-radius:20px; overflow:hidden; background:#e6ece5; }
  .isLocked .achievementTrack { background:#e2e9f2; }
  .achievementFill { height:100%; border-radius:inherit; background:linear-gradient(90deg,#83c58c,#378354); }
  .isLocked .achievementFill { background:#9dbbe8; }
  .badgesOverlay { position:fixed; inset:0; z-index:600; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(25,45,31,.48); backdrop-filter:blur(4px); }
  .badgesModal { width:min(1000px,100%); max-height:88vh; overflow:auto; padding:24px; border:1px solid #e0ebdc; border-radius:20px; background:#fbfdf9; box-shadow:0 24px 80px rgba(20,45,26,.25); }
  .badgesModalHeader { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:18px; }
  .badgesModalHeader .eyebrow { margin:0 0 6px; }
  .badgesModalHeader h2 { margin:0; color:#294a34; font-size:23px; }
  .badgesModalHeader p:last-child { margin:6px 0 0; color:#899789; font-size:12px; }
  .closeBadges { width:36px; height:36px; border:1px solid #dfe9dc; border-radius:10px; background:white; color:#56735b; font-size:25px; line-height:1; cursor:pointer; }
  .allBadgesGrid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:13px; }
  .badgeDataNote { margin:16px 0 0; color:#829082; font-size:11px; line-height:1.6; }
  @media(max-width:850px) { .allBadgesGrid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
  @media(max-width:600px) { .badgePreviewGrid { padding:14px; gap:10px; } .achievementCard { padding:11px; } .achievementCardTop { flex-direction:column; } .achievementCard h3 { font-size:12px; } .achievementCard p { min-height:48px; } .badgeHeaderActions { align-items:flex-end; flex-direction:column; } .allBadgesGrid { grid-template-columns:1fr; } .badgesModal { padding:16px; } .badgesModalHeader h2 { font-size:19px; } }
`;
