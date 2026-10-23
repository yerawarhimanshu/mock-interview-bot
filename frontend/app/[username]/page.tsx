"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";

type Badge = {
  id?: string;
  title: string;
  description?: string;
  icon?: string;
  level?: string;
  earned?: boolean;
  progress?: number;
  target?: number;
};

type PublicProfile = {
  uid?: string;
  username?: string;
  name?: string;
  bio?: string;
  college?: string;
  degree?: string;
  targetRole?: string;
  skills?: string[];
  photoUrl?: string;
  location?: string;
  graduationYear?: string;
  projectName?: string;
  projectDescription?: string;
  projectUrl?: string;
  portfolio?: string;
  achievements?: string;
  publicProfile?: boolean;
  completedInterviews?: number;
  badges?: Array<Badge | string>;
};

const DEFAULT_BADGES: Badge[] = [
  { id: "first", title: "First Interview", description: "Complete your first mock interview.", icon: "🎯", level: "Getting Started", target: 1 },
  { id: "practice-builder", title: "Practice Builder", description: "Complete 5 mock interviews.", icon: "📘", level: "Consistency", target: 5 },
  { id: "interview-champion", title: "Interview Champion", description: "Complete 10 mock interviews.", icon: "🏆", level: "Milestone", target: 10 },
  { id: "interview-pro", title: "Interview Pro", description: "Complete 25 mock interviews.", icon: "🚀", level: "Advanced", target: 25 },
  { id: "consistent-learner", title: "Consistent Learner", description: "Practice on 5 different days.", icon: "🔥", level: "Consistency", target: 5 },
  { id: "technical-thinker", title: "Technical Thinker", description: "Complete 5 technical interviews.", icon: "💻", level: "Technical", target: 5 },
  { id: "clear-communicator", title: "Clear Communicator", description: "Meet the communication score target across 3 interviews.", icon: "💬", level: "Soft Skills", target: 3 },
  { id: "high-scorer", title: "High Scorer", description: "Score 80% or above in one interview.", icon: "⭐", level: "Performance", target: 1 },
  { id: "excellence-award", title: "Excellence Award", description: "Score 95% or above in one interview.", icon: "💎", level: "Performance", target: 1 },
  { id: "topic-explorer", title: "Topic Explorer", description: "Practice at least 5 different topics.", icon: "🧠", level: "Learning", target: 5 },
  { id: "project-builder", title: "Project Builder", description: "Add a featured project and description.", icon: "🛠️", level: "Career Growth", target: 1 },
  { id: "certification-achiever", title: "Certification Achiever", description: "Add certification details and evidence.", icon: "🎓", level: "Career Growth", target: 1 },
];

function asBadge(value: Badge | string, index: number): Badge {
  if (typeof value === "string") {
    return { id: `legacy-${index}`, title: value, description: "Achievement shared by the profile owner.", icon: "🏅", earned: true };
  }
  return { ...value, id: value.id || `badge-${index}`, earned: value.earned === true };
}

