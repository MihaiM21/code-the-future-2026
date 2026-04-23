import React, { useState } from "react";
import { LogIn, UserPlus, Loader2, AlertCircle } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { User } from "../store/auth";

interface LoginPageProps {
  onLoginSuccess: (user: User) => void;
}

interface AuthResponse {
  success: boolean;
  message: string;
  user: User | null;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isLogin) {
        // Login
        if (!username || !password) {
          setError("Username and password are required");
          setLoading(false);
          return;
        }

        const response: AuthResponse = await invoke("login", {
          req: { username, password },
        });

        if (response.success && response.user) {
          onLoginSuccess(response.user);
        } else {
          setError(response.message || "Login failed");
        }
      } else {
        // Register
        if (!username || !email || !password || !confirmPassword) {
          setError("All fields are required");
          setLoading(false);
          return;
        }

        if (password !== confirmPassword) {
          setError("Passwords do not match");
          setLoading(false);
          return;
        }

        if (password.length < 8) {
          setError("Password must be at least 8 characters");
          setLoading(false);
          return;
        }

        // Check if username already exists
        const exists: boolean = await invoke("check_username_exists", {
          username,
        });

        if (exists) {
          setError("Username already exists");
          setLoading(false);
          return;
        }

        const response: AuthResponse = await invoke("register", {
          req: { username, email, password },
        });

        if (response.success && response.user) {
          setError("");
          setUsername("");
          setEmail("");
          setPassword("");
          setConfirmPassword("");
          setIsLogin(true);
          setError("Registration successful! Please log in.");
        } else {
          setError(response.message || "Registration failed");
        }
      }
    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#09090b] via-[#141416] to-[#09090b] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-[var(--text-primary)] tracking-widest mb-2">APEX</h1>
          <p className="text-[var(--text-secondary)] tracking-wide">Telemetry Control Platform</p>
        </div>

        {/* Card */}
        <div className="bg-[var(--bg-card)] rounded-2xl shadow-2xl border border-[var(--border)] p-8">
          {/* Tabs */}
          <div className="flex gap-3 mb-8">
            <button
              onClick={() => {
                setIsLogin(true);
                setError("");
              }}
              className={`flex-1 py-2 px-4 rounded-[10px] font-semibold tracking-wide transition-all ${
                isLogin
                  ? "bg-[var(--accent-cyan)] text-black shadow-lg"
                  : "bg-[var(--bg-panel)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--border-accent)] hover:text-[var(--text-primary)]"
              }`}
            >
              <LogIn size={18} className="inline mr-2" />
              Login
            </button>
            <button
              onClick={() => {
                setIsLogin(false);
                setError("");
              }}
              className={`flex-1 py-2 px-4 rounded-[10px] font-semibold tracking-wide transition-all ${
                !isLogin
                  ? "bg-[var(--accent-cyan)] text-black shadow-lg"
                  : "bg-[var(--bg-panel)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--border-accent)] hover:text-[var(--text-primary)]"
              }`}
            >
              <UserPlus size={18} className="inline mr-2" />
              Register
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div
              className={`mb-6 p-3 rounded-lg flex gap-3 ${
                isLogin && error === "Registration successful! Please log in."
                  ? "bg-green-500/20 text-green-300 border border-green-500/50"
                  : "bg-red-500/20 text-red-300 border border-red-500/50"
              }`}
            >
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-sm font-semibold tracking-wide text-[var(--text-secondary)] mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 bg-[var(--bg-panel)] border border-[var(--border)] rounded-[10px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-cyan)] focus:ring-1 focus:ring-[var(--accent-cyan)] transition-all"
                placeholder="Enter your username"
                disabled={loading}
              />
            </div>

            {/* Email (Register only) */}
            {!isLogin && (
              <div>
                <label className="block text-sm font-semibold tracking-wide text-[var(--text-secondary)] mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--bg-panel)] border border-[var(--border)] rounded-[10px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-cyan)] focus:ring-1 focus:ring-[var(--accent-cyan)] transition-all"
                  placeholder="Enter your email"
                  disabled={loading}
                />
              </div>
            )}

            {/* Password */}
            <div>
              <label className="block text-sm font-semibold tracking-wide text-[var(--text-secondary)] mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 bg-[var(--bg-panel)] border border-[var(--border)] rounded-[10px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-cyan)] focus:ring-1 focus:ring-[var(--accent-cyan)] transition-all"
                placeholder="Enter your password"
                disabled={loading}
              />
            </div>

            {/* Confirm Password (Register only) */}
            {!isLogin && (
              <div>
                <label className="block text-sm font-semibold tracking-wide text-[var(--text-secondary)] mb-2">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-[var(--bg-panel)] border border-[var(--border)] rounded-[10px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-cyan)] focus:ring-1 focus:ring-[var(--accent-cyan)] transition-all"
                  placeholder="Confirm your password"
                  disabled={loading}
                />
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-6 py-2 px-4 bg-[var(--accent-cyan)] hover:brightness-110 disabled:opacity-50 text-black font-bold tracking-widest rounded-[10px] transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Processing...
                </>
              ) : isLogin ? (
                <>
                  <LogIn size={18} />
                  Login
                </>
              ) : (
                <>
                  <UserPlus size={18} />
                  Register
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-[var(--text-muted)] text-xs mt-6">
            {isLogin
              ? "Don't have an account? Click Register above."
              : "Already have an account? Click Login above."}
          </p>
        </div>
      </div>
    </div>
  );
}
