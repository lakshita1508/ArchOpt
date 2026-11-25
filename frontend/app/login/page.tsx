"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/services/api";

export default function LoginPage() {
  const { login, user, ready } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ username?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (ready && user) router.replace("/dashboard"); }, [ready, user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const er: typeof errors = {};
    if (!username.trim()) er.username = "Username is required.";
    if (!password) er.password = "Password is required.";
    setErrors(er);
    if (er.username || er.password) return;
    setBusy(true);
    try {
      await login(username.trim(), password);
      router.replace("/dashboard");
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? (err.status === 401 ? "Incorrect username or password." : err.message) : "Login failed." });
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-8" noValidate>
        <div className="flex items-center justify-center gap-2 mb-6">
          <span className="w-10 h-10 bg-primary text-white grid place-items-center rounded font-bold">A</span>
          <span className="text-2xl font-bold text-primary tracking-tight">ArchOpt</span>
        </div>
        <label className="block mb-4"><span className="label">Username</span>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
          {errors.username && <span className="field-error block">{errors.username}</span>}
        </label>
        <label className="block mb-4"><span className="label">Password</span>
          <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          {errors.password && <span className="field-error block">{errors.password}</span>}
        </label>
        {errors.form && <p className="text-sm text-danger bg-danger-soft border border-danger/30 rounded p-2 mb-4" role="alert">{errors.form}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />} Login</button>
      </form>
    </div>
  );
}
