"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "../firebase";

type ProfileForm = {
  username: string;
  name: string;
  bio: string;
  college: string;
  degree: string;
  targetRole: string;
  skills: string[];
  portfolio: string;
  photoUrl: string;
  location: string;
  graduationYear: string;
  projectName: string;
  projectDescription: string;
  projectUrl: string;
  achievements: string;
  badges: string[];
  publicProfile: boolean;
};

const DEFAULT_FORM: ProfileForm = {
  username: "",
  name: "",
  bio: "",
  college: "",
  degree: "",
  targetRole: "",
  skills: [],
  portfolio: "",
  photoUrl: "",
  location: "",
  graduationYear: "",
  projectName: "",
  projectDescription: "",
  projectUrl: "",
  achievements: "",
  badges: [],
  publicProfile: true,
};

const BADGE_DEFINITIONS = [
  { id: "first", title: "First Interview", description: "Complete your first mock interview.", icon: "🎯", target: 1, category: "Getting Started" },
  { id: "practice-builder", title: "Practice Builder", description: "Complete 5 mock interviews.", icon: "📘", target: 5, category: "Consistency" },
  { id: "interview-champion", title: "Interview Champion", description: "Complete 10 mock interviews.", icon: "🏆", target: 10, category: "Milestone" },
  { id: "interview-pro", title: "Interview Pro", description: "Complete 25 mock interviews.", icon: "🚀", target: 25, category: "Advanced" },
  { id: "consistent-learner", title: "Consistent Learner", description: "Practice on 5 different days.", icon: "🔥", target: 5, category: "Consistency" },
  { id: "technical-thinker", title: "Technical Thinker", description: "Complete 5 technical interviews.", icon: "💻", target: 5, category: "Technical" },
  { id: "clear-communicator", title: "Clear Communicator", description: "Meet the communication score target across 3 interviews.", icon: "💬", target: 3, category: "Soft Skills" },
  { id: "high-scorer", title: "High Scorer", description: "Score 80% or above in one interview.", icon: "⭐", target: 1, category: "Performance" },
  { id: "excellence-award", title: "Excellence Award", description: "Score 95% or above in one interview.", icon: "💎", target: 1, category: "Performance" },
  { id: "topic-explorer", title: "Topic Explorer", description: "Practice at least 5 different topics.", icon: "🧠", target: 5, category: "Learning" },
  { id: "project-builder", title: "Project Builder", description: "Add a featured project and description.", icon: "🛠️", target: 1, category: "Career Growth" },
  { id: "certification-achiever", title: "Certification Achiever", description: "Add a certification name and evidence link.", icon: "🎓", target: 1, category: "Career Growth" },
];

function getBadgeProgress(count: number, form: ProfileForm) {
  return BADGE_DEFINITIONS.map((badge) => {
    let progress = 0;
    if (badge.id === "first") progress = Math.min(count, 1);
    else if (badge.id === "practice-builder") progress = Math.min(count, 5);
    else if (badge.id === "interview-champion") progress = Math.min(count, 10);
    else if (badge.id === "interview-pro") progress = Math.min(count, 25);
    else if (badge.id === "project-builder") progress = form.projectName.trim() && form.projectDescription.trim() ? 1 : 0;
    // Other badges stay locked until the app saves the required verified activity fields.
    return { ...badge, progress, earned: progress >= badge.target };
  });
}

const SKILL_OPTIONS = [
  "Java", "Python", "C++", "JavaScript", "TypeScript", "DSA",
  "Data Structures", "Algorithms", "SQL", "React", "Next.js",
  "Node.js", "AI/ML", "Cloud", "System Design", "Communication",
];

function makeUsername(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}

