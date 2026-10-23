"use client";

import React, { useState, useRef, useEffect } from "react";
import AuthForm from "../components/AuthForm";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth, db } from "./firebase";
import { addDoc, collection, serverTimestamp, Timestamp } from "firebase/firestore";

interface Message {
  role: "bot" | "user";
  content: string;
}

interface FinalReport {
  score: number;
  summary: string;
}

const BACKEND_URL = "https://mock-interview-bot-b57o.onrender.com/api/interview";

export default function MockInterviewApp() {
  const [selectedType, setSelectedType] = useState("Technical Interview");
  const typeToTopic: Record<string, string> = {
    "Technical Interview": "DSA (Data Structures & Algorithms)",
    "HR Interview": "HR and common interview questions",
    "Coding Interview": "Coding and problem solving",
    "Behavioral Interview": "Behavioral and situational interview questions",
  };
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [interviewStartedAt, setInterviewStartedAt] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const interviewStartedAtRef = useRef<Date | null>(null);



  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const requestedType = new URLSearchParams(window.location.search).get("type");
    if (requestedType && typeToTopic[requestedType]) setSelectedType(requestedType);
  }, []);

  const [topic, setTopic] = useState(typeToTopic["Technical Interview"]);
  useEffect(() => {
    setTopic(typeToTopic[selectedType] || typeToTopic["Technical Interview"]);
  }, [selectedType]);

  const [difficulty, setDifficulty] = useState("Junior / Entry-Level");
  const [totalQuestions, setTotalQuestions] = useState(3);
  const [isInterviewStarted, setIsInterviewStarted] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  // Update the visible timer once per second while an interview is active.
  useEffect(() => {
    if (!isInterviewStarted || isFinished || !interviewStartedAt) return;

    const updateElapsed = () => {
      setElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - interviewStartedAt.getTime()) / 1000))
      );
    };

    updateElapsed();
    const timerId = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timerId);
  }, [isInterviewStarted, isFinished, interviewStartedAt]);


  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(1);
  const [report, setReport] = useState<FinalReport | null>(null);

  const [isDoubtDrawerOpen, setIsDoubtDrawerOpen] = useState(false);
  const [doubtMessages, setDoubtMessages] = useState<Message[]>([
    {
      role: "bot",
      content:
        "Hi! I am your Interview Practice Mentor. Have any doubts or want tips to improve your answers? Ask me anything!",
    },
  ]);
  const [doubtInput, setDoubtInput] = useState("");
  const [isDoubtLoading, setIsDoubtLoading] = useState(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const doubtEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    doubtEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [doubtMessages, isDoubtLoading, isDoubtDrawerOpen]);

  const saveInterviewResult = async (finalScore: number, summary: string, conversation: Message[]) => {
    if (!currentUser) return;

    try {
      // Capture the finish time once so the saved timestamps and duration agree.
      const completedAt = new Date();
      const startedAt = interviewStartedAtRef.current ?? interviewStartedAt;
      const durationSeconds = startedAt
        ? Math.max(0, Math.floor((completedAt.getTime() - startedAt.getTime()) / 1000))
        : 0;

      await addDoc(collection(db, "users", currentUser.uid, "interviews"), {
        userId: currentUser.uid,
        interviewType: selectedType,
        topic,
        difficulty,
        totalQuestions,
        score: finalScore,
        summary,
        conversation,
        completed: true,
        createdAt: Timestamp.fromDate(completedAt),
        completedAt: Timestamp.fromDate(completedAt),
        startedAt: startedAt ? Timestamp.fromDate(startedAt) : null,
        durationSeconds,
      });
      console.log("Interview result and actual duration saved successfully.");
    } catch (error) {
      console.error("Failed to save interview result to Firestore:", error);
      alert("Your interview finished, but its result could not be saved. Please check your internet connection and Firestore rules.");
    }
  };

  const extractScore = (text: string): number => {
    // Accept common AI report formats, but only read a number explicitly tied to a score.
    const patterns = [
      /overall\s+score\s*[:=-]?\s*(\d{1,3})\s*(?:\/\s*100|out of 100|%)/i,
      /score\s*(?:out of 100|\/\s*100)\s*[:=-]?\s*(\d{1,3})/i,
      /overall\s+score\s*[:=-]?\s*(\d{1,3})\b/i,
      /final\s+score\s*[:=-]?\s*(\d{1,3})\s*(?:\/\s*100|out of 100|%)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const parsed = Number(match[1]);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) return parsed;
      }
    }
    return 0;
  };

  const isNonsense = (str: string) => {
    const clean = str.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (clean.length < 5) return true;
    const unique = new Set(clean.split(""));
    return unique.size < 4;
  };

  const handleStartInterview = async () => {
    const startedAt = new Date();
    interviewStartedAtRef.current = startedAt;
    setInterviewStartedAt(startedAt);
    setElapsedSeconds(0);
    setIsInterviewStarted(true);
    setIsFinished(false);
    setIsLoading(true);
    setCurrentQuestionIndex(1);
    setReport(null);

    const initPrompt = `Start a ${selectedType} on the topic: ${topic}. Difficulty: ${difficulty}. Directly ask Question 1 of ${totalQuestions} without introductory fluff.`;

    try {
      const res = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: initPrompt, topic, difficulty }),
      });
      const data = await res.json();
      setMessages([
        {
          role: "bot",
          content:
            data.response ||
            data.message ||
            `Welcome to your ${topic} interview! Question 1: How do you find the middle element of a singly linked list in a single pass?`,
        },
      ]);
    } catch {
      setMessages([
        {
          role: "bot",
          content: `Welcome to your ${topic} interview! Question 1: How do you find the middle element of a singly linked list in a single pass?`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userInput.trim() || isLoading) return;

    const userText = userInput.trim();

    if (isNonsense(userText)) {
      alert("Invalid answer detected. Please provide a substantive technical response.");
      return;
    }

    const updatedMessages: Message[] = [
      ...messages,
      { role: "user", content: userText },
    ];
    setMessages(updatedMessages);
    setUserInput("");
    setIsLoading(true);

    const isLastTurn = currentQuestionIndex >= totalQuestions;

    const payloadPrompt = isLastTurn
      ? `Topic: ${topic}. Difficulty: ${difficulty}. Candidate Final Answer: "${userText}". 
         The interview is complete. Provide a strict evaluation report:
         1. Turn evaluation (1-2 sentences).
         2. Give one overall technical-accuracy score from 0 to 100. Use this exact format on its own line: Overall score: NN/100 (replace NN with an integer from 0 to 100; do not use any other scale).
         3. Top 2 actionable areas for improvement.
         If the answer is nonsense or does not answer the question, give a very low score appropriate to the answer. Never output a score above 100.`
      : `Topic: ${topic}. Difficulty: ${difficulty}. Candidate Answer: "${userText}". 
         Evaluate this answer honestly in 1-2 sentences (point out inaccuracies). Then provide Question ${currentQuestionIndex + 1} of ${totalQuestions} strictly relevant to ${topic}.`;

    try {
      const res = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: payloadPrompt,
          history: updatedMessages,
          topic,
          difficulty,
        }),
      });

      const data = await res.json();
      const botResponse = data.response || data.message || "Evaluation noted.";

      setMessages((prev) => [...prev, { role: "bot", content: botResponse }]);

      if (isLastTurn) {
        const finalScore = extractScore(botResponse);
        setIsFinished(true);
        setReport({
          score: finalScore,
          summary: botResponse,
        });
        await saveInterviewResult(finalScore, botResponse, [...updatedMessages, { role: "bot", content: botResponse }]);
      } else {
        setCurrentQuestionIndex((prev) => prev + 1);
      }
    } catch {
      const fallback = isLastTurn
        ? "Interview completed! Great effort across all questions."
        : "Evaluation noted. Next Question: What is the time complexity difference between an Array and a Linked List for search and insertion?";
      setMessages((prev) => [...prev, { role: "bot", content: fallback }]);
      if (isLastTurn) {
        setIsFinished(true);
        setReport({ score: 0, summary: `${fallback}\n\nA score was not saved because the AI evaluation request failed.` });
      } else {
        setCurrentQuestionIndex((prev) => prev + 1);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendDoubt = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!doubtInput.trim() || isDoubtLoading) return;

    const text = doubtInput.trim();
    const updated = [...doubtMessages, { role: "user" as const, content: text }];
    setDoubtMessages(updated);
    setDoubtInput("");
    setIsDoubtLoading(true);

    const mentorPrompt = `You are a Senior Technical Mentor. The student is practicing ${topic} (${difficulty}). Doubt: "${text}". Give an accurate, concise explanation with edge cases under 120 words.`;

    try {
      const res = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: mentorPrompt, topic, difficulty }),
      });
      const data = await res.json();
      setDoubtMessages((prev) => [
        ...prev,
        { role: "bot", content: data.response || data.message || "Focus on identifying constraints and edge cases early." },
      ]);
    } catch {
      setDoubtMessages((prev) => [
        ...prev,
        { role: "bot", content: "Always check time and space constraints before choosing your data structure." },
      ]);
    } finally {
      setIsDoubtLoading(false);
    }
  };

  const handleRestart = () => {
    setIsInterviewStarted(false);
    setIsFinished(false);
    setInterviewStartedAt(null);
    interviewStartedAtRef.current = null;
    setElapsedSeconds(0);
    setMessages([]);
    setUserInput("");
    setCurrentQuestionIndex(1);
    setReport(null);
  };

  const formatElapsedTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  if (authLoading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          backgroundColor: "#f5faf6",
          color: "#234b36",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        Checking your sign-in...
      </main>
    );
  }

  if (!currentUser) {
    return <AuthForm />;
  }

  return (
    <div style={styles.container}>
      <button
        type="button"
        onClick={() => { window.location.href = "/home"; }}
        style={{
          position: "fixed",
          top: "16px",
          left: "16px",
          zIndex: 200,
          padding: "9px 14px",
          border: "1px solid #dce8df",
          borderRadius: "8px",
          backgroundColor: "#edf5ef",
          color: "#234b36",
          cursor: "pointer",
        }}
      >
        ← Home
      </button>
      <button
        type="button"
        onClick={() => signOut(auth)}
        style={{
          position: "fixed",
          top: "16px",
          right: "16px",
          zIndex: 200,
          padding: "9px 14px",
          border: "1px solid #dce8df",
          borderRadius: "8px",
          backgroundColor: "#edf5ef",
          color: "#234b36",
          cursor: "pointer",
        }}
      >
        Sign out
      </button>
      {!isInterviewStarted ? (
        <div style={styles.setupCard}>
          <h1 style={styles.setupTitle}>{selectedType}</h1>
          <p style={styles.setupSubtitle}>
            Choose your topic, difficulty, and question count before starting.
          </p>



          <div style={styles.formGroup}>
            <label style={styles.label}>Select Topic</label>
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              style={styles.select}
            >
              <option value="DSA (Data Structures & Algorithms)">DSA (Data Structures & Algorithms)</option>
              <option value="Full Stack Web Development">Full Stack Web Development</option>
              <option value="System Design & Architecture">System Design & Architecture</option>
              <option value="React & Frontend Engineering">React & Frontend Engineering</option>
              <option value="Node.js & Backend Architecture">Node.js & Backend Architecture</option>
              <option value="HR and common interview questions">HR and Common Interview Questions</option>
              <option value="Coding and problem solving">Coding and Problem Solving</option>
              <option value="Behavioral and situational interview questions">Behavioral and Situational Interview Questions</option>
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Difficulty Level</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              style={styles.select}
            >
              <option value="Junior / Entry-Level">Junior / Entry-Level</option>
              <option value="Intermediate / Mid-Level">Intermediate / Mid-Level</option>
              <option value="Senior / Advanced">Senior / Advanced</option>
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Total Questions</label>
            <select
              value={totalQuestions}
              onChange={(e) => setTotalQuestions(Number(e.target.value))}
              style={styles.select}
            >
              <option value={3}>3 Questions (Quick Screen)</option>
              <option value={5}>5 Questions (Standard Round)</option>
              <option value={7}>7 Questions (Comprehensive Round)</option>
            </select>
          </div>

          <button onClick={handleStartInterview} style={styles.startButton}>
            Start Interview
          </button>
        </div>
      ) : isFinished ? (
        <div style={styles.setupCard}>
          <h1 style={{ ...styles.setupTitle, color: "#3fb950" }}>Interview Evaluation Report</h1>
          <p style={styles.setupSubtitle}>Your session is finished. Here is your performance overview:</p>
          <div style={{ ...styles.reportBox, maxHeight: "none" }}>
            <div style={{ marginBottom: "14px", fontSize: "28px", fontWeight: 700, color: report && report.score >= 70 ? "#3fb950" : report && report.score >= 40 ? "#d29922" : "#f85149" }}>
              Score: {report?.score ?? 0}/100
            </div>
            <div style={{ color: "#45614f", fontSize: "14px", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>
              {report?.summary}
            </div>
            {report?.score === 0 && (
              <p style={{ color: "#d29922", fontSize: "12px", marginTop: "12px" }}>
                The AI report did not contain a score in a recognized format, so 0 is shown. Check that the report includes “Overall score: NN/100”.
              </p>
            )}
          </div>
          <button onClick={handleRestart} style={styles.startButton}>
            Start New Round
          </button>
        </div>
      ) : (
        <div style={styles.chatCard}>
          <div style={styles.header}>
            <div>
              <span style={styles.headerTopic}>Topic: {topic}</span>
              <span style={styles.headerLevel}> • {difficulty}</span>
            </div>
            <div style={styles.headerRight}>
              <span style={styles.questionCounter}>
                Question {Math.min(currentQuestionIndex, totalQuestions)} / {totalQuestions}
              </span>
              <span
                aria-label="Interview elapsed time"
                title="Elapsed interview time"
                style={{ fontSize: "12px", color: "#6b7f72", whiteSpace: "nowrap" }}
              >
                ⏱ {formatElapsedTime(elapsedSeconds)}
              </span>
              <button onClick={handleRestart} style={styles.restartBtn}>
                Restart
              </button>
            </div>
          </div>

          <div style={styles.messageFeed}>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  ...styles.messageRow,
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    ...styles.bubble,
                    ...(msg.role === "user" ? styles.userBubble : styles.botBubble),
                  }}
                >
                  <div style={styles.senderTag}>
                    {msg.role === "user" ? "You" : "Interviewer"}
                  </div>
                  <div style={styles.bubbleText}>{msg.content}</div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div style={{ ...styles.messageRow, justifyContent: "flex-start" }}>
                <div style={{ ...styles.bubble, ...styles.botBubble }}>
                  <div style={styles.senderTag}>Interviewer</div>
                  <div style={styles.loadingDots}>Analyzing response...</div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={handleSendMessage} style={styles.inputArea}>
            <input
              type="text"
              placeholder="Type your technical answer here..."
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              disabled={isLoading}
              style={styles.textInput}
            />
            <button
              type="submit"
              disabled={isLoading || !userInput.trim()}
              style={{
                ...styles.sendBtn,
                opacity: isLoading || !userInput.trim() ? 0.6 : 1,
              }}
            >
              Send
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setIsDoubtDrawerOpen((prev) => !prev)}
        style={styles.floatingButton}
      >
        💬 Ask Doubt & Improve
      </button>

      {isDoubtDrawerOpen && (
        <div style={styles.drawerOverlay}>
          <div style={styles.drawerCard}>
            <div style={styles.drawerHeader}>
              <div>
                <strong style={{ color: "#347a50" }}>💡 Doubt & Improvement Mentor</strong>
                <div style={{ fontSize: "12px", color: "#6b7f72" }}>
                  Ask questions, code solutions, or how to improve
                </div>
              </div>
              <button
                onClick={() => setIsDoubtDrawerOpen(false)}
                style={styles.drawerCloseBtn}
              >
                ✕
              </button>
            </div>

            <div style={styles.drawerFeed}>
              {doubtMessages.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    ...styles.messageRow,
                    justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      ...styles.bubble,
                      ...(msg.role === "user" ? styles.userBubble : styles.mentorBubble),
                    }}
                  >
                    <div style={styles.senderTag}>
                      {msg.role === "user" ? "You" : "Mentor"}
                    </div>
                    <div style={styles.bubbleText}>{msg.content}</div>
                  </div>
                </div>
              ))}
              {isDoubtLoading && (
                <div style={{ ...styles.messageRow, justifyContent: "flex-start" }}>
                  <div style={{ ...styles.bubble, ...styles.mentorBubble }}>
                    <div style={styles.senderTag}>Mentor</div>
                    <div style={styles.loadingDots}>Thinking...</div>
                  </div>
                </div>
              )}
              <div ref={doubtEndRef} />
            </div>

            <form onSubmit={handleSendDoubt} style={styles.drawerInputArea}>
              <input
                type="text"
                placeholder="Ask any doubt or how to improve..."
                value={doubtInput}
                onChange={(e) => setDoubtInput(e.target.value)}
                disabled={isDoubtLoading}
                style={styles.textInput}
              />
              <button
                type="submit"
                disabled={isDoubtLoading || !doubtInput.trim()}
                style={{
                  ...styles.sendBtn,
                  backgroundColor: "#3b8056",
                  opacity: isDoubtLoading || !doubtInput.trim() ? 0.6 : 1,
                }}
              >
                Ask
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#f5faf6",
    color: "#234b36",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "Inter, system-ui, sans-serif",
    padding: "20px",
    position: "relative",
  },
  setupCard: {
    backgroundColor: "#ffffff",
    border: "1px solid #dce8df",
    borderRadius: "12px",
    width: "100%",
    maxWidth: "540px",
    padding: "32px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  },
  setupTitle: {
    fontSize: "22px",
    fontWeight: "600",
    marginBottom: "8px",
    color: "#347a50",
  },
  setupSubtitle: {
    fontSize: "14px",
    color: "#6b7f72",
    marginBottom: "24px",
  },
  formGroup: {
    marginBottom: "20px",
  },
  label: {
    display: "block",
    fontSize: "13px",
    fontWeight: "500",
    color: "#45614f",
    marginBottom: "8px",
  },
  select: {
    width: "100%",
    padding: "12px",
    backgroundColor: "#f5faf6",
    border: "1px solid #dce8df",
    borderRadius: "8px",
    color: "#234b36",
    fontSize: "14px",
    outline: "none",
  },
  startButton: {
    width: "100%",
    padding: "14px",
    backgroundColor: "#347a50",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
    marginTop: "12px",
  },
  reportBox: {
    backgroundColor: "#f5faf6",
    border: "1px solid #dce8df",
    borderRadius: "8px",
    padding: "18px",
    marginBottom: "20px",
    maxHeight: "380px",
    overflowY: "auto",
  },
  chatCard: {
    backgroundColor: "#ffffff",
    border: "1px solid #dce8df",
    borderRadius: "12px",
    width: "100%",
    maxWidth: "880px",
    height: "85vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    padding: "16px 24px",
    borderBottom: "1px solid #dce8df",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  headerTopic: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#347a50",
  },
  headerLevel: {
    fontSize: "13px",
    color: "#6b7f72",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  questionCounter: {
    fontSize: "13px",
    color: "#6b7f72",
  },
  restartBtn: {
    padding: "6px 12px",
    backgroundColor: "#edf5ef",
    border: "1px solid #dce8df",
    borderRadius: "6px",
    color: "#234b36",
    cursor: "pointer",
    fontSize: "12px",
  },
  messageFeed: {
    flex: 1,
    padding: "24px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  },
  messageRow: {
    display: "flex",
    width: "100%",
  },
  bubble: {
    maxWidth: "80%",
    padding: "14px 18px",
    borderRadius: "10px",
    lineHeight: "1.5",
    fontSize: "14px",
  },
  botBubble: {
    backgroundColor: "#edf5ef",
    border: "1px solid #dce8df",
    color: "#234b36",
  },
  mentorBubble: {
    backgroundColor: "#eef7f0",
    border: "1px solid #8bbd99",
    color: "#234b36",
  },
  userBubble: {
    backgroundColor: "#3b8056",
    color: "#ffffff",
  },
  senderTag: {
    fontSize: "11px",
    fontWeight: "600",
    opacity: 0.7,
    marginBottom: "4px",
    textTransform: "uppercase",
  },
  bubbleText: {
    whiteSpace: "pre-wrap",
  },
  loadingDots: {
    fontStyle: "italic",
    color: "#6b7f72",
  },
  inputArea: {
    padding: "16px 24px",
    borderTop: "1px solid #dce8df",
    display: "flex",
    gap: "12px",
    backgroundColor: "#ffffff",
  },
  textInput: {
    flex: 1,
    padding: "12px 16px",
    backgroundColor: "#f5faf6",
    border: "1px solid #dce8df",
    borderRadius: "8px",
    color: "#234b36",
    fontSize: "14px",
    outline: "none",
  },
  sendBtn: {
    padding: "12px 24px",
    backgroundColor: "#347a50",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },
  floatingButton: {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    padding: "12px 20px",
    backgroundColor: "#3b8056",
    color: "#ffffff",
    border: "none",
    borderRadius: "30px",
    fontWeight: "600",
    fontSize: "14px",
    cursor: "pointer",
    boxShadow: "0 6px 18px rgba(52, 122, 80, 0.25)",
    zIndex: 99,
  },
  drawerOverlay: {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    width: "420px",
    maxWidth: "100vw",
    backgroundColor: "#ffffff",
    borderLeft: "1px solid #dce8df",
    boxShadow: "-8px 0 24px rgba(0,0,0,0.5)",
    zIndex: 100,
    display: "flex",
  },
  drawerCard: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
  },
  drawerHeader: {
    padding: "16px 20px",
    borderBottom: "1px solid #dce8df",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  drawerCloseBtn: {
    background: "transparent",
    border: "none",
    color: "#6b7f72",
    fontSize: "18px",
    cursor: "pointer",
  },
  drawerFeed: {
    flex: 1,
    padding: "20px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  drawerInputArea: {
    padding: "16px 20px",
    borderTop: "1px solid #dce8df",
    display: "flex",
    gap: "8px",
  },
};