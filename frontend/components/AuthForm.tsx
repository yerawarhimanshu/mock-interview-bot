"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();

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

  function getErrorMessage(error: unknown): string {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: unknown }).code)
        : "";

    const rawMessage =
      error instanceof Error ? error.message : "Something went wrong.";

    const messages: Record<string, string> = {
      "auth/email-already-in-use":
        "This email already has an account. Please sign in.",
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/weak-password":
        "Please use a password with at least 6 characters.",
      "auth/invalid-credential": "Email or password is incorrect.",
      "auth/user-not-found":
        "No account found for this email. Please create an account.",
      "auth/wrong-password": "Email or password is incorrect.",
      "auth/popup-closed-by-user":
        "Google sign-in was closed before completion.",
      "auth/unauthorized-domain":
        "This domain is not authorized. Add your website domain in Firebase Authentication settings → Authorized domains.",
      "auth/operation-not-allowed":
        "Enable Google sign-in in Firebase Authentication → Sign-in method.",
      "permission-denied":
        "Firestore blocked the profile save. Check your Firestore Rules.",
    };

    return messages[code] || rawMessage;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const cleanEmail = email.trim();

      if (isLogin) {
        await signInWithEmailAndPassword(auth, cleanEmail, password);

        router.replace("/home");
        return;
      }

      if (!name.trim()) {
        setMessage("Please enter your full name.");
        return;
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

      router.replace("/home");
    } catch (error: unknown) {
      setMessage(getErrorMessage(error));
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

      router.replace("/home");
    } catch (error: unknown) {
      setMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setMessage("");

    if (!email.trim()) {
      setMessage("Enter your email address first.");
      return;
    }

    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage("Password reset email sent. Check your inbox.");
    } catch (error: unknown) {
      setMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        .auth-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: #f7faf4;
          color: #243027;
          font-family: Inter, system-ui, sans-serif;
        }

        .shell {
          width: min(1120px, 100%);
          min-height: 650px;
          display: grid;
          grid-template-columns: 1.05fr 0.95fr;
          overflow: hidden;
          border: 1px solid #e2e9dc;
          border-radius: 28px;
          background: #fff;
          box-shadow: 0 24px 70px rgba(54, 84, 58, 0.1);
        }

        .hero {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 48px;
          background: linear-gradient(
            145deg,
            #f0f5e9,
            #e7efdf 58%,
            #dce9cf
          );
        }

        .brand,
        .mobile-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 19px;
          font-weight: 750;
        }

        .brand-icon {
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          border-radius: 14px;
          background: #52734d;
          color: white;
          font-size: 22px;
        }

        .hero-copy {
          margin: 40px 0;
        }

        .eyebrow {
          display: inline-block;
          padding: 8px 12px;
          border: 1px solid #d2dfc9;
          border-radius: 999px;
          background: white;
          color: #52734d;
          font-size: 12px;
          font-weight: 700;
        }

        .hero h1 {
          margin: 24px 0 18px;
          font-size: clamp(36px, 4vw, 54px);
          line-height: 1.1;
          letter-spacing: -2px;
        }

        .gradient-text {
          color: #52734d;
        }

        .hero-copy p {
          max-width: 440px;
          color: #667466;
          font-size: 15px;
          line-height: 1.8;
        }

        .features {
          display: grid;
          gap: 15px;
          margin-top: 30px;
        }

        .feature {
          display: flex;
          align-items: center;
          gap: 12px;
          color: #344234;
          font-size: 14px;
        }

        .check {
          width: 26px;
          height: 26px;
          display: grid;
          place-items: center;
          border-radius: 9px;
          background: #e6efdf;
          color: #52734d;
          font-weight: 800;
        }

        .hero-bottom {
          color: #788574;
          font-size: 12px;
        }

        .form-side {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px;
        }

        .form-wrap {
          width: 100%;
          max-width: 390px;
        }

        .mobile-brand {
          display: none;
          margin-bottom: 30px;
        }

        .form-wrap h2 {
          margin: 0;
          font-size: 31px;
          letter-spacing: -1px;
        }

        .subtitle {
          margin: 10px 0 28px;
          color: #778374;
          font-size: 14px;
          line-height: 1.7;
        }

        .field {
          margin-bottom: 17px;
        }

        .field label {
          display: block;
          margin-bottom: 8px;
          color: #435143;
          font-size: 13px;
          font-weight: 600;
        }

        .field input {
          width: 100%;
          height: 50px;
          padding: 0 15px;
          border: 1px solid #dce5d6;
          border-radius: 12px;
          outline: none;
          background: #fff;
          color: #243027;
          font: inherit;
          font-size: 14px;
        }

        .field input:focus {
          border-color: #78966c;
          box-shadow: 0 0 0 3px rgba(120, 150, 108, 0.14);
        }

        .field input::placeholder {
          color: #879283;
        }

        .forgot-row {
          display: flex;
          justify-content: flex-end;
          margin: -2px 0 20px;
        }

        .text-button {
          padding: 0;
          border: 0;
          background: none;
          color: #52734d;
          font: inherit;
          font-size: 13px;
          cursor: pointer;
        }

        .primary {
          width: 100%;
          min-height: 51px;
          border: 0;
          border-radius: 12px;
          background: #52734d;
          color: white;
          font-size: 14px;
          font-weight: 750;
          cursor: pointer;
        }

        .primary:hover {
          background: #425f3e;
        }

        .primary:disabled,
        .google:disabled {
          opacity: 0.65;
          cursor: wait;
        }

        .divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 22px 0;
          color: #879283;
          font-size: 12px;
        }

        .divider::before,
        .divider::after {
          content: "";
          height: 1px;
          flex: 1;
          background: #e5eadf;
        }

        .google {
          width: 100%;
          min-height: 49px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          border: 1px solid #dce5d6;
          border-radius: 12px;
          background: white;
          color: #344234;
          font-size: 14px;
          font-weight: 650;
          cursor: pointer;
        }

        .google:hover {
          background: #f5f8f1;
        }

        .google-g {
          color: #4285f4;
          font-weight: 900;
        }

        .switch {
          margin-top: 24px;
          text-align: center;
          color: #778374;
          font-size: 13px;
        }

        .switch button {
          margin-left: 5px;
          font-weight: 700;
        }

        .message {
          margin-bottom: 18px;
          padding: 12px;
          border: 1px solid #dce5d6;
          border-radius: 10px;
          background: #f4f7f0;
          color: #435143;
          font-size: 13px;
          line-height: 1.6;
          overflow-wrap: anywhere;
        }

        .secure-note {
          margin-top: 25px;
          text-align: center;
          color: #879283;
          font-size: 11px;
        }

        @media (max-width: 850px) {
          .auth-page {
            padding: 16px;
          }

          .shell {
            grid-template-columns: 1fr;
            min-height: auto;
            max-width: 520px;
          }

          .hero {
            display: none;
          }

          .form-side {
            padding: 36px 26px;
          }

          .mobile-brand {
            display: flex;
          }

          .form-wrap h2 {
            font-size: 29px;
          }
        }
      `}</style>

      <div className="shell">
        <section className="hero">
          <div className="brand">
            <div className="brand-icon">✦</div>
            <span>
              Prepwise <span style={{ color: "#52734d" }}>AI</span>
            </span>
          </div>

          <div className="hero-copy">
            <span className="eyebrow">
              ✧ Your next opportunity starts here
            </span>

            <h1>
              Practice with purpose.
              <br />
              <span className="gradient-text">
                Interview with confidence.
              </span>
            </h1>

            <p>
              Turn preparation into progress with AI-powered mock interviews,
              focused feedback, and a smarter way to get ready for your next
              role.
            </p>

            <div className="features">
              <div className="feature">
                <span className="check">✓</span>
                Personalized technical interview practice
              </div>

              <div className="feature">
                <span className="check">✓</span>
                Instant feedback to improve your answers
              </div>

              <div className="feature">
                <span className="check">✓</span>
                Track your learning journey over time
              </div>
            </div>
          </div>

          <div className="hero-bottom">
            Built for learners. Designed for your next big step.
          </div>
        </section>

        <section className="form-side">
          <div className="form-wrap">
            <div className="mobile-brand">
              <div className="brand-icon">✦</div>
              <span>
                Prepwise <span style={{ color: "#52734d" }}>AI</span>
              </span>
            </div>

            <h2>{isLogin ? "Welcome back" : "Create your account"}</h2>

            <p className="subtitle">
              {isLogin
                ? "Sign in to continue your interview preparation."
                : "Create your free account and start practicing smarter."}
            </p>

            {message && (
              <div className="message" role="status">
                {message}
              </div>
            )}

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
                  autoComplete={
                    isLogin ? "current-password" : "new-password"
                  }
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>

              {isLogin && (
                <div className="forgot-row">
                  <button
                    type="button"
                    className="text-button"
                    onClick={handleForgotPassword}
                    disabled={loading}
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <button
                className="primary"
                type="submit"
                disabled={loading}
              >
                {loading
                  ? "Please wait..."
                  : isLogin
                    ? "Sign in to your account →"
                    : "Create account →"}
              </button>
            </form>

            <div className="divider">or continue with</div>

            <button
              className="google"
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              <span className="google-g">G</span>
              Continue with Google
            </button>

            <p className="switch">
              {isLogin
                ? "New to Prepwise?"
                : "Already have an account?"}

              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setMessage("");
                  setPassword("");
                }}
              >
                {isLogin ? "Create an account" : "Sign in"}
              </button>
            </p>

            <div className="secure-note">
              🔒 Your account is protected by Firebase Authentication
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}