export default function PublicInterviewProfilePage() {
  const params = useParams<{ username: string }>();
  const username = String(params.username || "").trim().toLowerCase();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      setLoading(true);
      setNotFound(false);
      try {
        const profilesQuery = query(
          collection(db, "publicProfiles"),
          where("username", "==", username),
          where("publicProfile", "==", true)
        );
        const result = await getDocs(profilesQuery);
        const match = result.docs[0];
        if (!match) {
          if (!cancelled) { setProfile(null); setNotFound(true); }
          return;
        }
        if (!cancelled) setProfile(match.data() as PublicProfile);
      } catch (error) {
        console.error("Could not load public profile:", error);
        if (!cancelled) { setProfile(null); setNotFound(true); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (!username) {
      setProfile(null); setNotFound(true); setLoading(false);
    } else {
      void loadProfile();
    }
    return () => { cancelled = true; };
  }, [username]);

  async function copyProfileLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyMessage("Profile link copied!");
      window.setTimeout(() => setCopyMessage(""), 2500);
    } catch {
      setCopyMessage("Copy the URL from your browser address bar.");
    }
  }

  if (loading) return (
    <main className="min-h-screen bg-[#f4f8f5] p-5 text-[#183d2a]">
      <div className="mx-auto max-w-5xl animate-pulse rounded-3xl bg-white p-8 shadow-sm">Loading Prepwise profile…</div>
    </main>
  );

  if (notFound || !profile) return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f8f5] px-5">
      <div className="max-w-md rounded-3xl border border-[#e0ece3] bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#e8f4eb] text-3xl">🔒</div>
        <h1 className="mt-4 text-2xl font-bold text-[#183d2a]">Profile unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">This profile does not exist or its owner has made it private.</p>
        <a href="/" className="mt-6 inline-flex rounded-xl bg-[#36764d] px-5 py-3 font-semibold text-white hover:bg-[#285b3d]">Go to Prepwise</a>
      </div>
    </main>
  );

  const badges = (profile.badges || []).map(asBadge);
  const earnedBadges = badges.filter((badge) => badge.earned);
  const interviewCount = Number(profile.completedInterviews || 0);
  const displayBadges = badges.length ? badges : DEFAULT_BADGES.map((badge) => ({ ...badge, earned: false }));
  const initials = (profile.name || "P").trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
  const details = [profile.college, profile.degree, profile.graduationYear ? `Class of ${profile.graduationYear}` : "", profile.location].filter(Boolean);

  return (
    <main className="min-h-screen bg-[#f4f8f5] text-slate-800">
      <nav className="sticky top-0 z-10 border-b border-[#e0ece3] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <a href="/" className="flex items-center gap-3 font-bold text-[#183d2a]">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#36764d] text-lg text-white">P</span>
            <span>PREPWISE <span className="block text-xs font-medium text-slate-500">Professional profile</span></span>
          </a>
          <button onClick={copyProfileLink} className="rounded-xl border border-[#cfe2d4] bg-white px-4 py-2.5 text-sm font-semibold text-[#285b3d] transition hover:bg-[#edf6ef]">↗ Share profile</button>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-10">
        <section className="overflow-hidden rounded-3xl border border-[#e0ece3] bg-white shadow-sm">
          <div className="h-28 bg-gradient-to-r from-[#dcefe1] via-[#f1f8f2] to-[#dcebe5] sm:h-36" />
          <div className="px-5 pb-7 sm:px-9">
            <div className="-mt-12 flex flex-wrap items-end justify-between gap-4">
              {profile.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.photoUrl} alt={`${profile.name || "User"} profile`} className="h-24 w-24 rounded-3xl border-4 border-white bg-white object-cover shadow-sm" />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-3xl border-4 border-white bg-[#36764d] text-2xl font-bold text-white shadow-sm">{initials || "P"}</div>
              )}
              <span className="mb-1 inline-flex items-center gap-2 rounded-full bg-[#edf7ef] px-3 py-1.5 text-xs font-bold text-[#285b3d]"><span className="h-2 w-2 rounded-full bg-[#36764d]" /> Public profile</span>
            </div>
            <h1 className="mt-4 break-words text-3xl font-bold tracking-tight text-[#183d2a] sm:text-4xl">{profile.name || "Prepwise Learner"}</h1>
            <p className="mt-2 text-lg font-semibold text-[#36764d]">{profile.targetRole || "Aspiring professional"}</p>
            {details.length > 0 && <p className="mt-2 text-sm text-slate-600">{details.join(" · ")}</p>}
            {profile.bio && <p className="mt-4 max-w-3xl whitespace-pre-wrap leading-7 text-slate-700">{profile.bio}</p>}
            {copyMessage && <p role="status" className="mt-3 text-sm font-semibold text-[#285b3d]">{copyMessage}</p>}
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-[#e0ece3] bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Completed interviews</p><p className="mt-2 text-3xl font-bold text-[#183d2a]">{interviewCount}</p></div>
          <div className="rounded-2xl border border-[#e0ece3] bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Badges earned</p><p className="mt-2 text-3xl font-bold text-[#183d2a]">{earnedBadges.length}</p></div>
          <div className="rounded-2xl border border-[#e0ece3] bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Skills listed</p><p className="mt-2 text-3xl font-bold text-[#183d2a]">{(profile.skills || []).length}</p></div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl border border-[#e0ece3] bg-white p-5 shadow-sm sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-xl font-bold text-[#183d2a]">Badges & achievements</h2><p className="mt-1 text-sm text-slate-600">Earned milestones and achievements shared on this profile.</p></div>
              <span className="rounded-full bg-[#edf7ef] px-3 py-1.5 text-sm font-bold text-[#285b3d]">{earnedBadges.length} earned</span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {displayBadges.map((badge, index) => {
                const target = Math.max(1, Number(badge.target || 1));
                const progress = Math.min(target, Math.max(0, Number(badge.progress ?? (badge.earned ? target : 0))));
                return <div key={badge.id || index} className={`rounded-2xl border p-4 transition ${badge.earned ? "border-[#cce4d2] bg-gradient-to-br from-[#effaf2] to-white shadow-sm" : "border-[#e0e9f5] bg-gradient-to-br from-[#f5f9ff] to-white"}`}>
                  <div className="flex items-start justify-between gap-2"><div className={`flex h-14 w-14 items-center justify-center rounded-2xl border text-2xl shadow-sm ${badge.earned ? "border-[#b9dec4] bg-white" : "border-[#dbe7f7] bg-[#eaf2ff] grayscale opacity-70"}`}>{badge.earned ? (badge.icon || "🏅") : "🔒"}</div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badge.earned ? "bg-[#dcf7e6] text-[#267448]" : "bg-[#edf2f8] text-[#6b819b]"}`}>{badge.earned ? "✓ Earned" : "🔒 Locked"}</span></div>
                  <h3 className="mt-3 font-bold text-[#183d2a]">{badge.title}</h3><p className="mt-1 min-h-10 text-sm leading-5 text-slate-600">{badge.description || "Achievement milestone."}</p>
                  {badge.level && <span className="mt-2 inline-flex rounded-full bg-[#edf7ef] px-3 py-1 text-xs font-semibold text-[#36764d]">{badge.level}</span>}
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${badge.earned ? "bg-[#36a269]" : "bg-[#9dbce8]"}`} style={{ width: `${Math.round(progress / target * 100)}%` }} /></div><p className="mt-1.5 text-right text-xs font-semibold text-slate-500">{progress} / {target}</p>
                </div>;
              })}
            </div>
            {earnedBadges.length === 0 && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">No earned badges yet. Keep practicing to unlock your first milestone.</p>}
          </div>

          <div className="space-y-6">
            <section className="rounded-3xl border border-[#e0ece3] bg-white p-5 shadow-sm sm:p-7">
              <h2 className="text-xl font-bold text-[#183d2a]">Technical skills</h2>
              <p className="mt-1 text-sm text-slate-600">Skills selected by the profile owner.</p>
              <div className="mt-4 flex flex-wrap gap-2">{(profile.skills || []).length ? profile.skills?.map((skill) => <span key={skill} className="rounded-full bg-[#edf7ef] px-3 py-1.5 text-sm font-medium text-[#285b3d] ring-1 ring-[#d7e7db]">{skill}</span>) : <p className="text-sm text-slate-500">Skills have not been added yet.</p>}</div>
            </section>

            {profile.projectName && <section className="rounded-3xl border border-[#e0ece3] bg-white p-5 shadow-sm sm:p-7">
              <h2 className="text-xl font-bold text-[#183d2a]">Featured project</h2>
              <p className="mt-3 font-semibold text-[#183d2a]">{profile.projectName}</p>
              {profile.projectDescription && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{profile.projectDescription}</p>}
              {profile.projectUrl && <a href={profile.projectUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-xl bg-[#36764d] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#285b3d]">View project ↗</a>}
            </section>}

            {(profile.portfolio || profile.achievements) && <section className="rounded-3xl border border-[#e0ece3] bg-white p-5 shadow-sm sm:p-7">
              {profile.portfolio && <p><span className="font-semibold text-[#183d2a]">Portfolio: </span><a href={profile.portfolio} target="_blank" rel="noreferrer" className="break-all text-sm font-medium text-[#36764d] underline">Open portfolio ↗</a></p>}
              {profile.achievements && <div className={profile.portfolio ? "mt-5" : ""}><h2 className="text-xl font-bold text-[#183d2a]">Other achievements</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{profile.achievements}</p></div>}
            </section>}
          </div>
        </section>

        <footer className="py-8 text-center text-xs text-slate-500">Prepwise achievements reflect activity and information shared by the profile owner.</footer>
      </div>
    </main>
  );
}
