/**
 * Prepwise badge engine
 *
 * This is a client-side badge calculator for displaying achievements.
 * For tamper-resistant awards, validate the same rules on a trusted backend.
 */

export type InterviewRecord = {
  id?: string;
  completed?: boolean;
  status?: string;
  score?: number | string;
  percentage?: number | string;
  topic?: string;
  category?: string;
  createdAt?: unknown;
  completedAt?: unknown;
  date?: unknown;
};

export type Badge = {
  id: string;
  title: string;
  description: string;
  icon: string;
  level: "Beginner" | "Intermediate" | "Advanced" | "Expert";
  earned: boolean;
  progress: number;
  target: number;
  earnedAtLabel?: string;
};

export type BadgeStats = {
  completedInterviews: number;
  averageScore: number;
  bestScore: number;
  differentTopics: number;
  activeDays: number;
  scoreImproved: boolean;
};

function numberScore(record: InterviewRecord): number | null {
  const raw = record.score ?? record.percentage;
  if (raw === undefined || raw === null || raw === "") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  // Supports either a percentage (e.g. 85) or a decimal score (e.g. 0.85).
  const normalized = parsed >= 0 && parsed <= 1 ? parsed * 100 : parsed;
  return Math.max(0, Math.min(100, normalized));
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const toDate = (value as { toDate?: () => Date }).toDate;
    if (typeof toDate === "function") {
      const result = toDate();
      return result instanceof Date && !Number.isNaN(result.getTime()) ? result : null;
    }
  }
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isCompleted(record: InterviewRecord) {
  return record.completed === true ||
    record.status?.toLowerCase() === "completed" ||
    // Older records may not have a status flag but have a score.
    numberScore(record) !== null;
}

export function calculateBadgeStats(records: InterviewRecord[]): BadgeStats {
  const completed = records.filter(isCompleted);
  const scores = completed
    .map(numberScore)
    .filter((score): score is number => score !== null);
  const topics = new Set(
    completed
      .map((record) => (record.topic || record.category || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const activeDaysSet = new Set(
    completed
      .map((record) => asDate(record.completedAt ?? record.createdAt ?? record.date))
      .filter((date): date is Date => date !== null)
      .map((date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`)
  );

  const orderedScores = completed
    .map((record) => ({
      date: asDate(record.completedAt ?? record.createdAt ?? record.date),
      score: numberScore(record),
    }))
    .filter((item): item is { date: Date; score: number } => item.date !== null && item.score !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const scoreImproved =
    orderedScores.length >= 2 &&
    orderedScores[orderedScores.length - 1].score > orderedScores[0].score;

  return {
    completedInterviews: completed.length,
    averageScore: scores.length
      ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
      : 0,
    bestScore: scores.length ? Math.round(Math.max(...scores)) : 0,
    differentTopics: topics.size,
    activeDays: activeDaysSet.size,
    scoreImproved,
  };
}

export function calculateBadges(
  records: InterviewRecord[],
  options?: { profileComplete?: boolean }
): { badges: Badge[]; stats: BadgeStats; level: Badge["level"] } {
  const stats = calculateBadgeStats(records);
  const profileComplete = Boolean(options?.profileComplete);

  const definitions: Omit<Badge, "earned" | "progress">[] = [
    { id: "profile-ready", title: "Profile Ready", description: "Complete your profile basics.", icon: "🌱", level: "Beginner", target: 1 },
    { id: "first-interview", title: "First Step", description: "Complete your first mock interview.", icon: "🎯", level: "Beginner", target: 1 },
    { id: "three-interviews", title: "Quick Learner", description: "Complete 3 mock interviews.", icon: "📚", level: "Beginner", target: 3 },
    { id: "five-interviews", title: "Getting Better", description: "Complete 5 mock interviews.", icon: "💪", level: "Beginner", target: 5 },
    { id: "high-scorer", title: "High Scorer", description: "Score 80% or above in at least one interview.", icon: "⭐", level: "Intermediate", target: 80 },
    { id: "ten-interviews", title: "Interview Enthusiast", description: "Complete 10 mock interviews.", icon: "🔥", level: "Intermediate", target: 10 },
    { id: "topic-explorer", title: "Skill Explorer", description: "Practice 5 different topics.", icon: "🧠", level: "Intermediate", target: 5 },
    { id: "improving", title: "Improving Mindset", description: "Improve from your first recorded score to your latest.", icon: "📈", level: "Intermediate", target: 1 },
    { id: "excellence", title: "Excellence", description: "Score 95% or above in at least one interview.", icon: "💎", level: "Advanced", target: 95 },
    { id: "seven-days", title: "Consistency Master", description: "Complete interviews on 7 different days.", icon: "🚀", level: "Advanced", target: 7 },
    { id: "twenty-five-interviews", title: "Interview Champion", description: "Complete 25 mock interviews.", icon: "🏆", level: "Advanced", target: 25 },
    { id: "fifty-interviews", title: "Interview Expert", description: "Complete 50 mock interviews.", icon: "👑", level: "Expert", target: 50 },
  ];

  const valueFor = (id: string) => {
    switch (id) {
      case "profile-ready": return profileComplete ? 1 : 0;
      case "first-interview": return stats.completedInterviews;
      case "three-interviews":
      case "five-interviews":
      case "ten-interviews":
      case "twenty-five-interviews":
      case "fifty-interviews": return stats.completedInterviews;
      case "high-scorer": return stats.bestScore;
      case "topic-explorer": return stats.differentTopics;
      case "improving": return stats.scoreImproved ? 1 : 0;
      case "excellence": return stats.bestScore;
      case "seven-days": return stats.activeDays;
      default: return 0;
    }
  };

  const badges: Badge[] = definitions.map((definition) => {
    const value = valueFor(definition.id);
    const earned = value >= definition.target;
    return {
      ...definition,
      earned,
      progress: Math.max(0, Math.min(100, Math.round((value / definition.target) * 100))),
    };
  });

  const earnedBadges = badges.filter((badge) => badge.earned);
  const level: Badge["level"] =
    earnedBadges.some((badge) => badge.level === "Expert") ? "Expert" :
    earnedBadges.some((badge) => badge.level === "Advanced") ? "Advanced" :
    earnedBadges.some((badge) => badge.level === "Intermediate") ? "Intermediate" :
    "Beginner";

  return { badges, stats, level };
}