function validOptionalUrl(value: string) {
  if (!value.trim()) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function getCompleteness(form: ProfileForm) {
  const checks = [
    Boolean(form.name.trim()),
    Boolean(form.username.trim()),
    Boolean(form.bio.trim()),
    Boolean(form.college.trim()),
    Boolean(form.degree.trim()),
    Boolean(form.targetRole.trim()),
    form.skills.length > 0,
    Boolean(form.photoUrl.trim()),
    Boolean(form.projectName.trim()),
    Boolean(form.projectDescription.trim()),
    Boolean(form.location.trim()),
    Boolean(form.graduationYear.trim()),
    Boolean(form.portfolio.trim()),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export default function PublicProfileEditorPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [form, setForm] = useState<ProfileForm>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [completedInterviewCount, setCompletedInterviewCount] = useState(0);
  const [showAllBadges, setShowAllBadges] = useState(false);

  const profileUrl = useMemo(() => {
    if (typeof window === "undefined" || !form.username) return "";
    return `${window.location.origin}/${form.username}`;
  }, [form.username]);

  const completeness = useMemo(() => getCompleteness(form), [form]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setLoading(false);
        router.replace("/");
        return;
      }

      try {
        const privateRef = doc(db, "users", currentUser.uid);
        const privateSnap = await getDoc(privateRef);
        const privateData = privateSnap.exists() ? privateSnap.data() : {};

        const publicRef = doc(db, "publicProfiles", currentUser.uid);
        const publicSnap = await getDoc(publicRef);
        const publicData = publicSnap.exists() ? publicSnap.data() : {};

        // Count saved interview records. Only completed records count toward interview badges.
        const interviewsSnap = await getDocs(collection(db, "users", currentUser.uid, "interviews"));
        const completedRecords = interviewsSnap.docs.filter((item) => {
          const data = item.data();
          return data.completedAt || data.completed === true || data.status === "completed";
        });
        setCompletedInterviewCount(completedRecords.length);

        const initialName =
          publicData.name ||
          privateData.name ||
          currentUser.displayName ||
          "";

        setForm({
          username: publicData.username || makeUsername(initialName),
          name: initialName,
          bio: publicData.bio || "",
          college: publicData.college || "",
          degree: publicData.degree || "",
          targetRole: publicData.targetRole || "",
          skills: Array.isArray(publicData.skills) ? publicData.skills : [],
          portfolio: publicData.portfolio || "",
          photoUrl: publicData.photoUrl || "",
          location: publicData.location || "",
          graduationYear: publicData.graduationYear || "",
          projectName: publicData.projectName || "",
          projectDescription: publicData.projectDescription || "",
          projectUrl: publicData.projectUrl || "",
          achievements: publicData.achievements || "",
          badges: Array.isArray(publicData.badges)
            ? publicData.badges
                .map((badge: unknown) =>
                  typeof badge === "string"
                    ? badge
                    : badge && typeof badge === "object" && "title" in badge
                      ? String((badge as { title: unknown }).title)
                      : ""
                )
                .filter(Boolean)
            : [],
          publicProfile: publicData.publicProfile !== false,
        });
      } catch (e) {
        console.error(e);
        setError("Could not load your profile. Check your Firebase settings and rules.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  function update<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleSkill(skill: string) {
    setForm((current) => ({
      ...current,
      skills: current.skills.includes(skill)
        ? current.skills.filter((item) => item !== skill)
        : [...current.skills, skill],
    }));
  }


  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      setError("Please sign in first.");
      return;
    }

    setError("");
    setMessage("");

    const username = makeUsername(form.username);
    if (username.length < 3) {
      setError("Username must be at least 3 characters. Use letters, numbers, and hyphens.");
      return;
    }
    if (!form.name.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (
      !validOptionalUrl(form.portfolio) ||
      !validOptionalUrl(form.photoUrl) ||
      !validOptionalUrl(form.projectUrl)
    ) {
      setError("Links must be valid http:// or https:// URLs.");
      return;
    }

    setSaving(true);
    try {
      const usernameQuery = query(
        collection(db, "publicProfiles"),
        where("username", "==", username)
      );
      const usernameResults = await getDocs(usernameQuery);
      const usernameTaken = usernameResults.docs.some((item) => item.id !== user.uid);

      if (usernameTaken) {
        setError("That username is already taken. Try another one.");
        setSaving(false);
        return;
      }

      const automaticBadges = getBadgeProgress(completedInterviewCount, form).map((badge) => ({
        id: badge.id, title: badge.title, description: badge.description, icon: badge.icon,
        level: badge.category, earned: badge.earned, progress: badge.progress, target: badge.target,
      }));
      const publicData = {
        uid: user.uid,
        username,
        name: form.name.trim(),
        bio: form.bio.trim(),
        college: form.college.trim(),
        degree: form.degree.trim(),
        targetRole: form.targetRole.trim(),
        skills: form.skills,
        portfolio: form.portfolio.trim(),
        photoUrl: form.photoUrl.trim(),
        location: form.location.trim(),
        graduationYear: form.graduationYear.trim(),
        projectName: form.projectName.trim(),
        projectDescription: form.projectDescription.trim(),
        projectUrl: form.projectUrl.trim(),
        achievements: form.achievements.trim(),
        badges: automaticBadges,
        completedInterviews: completedInterviewCount,
        publicProfile: form.publicProfile,
        updatedAt: serverTimestamp(),
      };

      // Store only shareable profile fields here. Never put email or private interview transcripts here.
      await setDoc(doc(db, "publicProfiles", user.uid), publicData, { merge: true });

      // Keep the account's private profile/preferences in the user's own document.
      await setDoc(
        doc(db, "users", user.uid),
        {
          name: form.name.trim(),
          username,
          publicProfile: form.publicProfile,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      update("username", username);
      setMessage(
        form.publicProfile
          ? "Profile saved! Your shareable profile is enabled."
          : "Profile saved. Your public profile is private."
      );
    } catch (e) {
      console.error(e);
      setError("Could not save your profile. Check your Firestore rules and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    if (!profileUrl) return;
    try {
      await navigator.clipboard.writeText(profileUrl);
      setMessage("Profile link copied!");
    } catch {
      setError("Could not copy automatically. You can copy the link shown below.");
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f5faf6] p-6 text-[#234b36]">
        <div className="mx-auto max-w-4xl rounded-3xl bg-white p-8 shadow-sm">
          Loading your profile...
        </div>
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="min-h-screen bg-[#f5faf6] px-4 py-8 text-slate-800 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#3b8056]">
              Prepwise
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#183d2a] sm:text-4xl">
              Your professional profile
            </h1>
            <p className="mt-2 max-w-2xl text-slate-600">
              Create a polished profile to share with recruiters and mentors.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="rounded-xl border border-[#d7e7db] bg-white px-4 py-2.5 text-sm font-semibold text-[#285b3d] transition hover:bg-[#edf6ef]"
          >
            ← Back to dashboard
          </button>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <form onSubmit={handleSubmit} className="space-y-6">
            <section className="rounded-3xl border border-[#e0ece3] bg-white p-6 shadow-sm sm:p-8">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-[#183d2a]">Basic information</h2>
                <p className="mt-1 text-sm text-slate-500">Make it easy for people to understand who you are.</p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mb-2 block text-sm font-semibold">Full name *</span>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    placeholder="e.g. Vedika Sharma"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-[#4b9365] focus:ring-4 focus:ring-[#4b9365]/10"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">Profile username *</span>
                  <div className="flex overflow-hidden rounded-xl border border-slate-200 focus-within:border-[#4b9365] focus-within:ring-4 focus-within:ring-[#4b9365]/10">
                    <span className="bg-slate-50 px-3 py-3 text-sm text-slate-500">/</span>
                    <input
                      required
                      minLength={3}
                      maxLength={30}
                      value={form.username}
                      onChange={(e) => update("username", makeUsername(e.target.value))}
                      placeholder="your-name"
                      className="min-w-0 flex-1 px-3 py-3 outline-none"
                    />
                  </div>
                  <span className="mt-1 block text-xs text-slate-500">3–30 characters; letters, numbers, and hyphens.</span>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">Target job role</span>
                  <input
                    value={form.targetRole}
                    onChange={(e) => update("targetRole", e.target.value)}
                    placeholder="AI Engineer / Software Developer"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#4b9365] focus:ring-4 focus:ring-[#4b9365]/10"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">College / university</span>
                  <input
                    value={form.college}
                    onChange={(e) => update("college", e.target.value)}
                    placeholder="Your college name"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#4b9365] focus:ring-4 focus:ring-[#4b9365]/10"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">Degree / course</span>
                  <input
                    value={form.degree}
                    onChange={(e) => update("degree", e.target.value)}
                    placeholder="B.Tech in Computer Engineering"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#4b9365] focus:ring-4 focus:ring-[#4b9365]/10"
                  />
                </label>

                <label className="block sm:col-span-2">
                  <span className="mb-2 block text-sm font-semibold">Professional bio</span>
                  <textarea
                    rows={4}
                    maxLength={500}
                    value={form.bio}
                    onChange={(e) => update("bio", e.target.value)}
                    placeholder="Introduce yourself, your interests, and the kind of problems you enjoy solving..."
                    className="w-full resize-y rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#4b9365] focus:ring-4 focus:ring-[#4b9365]/10"
                  />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-slate-400">{form.bio.length}/500</span>
                    <button
                      type="button"
                      onClick={() => {
                        const role = form.targetRole.trim() || "software development";
                        const skills = form.skills.slice(0, 4).join(", ");
                        const college = form.college.trim() ? ` I am studying at ${form.college.trim()}.` : "";
                        const skillText = skills ? ` I am building my skills in ${skills}.` : "";
                        update("bio", `Aspiring ${role} professional interested in building practical solutions and continuously learning through projects and interview practice.${college}${skillText}`);
                      }}
                      className="rounded-lg border border-[#cfe2d4] px-3 py-1.5 text-xs font-semibold text-[#285b3d] hover:bg-[#edf6ef]"
                    >
                      ✨ Draft bio from my details
                    </button>
                  </div>
                </label>
              </div>
            </section>

            <section className="rounded-3xl border border-[#e0ece3] bg-white p-6 shadow-sm sm:p-8">
              <div className="mb-5">
                <h2 className="text-xl font-bold text-[#183d2a]">Technical skills</h2>
                <p className="mt-1 text-sm text-slate-500">Choose the skills you can honestly discuss in an interview.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {SKILL_OPTIONS.map((skill) => {
                  const selected = form.skills.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      className={`rounded-full border px-3.5 py-2 text-sm font-medium transition ${
                        selected
                          ? "border-[#36764d] bg-[#36764d] text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-[#80b491] hover:bg-[#f2f8f3]"
                      }`}
                    >
                      {selected ? "✓ " : "+ "}{skill}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-slate-500">{form.skills.length} skills selected</p>
            </section>

            <section className="rounded-3xl border border-[#e0ece3] bg-white p-6 shadow-sm sm:p-8">
              <div className="mb-5">
                <h2 className="text-xl font-bold text-[#183d2a]">Profile and project links</h2>
                <p className="mt-1 text-sm text-slate-500">Only add links you want people to see.</p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                {([
                  ["portfolio", "Portfolio website", "https://yourportfolio.com"],
                  ["photoUrl", "Profile photo URL", "https://.../photo.jpg"],
                  ["projectUrl", "Project demo URL (optional)", "https://your-project-demo.com"],
                ] as const).map(([key, label, placeholder]) => (
                  <label key={key} className="block">
                    <span className="mb-2 block text-sm font-semibold">{label}</span>
                    <input
                      type="url"
                      value={form[key]}
                      onChange={(e) => update(key, e.target.value)}
                      placeholder={placeholder}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#4b9365] focus:ring-4 focus:ring-[#4b9365]/10"
                    />
                  </label>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-[#e0ece3] bg-white p-6 shadow-sm sm:p-8">
              <div className="mb-5">
                <h2 className="text-xl font-bold text-[#183d2a]">Career details & featured project</h2>
                <p className="mt-1 text-sm text-slate-500">Add context that helps recruiters understand your goals and work.</p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">Location</span>
                  <input value={form.location} onChange={(e) => update("location", e.target.value)} placeholder="Pune, India" className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#4b9365] focus:ring-4 focus:ring-[#4b9365]/10" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">Graduation year</span>
                  <input value={form.graduationYear} onChange={(e) => update("graduationYear", e.target.value)} placeholder="2028" maxLength={4} inputMode="numeric" className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#4b9365] focus:ring-4 focus:ring-[#4b9365]/10" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-2 block text-sm font-semibold">Featured project name</span>
                  <input value={form.projectName} onChange={(e) => update("projectName", e.target.value)} placeholder="Prepwise AI Mock Interview" className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#4b9365] focus:ring-4 focus:ring-[#4b9365]/10" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-2 block text-sm font-semibold">Project description</span>
                  <textarea rows={3} maxLength={400} value={form.projectDescription} onChange={(e) => update("projectDescription", e.target.value)} placeholder="What does the project do? Mention your contribution and the technologies used." className="w-full resize-y rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#4b9365] focus:ring-4 focus:ring-[#4b9365]/10" />
                  <span className="mt-1 block text-right text-xs text-slate-400">{form.projectDescription.length}/400</span>
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-2 block text-sm font-semibold">Achievements and certifications</span>
                  <textarea rows={3} maxLength={500} value={form.achievements} onChange={(e) => update("achievements", e.target.value)} placeholder="Hackathons, certifications, awards, or milestones. Add only achievements you have actually earned." className="w-full resize-y rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#4b9365] focus:ring-4 focus:ring-[#4b9365]/10" />
                  <span className="mt-1 block text-right text-xs text-slate-400">{form.achievements.length}/500</span>
                </label>
              </div>
            </section>

            <section className="rounded-3xl border border-[#e0ece3] bg-white p-6 shadow-sm sm:p-8">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-[#183d2a]">Achievement badges</h2>
                  <p className="mt-1 text-sm text-slate-500">Your badges unlock automatically from saved activity.</p>
                </div>
                <span className="rounded-full bg-[#edf7ef] px-3 py-1 text-xs font-bold text-[#36764d]">12 badges</span>
              </div>
              {(() => {
                const badges = getBadgeProgress(completedInterviewCount, form);
                const earnedCount = badges.filter((badge) => badge.earned).length;
                return (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      {badges.slice(0, 2).map((badge) => (
                        <div key={badge.id} className={`min-w-0 rounded-2xl border p-3 sm:p-4 ${badge.earned ? "border-[#cce4d2] bg-gradient-to-br from-[#f0fbf3] to-white" : "border-[#e2eaf2] bg-gradient-to-br from-[#f7faff] to-white"}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-xl shadow-sm ${badge.earned ? "border-[#b8dfc3] bg-white" : "border-[#dbe7f7] bg-[#eaf2ff] text-[#a9c5f0] grayscale"}`}>{badge.earned ? badge.icon : "🔒"}</div>
                            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${badge.earned ? "bg-[#dcf7e6] text-[#267448]" : "bg-[#edf2f8] text-[#6b819b]"}`}>{badge.earned ? "✓ Earned" : "🔒 Locked"}</span>
                          </div>
                          <h3 className="mt-3 text-sm font-bold text-[#183d2a]">{badge.title}</h3>
                          <p className="mt-1 min-h-10 text-xs leading-4 text-slate-600">{badge.description}</p>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${badge.earned ? "bg-[#36a269]" : "bg-[#9dbce8]"}`} style={{ width: `${Math.round((badge.progress / badge.target) * 100)}%` }} /></div>
                          <p className="mt-1 text-right text-xs font-semibold text-slate-500">{badge.progress} / {badge.target}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#e8f0e9] pt-4">
                      <p className="text-sm text-slate-500"><span className="font-semibold text-[#285b3d]">{earnedCount} of 12 earned</span> · {completedInterviewCount} completed interviews detected</p>
                      <button type="button" onClick={() => setShowAllBadges(true)} className="rounded-xl border border-[#cfe2d4] bg-white px-4 py-2.5 text-sm font-semibold text-[#285b3d] transition hover:bg-[#edf6ef]">View all badges →</button>
                    </div>
                  </>
                );
              })()}
            </section>

            {showAllBadges && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="all-badges-title" onClick={(event) => { if (event.target === event.currentTarget) setShowAllBadges(false); }}>
                <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-[#f8fbf8] shadow-2xl">
                  <div className="flex items-start justify-between gap-4 border-b border-[#e0ece3] bg-white p-5 sm:p-6">
                    <div>
                      <h2 id="all-badges-title" className="text-xl font-bold text-[#183d2a] sm:text-2xl">All achievement badges</h2>
                      <p className="mt-1 text-sm text-slate-500">Earn badges by completing real activities in Prepwise.</p>
                    </div>
                    <button type="button" aria-label="Close all badges" onClick={() => setShowAllBadges(false)} className="rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-600 hover:bg-slate-50">✕</button>
                  </div>
                  <div className="overflow-y-auto p-4 sm:p-6">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {getBadgeProgress(completedInterviewCount, form).map((badge) => (
                        <div key={badge.id} className={`rounded-2xl border p-4 ${badge.earned ? "border-[#cce4d2] bg-gradient-to-br from-[#f0fbf3] to-white" : "border-[#e2eaf2] bg-gradient-to-br from-[#f7faff] to-white"}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border text-2xl shadow-sm ${badge.earned ? "border-[#b8dfc3] bg-white" : "border-[#dbe7f7] bg-[#eaf2ff] text-[#a9c5f0] grayscale"}`}>{badge.earned ? badge.icon : "🔒"}</div>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badge.earned ? "bg-[#dcf7e6] text-[#267448]" : "bg-[#edf2f8] text-[#6b819b]"}`}>{badge.earned ? "✓ Earned" : "🔒 Locked"}</span>
                          </div>
                          <h3 className="mt-3 font-bold text-[#183d2a]">{badge.title}</h3>
                          <p className="mt-1 min-h-10 text-sm leading-5 text-slate-600">{badge.description}</p>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${badge.earned ? "bg-[#36a269]" : "bg-[#9dbce8]"}`} style={{ width: `${Math.round((badge.progress / badge.target) * 100)}%` }} /></div>
                          <p className="mt-1.5 text-right text-xs font-semibold text-slate-500">{badge.progress} / {badge.target}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <section className="rounded-3xl border border-[#e0ece3] bg-white p-6 shadow-sm sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-[#183d2a]">Public profile</h2>
                  <p className="mt-1 max-w-xl text-sm text-slate-500">
                    When enabled, anyone with your profile link can see the information entered here.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.publicProfile}
                  onClick={() => update("publicProfile", !form.publicProfile)}
                  className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition ${form.publicProfile ? "bg-[#36764d]" : "bg-slate-300"}`}
                >
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${form.publicProfile ? "left-6" : "left-1"}`} />
                </button>
              </div>
              <p className={`mt-3 text-sm font-semibold ${form.publicProfile ? "text-[#36764d]" : "text-slate-500"}`}>
                {form.publicProfile ? "Public — your profile can be shared" : "Private — your profile page is hidden"}
              </p>
            </section>

            {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            {message && <div role="status" className="rounded-xl border border-[#cce4d2] bg-[#edf7ef] px-4 py-3 text-sm text-[#285b3d]">{message}</div>}

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-[#36764d] px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-[#285b3d] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving profile..." : "Save profile"}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl border border-slate-200 bg-white px-6 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Print / Save as PDF
              </button>
              {form.publicProfile && profileUrl && (
                <button
                  type="button"
                  onClick={copyLink}
                  className="rounded-xl border border-[#cfe2d4] bg-white px-6 py-3 font-semibold text-[#285b3d] transition hover:bg-[#edf6ef]"
                >
                  Copy profile link
                </button>
              )}
            </div>
          </form>

          <aside className="h-fit rounded-3xl border border-[#dceade] bg-gradient-to-br from-[#e5f3e8] via-white to-white p-6 shadow-sm lg:sticky lg:top-6">
            {form.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.photoUrl} alt="Profile preview" className="mb-5 h-16 w-16 rounded-2xl object-cover shadow-sm" />
            ) : (
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#36764d] text-2xl font-bold text-white shadow-sm">
                {(form.name.trim()[0] || "P").toUpperCase()}
              </div>
            )}
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#36764d]">Profile preview</p>
            <div className="mt-4 rounded-xl bg-white/80 p-3 ring-1 ring-[#d7e7db]">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-600">Profile completeness</span>
                <span className="text-[#285b3d]">{completeness}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e2eee5]">
                <div className="h-full rounded-full bg-[#36764d] transition-all" style={{ width: `${completeness}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-500">{completeness === 100 ? "Great! Your profile is ready to share." : "Add missing details to make your profile stronger."}</p>
            </div>
            <h2 className="mt-2 break-words text-2xl font-bold text-[#183d2a]">{form.name || "Your Name"}</h2>
            <p className="mt-1 text-sm font-medium text-[#36764d]">{form.targetRole || "Your target role"}</p>
            <p className="mt-2 text-sm text-slate-500">{[form.college, form.degree, form.graduationYear ? `Class of ${form.graduationYear}` : "", form.location].filter(Boolean).join(" • ") || "College, degree, graduation year, and location"}</p>
            <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{form.bio || "Your professional bio will appear here."}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {form.skills.length ? form.skills.slice(0, 8).map((skill) => (
                <span key={skill} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#285b3d] ring-1 ring-[#d7e7db]">{skill}</span>
              )) : <span className="text-sm text-slate-400">Your selected skills appear here.</span>}
              {form.skills.length > 8 && <span className="self-center text-xs text-slate-500">+{form.skills.length - 8} more</span>}
            </div>
            {form.projectName && (
              <div className="mt-5 rounded-xl bg-white/80 p-3 ring-1 ring-[#d7e7db]">
                <p className="text-xs font-bold uppercase tracking-wide text-[#36764d]">Featured project</p>
                <p className="mt-1 text-sm font-bold text-[#183d2a]">{form.projectName}</p>
                {form.projectDescription && <p className="mt-1 text-xs leading-5 text-slate-600">{form.projectDescription}</p>}
              </div>
            )}
            <div className="mt-5">
              <p className="text-xs font-bold uppercase tracking-wide text-[#36764d]">Interview badges</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  { title: "First Interview", icon: "🎯", earned: completedInterviewCount >= 1 },
                  { title: "5 Interviews", icon: "📘", earned: completedInterviewCount >= 5 },
                  { title: "10 Interviews", icon: "🏆", earned: completedInterviewCount >= 10 },
                ].map((badge) => (
                  <span key={badge.title} className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${badge.earned ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-slate-50 text-slate-500 ring-slate-200"}`}>
                    {badge.earned ? badge.icon : "🔒"} {badge.title}{badge.earned ? " · Earned" : " · Locked"}
                  </span>
                ))}
              </div>
            </div>
            {form.achievements && (
              <div className="mt-4">
                <p className="text-xs font-bold uppercase tracking-wide text-[#36764d]">Achievements</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{form.achievements}</p>
              </div>
            )}
            {form.publicProfile && profileUrl && (
              <div className="mt-6 border-t border-[#dceade] pt-4">
                <p className="text-xs font-semibold text-slate-500">YOUR SHAREABLE LINK</p>
                <p className="mt-1 break-all text-sm text-[#285b3d]">{profileUrl}</p>
              </div>
            )}
            <p className="mt-5 text-xs leading-5 text-slate-500">
              Privacy tip: never add passwords, private interview transcripts, or information you do not want to share.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
