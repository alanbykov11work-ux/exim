"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AuthHero from "@/components/AuthHero";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setLoading(false);
      if (error.message.toLowerCase().includes("email not confirmed")) {
        setError(
          "Почта ещё не подтверждена. Проверьте входящие — мы отправили письмо со ссылкой подтверждения."
        );
      } else if (error.message.toLowerCase().includes("invalid login")) {
        setError("Неверный email или пароль.");
      } else {
        setError(error.message);
      }
      return;
    }

    if (data.user && !data.user.email_confirmed_at) {
      router.push("/verify");
      return;
    }
    router.push("/app");
    router.refresh();
  }

  return (
    <div className="auth-wrap">
      <AuthHero />
      <div className="auth-form-wrap">
        <form className="auth-card" onSubmit={onSubmit}>
          <span className="eyebrow">Вход в систему</span>
          <h2>Добро пожаловать</h2>

          {error && <div className="auth-msg error">{error}</div>}

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              placeholder="you@company.kz"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Пароль</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <div className="form-hint">
              <Link href="/forgot-password" style={{ color: "var(--accent)" }}>
                Забыли пароль?
              </Link>
            </div>
          </div>

          <button className="btn btn-primary btn-lg" disabled={loading}>
            {loading ? "Входим…" : "Войти"}
          </button>

          <div className="auth-alt">
            Нет аккаунта? <Link href="/register">Зарегистрироваться</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
