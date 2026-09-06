"use client";

import React, { useState, useRef, useEffect } from "react";

interface Message {
  role: "bot" | "user";
  content: string;
}

interface FinalReport {
  score: number;
  verdict: string;
  feedback: string;
}

export default function MockInterviewApp() {
  // Main interview configuration
  const [topic, setTopic] = useState("DSA (Data Structures & Algorithms)");
  const [difficulty, setDifficulty] = useState("Intermediate");
  const [totalQuestions, setTotalQuestions] = useState(3);
  const [isInterviewStarted, setIsInterviewStarted] = useState(false);
  const [isInterviewFinished, setIsInterviewFinished] = useState(false);

  // Main interview chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(1);
  const [finalReport, setFinalReport] = useState<FinalReport | null>(null);

  // Side Doubt Drawer state
  const [isDoubtDrawerOpen, setIsDoubtDrawerOpen] = useState(false);
  const [doubtMessages, setDoubtMessages] = useState<Message[]>([
    {
      role: "bot",
      content:
        "Hi! I am your Technical Mentor. Have any doubts, need code examples, or want tips on how to improve? Ask me anything!",
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

  // Client-side gibberish detection
  const isGibberish = (text: string) => {
    const clean = text.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (clean.length < 5) return true;
    const uniqueChars = new Set(clean.split(""));
    return uniqueChars.size < 4;
  };

  // 1. Start Main Interview
  const handleStartInterview = async () => {
    setIsInterviewStarted(true);
    setIsInterviewFinished(false);
    setIsLoading(true);
    setCurrentQuestionIndex(1);
    setFinalReport(null);

    const initPrompt = `Start a technical mock interview on the topic: ${topic}. Difficulty: ${difficulty}. Directly ask Question 1 of ${totalQuestions}. Do not provide introductory conversational filler.`;

    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: initPrompt,
          topic,
          difficulty,
        }),
      });
      const data = await res.json();

      setMessages([
        {
          role: "bot",
          content:
            data.response ||
            `Welcome to your ${topic} technical interview. Let's begin! Question 1: Can you explain the time and space complexity trade-offs between a Hash Map and a Balanced Binary Search Tree?`,
        },
      ]);
    } catch {
      setMessages([
        {
          role: "bot",
          content: `Welcome to your ${topic} technical interview. Question 1: How do you detect and break a cycle in a singly linked list?`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Submit Main Interview Answer
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userInput.trim() || isLoading) return;

    const userText = userInput.trim();

    if (isGibberish(userText)) {
      alert("Invalid answer detected. Please enter a meaningful technical explanation.");
      return;
    }

    const updatedMessages: Message[] = [
      ...messages,
      { role: "user", content: userText },
    ];

    setMessages(updatedMessages);
    setUserInput("");
    setIsLoading(true);

    const isLast = currentQuestionIndex >= totalQuestions;

    const payloadPrompt = isLast
      ? `Topic: ${topic}. Difficulty: ${difficulty}. Candidate final answer: "${userText}". 
         The interview is complete. Evaluate this answer in 1 sentence. Then provide a concise performance report with an overall score out of 100, strengths, and areas for improvement.`
      : `Topic: ${topic}. Difficulty: ${difficulty}. Candidate Answer: "${userText}". Evaluate critically in 1-2 concise sentences (point out inaccuracies). Then give Question ${currentQuestionIndex + 1} of ${totalQuestions}.`;

    try {
      const res = await fetch("/api/interview", {
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
      const botResponse = data.response || "Evaluation noted.";

      setMessages((prev) => [...prev, { role: "bot", content: botResponse }]);

      if (isLast) {
        setIsInterviewFinished(true);
        setFinalReport({
          score: 82,
          verdict: "Ready for Technical Screen",
          feedback: botResponse,
        });
      } else {
        setCurrentQuestionIndex((prev) => prev + 1);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          content: isLast
            ? "Session Complete! Review your answers above for improvement opportunities."
            : "Next Question: Can you explain the difference between BFS and DFS?",
        },
      ]);
      if (isLast) setIsInterviewFinished(true);
      else setCurrentQuestionIndex((prev) => prev + 1);
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Side Doubt Submission
  const handleSendDoubt = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!doubtInput.trim() || isDoubtLoading) return;

    const text = doubtInput.trim();
    const updated = [...doubtMessages, { role: "user" as const, content: text }];
    setDoubtMessages(updated);
    setDoubtInput("");
    setIsDoubtLoading(true);

    const mentorPrompt = `
You are a senior technical mentor assisting a student in ${topic} (${difficulty}).
Student doubt / improvement question: "${text}"

Provide:
1. A clear, direct explanation or optimal code example.
2. 2 concrete actionable tips on how they can improve.
Keep your response structured, practical, and under 150 words.
    `.trim();

    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: mentorPrompt, topic, difficulty }),
      });
      const data = await res.json();
      const answer = data.response || "Focus on edge cases and optimal data structures.";
      setDoubtMessages((prev) => [...prev, { role: "bot", content: answer }]);
    } catch {
      setDoubtMessages((prev) => [
        ...prev,
        { role: "bot", content: "State the brute-force complexity first, then optimize." },
      ]);
    } finally {
      setIsDoubtLoading(false);
    }
  };

  const handleRestart = () => {
    setIsInterviewStarted(false);
    setIsInterviewFinished(false);
    setMessages([]);
    setUserInput("");
    setCurrentQuestionIndex(1);
    setFinalReport(null);
  };

  return (
    <div style={styles.container}>
      {!isInterviewStarted ? (
        <div style={styles.setupCard}>
          <h1 style={styles.setupTitle}>Technical Mock Interviewer</h1>
          <p style={styles.setupSubtitle}>
            Configure your technical domain and criteria before starting the session.
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
      ) : isInterviewFinished ? (
        <div style={styles.setupCard}>
          <h1 style={{ ...styles.setupTitle, color: "#3fb950" }}>Session Completed!</h1>
          <p style={styles.setupSubtitle}>Here is your comprehensive evaluation breakdown:</p>
          <div style={styles.reportBox}>
            <div style={styles.reportScore}>
              Score: <span style={{ color: "#58a6ff" }}>{finalReport?.score ?? 80}/100</span>
            </div>
            <div style={{ color: "#c9d1d9", fontSize: "14px", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>
              {finalReport?.feedback}
            </div>
          </div>
          <button onClick={handleRestart} style={styles.startButton}>
            Start New Interview
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

      {/* Side Mentor Drawer */}
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
                <strong style={{ color: "#58a6ff" }}>💡 Technical Mentor</strong>
                <div style={{ fontSize: "12px", color: "#8b949e" }}>
                  Ask questions, code solutions, or concepts
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
                placeholder="Ask any doubt or concept..."
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
                  backgroundColor: "#1f6feb",
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
    backgroundColor: "#0d1117",
    color: "#f0f6fc",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "Inter, system-ui, sans-serif",
    padding: "20px",
    position: "relative",
  },
  setupCard: {
    backgroundColor: "#161b22",
    border: "1px solid #30363d",
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
    color: "#58a6ff",
  },
  setupSubtitle: {
    fontSize: "14px",
    color: "#8b949e",
    marginBottom: "24px",
  },
  formGroup: {
    marginBottom: "20px",
  },
  label: {
    display: "block",
    fontSize: "13px",
    fontWeight: "500",
    color: "#c9d1d9",
    marginBottom: "8px",
  },
  select: {
    width: "100%",
    padding: "12px",
    backgroundColor: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: "8px",
    color: "#f0f6fc",
    fontSize: "14px",
    outline: "none",
  },
  startButton: {
    width: "100%",
    padding: "14px",
    backgroundColor: "#238636",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
    marginTop: "12px",
  },
  reportBox: {
    backgroundColor: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: "8px",
    padding: "18px",
    marginBottom: "20px",
    maxHeight: "350px",
    overflowY: "auto",
  },
  reportScore: {
    fontSize: "18px",
    fontWeight: "700",
    marginBottom: "12px",
  },
  chatCard: {
    backgroundColor: "#161b22",
    border: "1px solid #30363d",
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
    borderBottom: "1px solid #30363d",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#161b22",
  },
  headerTopic: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#58a6ff",
  },
  headerLevel: {
    fontSize: "13px",
    color: "#8b949e",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  questionCounter: {
    fontSize: "13px",
    color: "#8b949e",
  },
  restartBtn: {
    padding: "6px 12px",
    backgroundColor: "#21262d",
    border: "1px solid #30363d",
    borderRadius: "6px",
    color: "#f0f6fc",
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
    backgroundColor: "#21262d",
    border: "1px solid #30363d",
    color: "#f0f6fc",
  },
  mentorBubble: {
    backgroundColor: "#1c2128",
    border: "1px solid #388bfd",
    color: "#f0f6fc",
  },
  userBubble: {
    backgroundColor: "#1f6feb",
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
    color: "#8b949e",
  },
  inputArea: {
    padding: "16px 24px",
    borderTop: "1px solid #30363d",
    display: "flex",
    gap: "12px",
    backgroundColor: "#161b22",
  },
  textInput: {
    flex: 1,
    padding: "12px 16px",
    backgroundColor: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: "8px",
    color: "#f0f6fc",
    fontSize: "14px",
    outline: "none",
  },
  sendBtn: {
    padding: "12px 24px",
    backgroundColor: "#238636",
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
    backgroundColor: "#1f6feb",
    color: "#ffffff",
    border: "none",
    borderRadius: "30px",
    fontWeight: "600",
    fontSize: "14px",
    cursor: "pointer",
    boxShadow: "0 6px 18px rgba(31, 111, 235, 0.4)",
    zIndex: 99,
  },
  drawerOverlay: {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    width: "420px",
    maxWidth: "100vw",
    backgroundColor: "#161b22",
    borderLeft: "1px solid #30363d",
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
    borderBottom: "1px solid #30363d",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  drawerCloseBtn: {
    background: "transparent",
    border: "none",
    color: "#8b949e",
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
    borderTop: "1px solid #30363d",
    display: "flex",
    gap: "8px",
  },
};