"use client";

import { useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../app/firebase";

export default function AuthForm() {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function saveUserProfile(
    uid: string,
    userEmail: string | null,
    displayName: string | null
  ) {
    await setDoc(
      doc(db, "users", uid),
      {
        name: displayName || "",
        email: userEmail || "",
        role: "student",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      if (!auth || !db) {
        throw new Error("Firebase is not configured. Please check your Firebase settings.");
      }

      const cleanEmail = email.trim();

      if (isLogin) {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
        setMessage("Login successful. Welcome back!");
      } else {
        if (!name.trim()) {
          throw new Error("Please enter your full name.");
        }

        const credential = await createUserWithEmailAndPassword(
          auth,
          cleanEmail,
          password
        );

        await setDoc(doc(db, "users", credential.user.uid), {
          name: name.trim(),
          email: cleanEmail,
          role: "student",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setMessage("Account created successfully!");
      }
    } catch (error: unknown) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code: unknown }).code)
          : "";
      const rawMessage =
        error instanceof Error ? error.message : "Something went wrong.";

      const friendlyMessages: Record<string, string> = {
        "auth/email-already-in-use": "This email already has an account. Please log in.",
        "auth/invalid-email": "Please enter a valid email address.",
        "auth/weak-password": "Please use a password with at least 6 characters.",
        "auth/invalid-credential": "Email or password is incorrect.",
        "auth/user-not-found": "No account found for this email. Please create an account.",
        "auth/wrong-password": "Email or password is incorrect.",
        "auth/popup-closed-by-user": "Google sign-in was closed before completion.",
        "auth/unauthorized-domain": "Add localhost to Authorized domains in Firebase Authentication settings.",
        "permission-denied": "Firestore blocked the profile save. Check your Firestore Rules.",
      };

      setMessage(friendlyMessages[code] || rawMessage);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setMessage("");
    setLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      await saveUserProfile(
        result.user.uid,
        result.user.email,
        result.user.displayName
      );
      setMessage("Google sign-in successful!");
    } catch (error: unknown) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code: unknown }).code)
          : "";
      const rawMessage =
        error instanceof Error ? error.message : "Google sign-in failed.";
      const friendlyMessages: Record<string, string> = {
        "auth/popup-closed-by-user": "Google sign-in was closed before completion.",
        "auth/unauthorized-domain": "Add localhost to Authorized domains in Firebase Authentication settings.",
        "auth/operation-not-allowed": "Enable Google in Firebase Authentication → Sign-in method.",
        "permission-denied": "Firestore blocked the profile save. Check your Firestore Rules.",
      };
      setMessage(friendlyMessages[code] || rawMessage);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setMessage("");
    if (!email.trim()) {
      setMessage("Enter your email address first, then select Forgot password.");
      return;
    }

    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage("Password reset email sent. Check your inbox.");
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Could not send reset email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <style jsx>{`
        * { box-sizing: border-box; }
        .auth-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 34px;
          color: #243027;
          background: #f7faf4;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .shell {
          width: min(1120px, 100%);
          min-height: 650px;
          display: grid;
          grid-template-columns: 1.05fr .95fr;
          overflow: hidden;
          border: 1px solid #e2e9dc;
          border-radius: 28px;
          background: #ffffff;
          box-shadow: 0 24px 70px rgba(54, 84, 58, .10);

        }
        .hero {
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 48px;
          overflow: hidden;
          background: linear-gradient(145deg, #f0f5e9, #e7efdf 58%, #dce9cf);
        }
        .hero:before, .hero:after {
          content: "";
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(1px);
        }
        .hero:before {
          width: 330px; height: 330px; right: -130px; top: 100px;
          border: 1px solid rgba(82, 115, 77, .18);
          box-shadow: 0 0 0 35px rgba(82, 115, 77, .035), 0 0 0 70px rgba(82, 115, 77, .025);
        }
        .hero:after {
          width: 210px; height: 210px; left: -100px; bottom: 40px;
          background: rgba(82, 115, 77, .10);
          filter: blur(35px);
        }
        .brand, .hero-copy, .hero-bottom { position: relative; z-index: 1; }
        .brand { display: flex; align-items: center; gap: 12px; font-weight: 750; letter-spacing: -.4px; font-size: 19px; }
        .brand-icon {
          width: 42px; height: 42px; display: grid; place-items: center;
          border-radius: 14px; font-size: 22px;
          background: #52734d;
          box-shadow: 0 8px 24px rgba(82, 115, 77, .15);
        }
        .eyebrow {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 8px 12px; border: 1px solid #d2dfc9;
          border-radius: 999px; color: #52734d; background: rgba(255, 255, 255, .72);
          font-size: 12px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase;
        }
        .hero h1 {
          max-width: 490px; margin: 22px 0 18px; font-size: clamp(38px, 4vw, 54px);
          line-height: 1.08; letter-spacing: -2.2px;
        }
        .gradient-text {
          background: linear-gradient(90deg, #52734d, #88a878);
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .hero-copy p { max-width: 440px; color: #667466; font-size: 16px; line-height: 1.75; }
        .features { display: grid; gap: 15px; margin-top: 30px; }
        .feature { display: flex; align-items: center; gap: 12px; color: #344234; font-size: 14px; }
        .check {
          width: 26px; height: 26px; flex: 0 0 26px; display: grid; place-items: center;
          border: 1px solid #d5e3cc; border-radius: 9px;
          background: #e6efdf; color: #52734d; font-weight: 800;
        }
        .hero-bottom { color: #788574; font-size: 12px; }
        .form-side { display: flex; align-items: center; justify-content: center; padding: 48px; }
        .form-wrap { width: 100%; max-width: 390px; }
        .mobile-brand { display: none; }
        .form-wrap h2 { margin: 0; font-size: 31px; letter-spacing: -1px; }
        .subtitle { margin: 10px 0 30px; color: #778374; font-size: 14px; line-height: 1.6; }
        .field { margin-bottom: 17px; }
        .field label { display: block; margin-bottom: 8px; color: #435143; font-size: 13px; font-weight: 600; }
        .field input {
          width: 100%; height: 50px; padding: 0 15px; border-radius: 12px;
          border: 1px solid #303b50; outline: none; background: #0b1221; color: #243027;
          font: inherit; font-size: 14px; transition: border .2s, box-shadow .2s;
        }
        .field input::placeholder { color: #879283; }
        .field input:focus { border-color: #78966c; box-shadow: 0 0 0 3px rgba(120, 150, 108, .14); }
        .forgot-row { display: flex; justify-content: flex-end; margin: -3px 0 20px; }
        .text-button {
          padding: 0; border: 0; background: none; color: #52734d;
          font: inherit; font-size: 13px; cursor: pointer;
        }
        .primary {
          width: 100%; min-height: 51px; border: 0; border-radius: 12px;
          color: white; font-weight: 750; font-size: 14px; cursor: pointer;
          background: #52734d;
          box-shadow: 0 8px 20px rgba(82, 115, 77, .18);
          transition: transform .2s, filter .2s;
        }
        .primary:hover { transform: translateY(-1px); filter: brightness(1.08); }
        .primary:disabled, .google:disabled { opacity: .65; cursor: wait; transform: none; }
        .divider { display: flex; align-items: center; gap: 12px; margin: 22px 0; color: #879283; font-size: 12px; }
        .divider:before, .divider:after { content: ""; height: 1px; flex: 1; background: #e5eadf; }
        .google {
          width: 100%; min-height: 49px; display: flex; align-items: center; justify-content: center; gap: 10px;
          border: 1px solid #dce5d6; border-radius: 12px; background: #ffffff;
          color: #344234; font-weight: 650; font-size: 14px; cursor: pointer;
          transition: border .2s, background .2s;
        }
        .google:hover { border-color: #879283; background: #f5f8f1; }
        .google-g { display: inline-grid; place-items: center; width: 21px; height: 21px; border-radius: 50%; background: white; color: #4285f4; font-weight: 900; }
        .switch { margin: 24px 0 0; text-align: center; color: #778374; font-size: 13px; }
        .switch button { margin-left: 5px; color: #52734d; font-weight: 700; }
        .message {
          margin: 0 0 18px; padding: 11px 13px; border: 1px solid #dce5d6; border-radius: 10px;
          color: #435143; background: #f4f7f0; font-size: 13px; line-height: 1.5;
          overflow-wrap: anywhere;
        }
        .secure-note { display: flex; justify-content: center; align-items: center; gap: 7px; margin-top: 25px; color: #879283; font-size: 11px; }
        @media (max-width: 850px) {
          .auth-page { padding: 16px; }
          .shell { grid-template-columns: 1fr; min-height: auto; max-width: 520px; }
          .hero { display: none; }
          .form-side { padding: 36px 26px; }
          .mobile-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 34px; font-weight: 750; }
          .form-wrap h2 { font-size: 29px; }
        }
      `}</style>

      <div className="shell">
        <section className="hero">
          <div className="brand">
            <div className="brand-icon">✦</div>
            <span>MockMate <span style={{ color: "#52734d" }}>AI</span></span>
          </div>

          <div className="hero-copy">
            <span className="eyebrow">✧ Your next opportunity starts here</span>
            <h1>Practice with purpose.<br /><span className="gradient-text">Interview with confidence.</span></h1>
            <p>
              Turn preparation into progress with AI-powered mock interviews,
              focused feedback, and a smarter way to get ready for your next role.
            </p>
            <div className="features">
              <div className="feature"><span className="check">✓</span> Personalized technical interview practice</div>
              <div className="feature"><span className="check">✓</span> Instant feedback to improve your answers</div>
              <div className="feature"><span className="check">✓</span> Track your learning journey over time</div>
            </div>
          </div>

          <div className="hero-bottom">Built for learners. Designed for your next big step.</div>
        </section>

        <section className="form-side">
          <div className="form-wrap">
            <div className="mobile-brand">
              <div className="brand-icon">✦</div>
              <span>MockMate <span style={{ color: "#52734d" }}>AI</span></span>
            </div>
            <h2>{isLogin ? "Welcome back" : "Create your account"}</h2>
            <p className="subtitle">
              {isLogin
                ? "Sign in to continue your interview preparation."
                : "Create your free account and start practicing smarter."}
            </p>

            {message && <div className="message" role="status">{message}</div>}

            <form onSubmit={handleSubmit}>
              {!isLogin && (
                <div className="field">
                  <label htmlFor="full-name">Full name</label>
                  <input
                    id="full-name"
                    name="name"
                    type="text"
                    placeholder="Enter your full name"
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                </div>
              )}

              <div className="field">
                <label htmlFor="email">Email address</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="At least 6 characters"
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>

              {isLogin && (
                <div className="forgot-row">
                  <button type="button" className="text-button" onClick={handleForgotPassword} disabled={loading}>
                    Forgot password?
                  </button>
                </div>
              )}

              <button className="primary" type="submit" disabled={loading}>
                {loading ? "Please wait..." : isLogin ? "Sign in to your account →" : "Create account →"}
              </button>
            </form>

            <div className="divider">or continue with</div>

            <button className="google" type="button" onClick={handleGoogleSignIn} disabled={loading}>
              <span className="google-g">G</span> Continue with Google
            </button>

            <p className="switch">
              {isLogin ? "New to MockMate?" : "Already have an account?"}
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setMessage("");
                }}
              >
                {isLogin ? "Create an account" : "Sign in"}
              </button>
            </p>

            <div className="secure-note">🔒 Your account is protected by Firebase Authentication</div>
          </div>
        </section>
      </div>
    </main>
  );
}
