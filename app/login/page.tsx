"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthHero from "@/components/AuthHero";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(
    params.get("verified")
      ? "Почта подтверждена! Войдите со своим email и паролем."
      : null
  );
  const callbackError = params.get("auth_error");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let stop = false;
    async function check() {
      const response = await fetch("/auth/session", { cache: "no-store" });
      const session = await response.json().catch(() => ({}));
      if (!stop && session.authenticated) {
        router.replace("/app");
        router.refresh();
      }
    }
    check();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // вход через серверный обработчик: защита от перебора (5 попыток / 30 мин)
    let res: Response;
    try {
      res = await fetch("/auth/password-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
    } catch {
      setLoading(false);
      setError("Нет соединения. Попробуйте ещё раз.");
      return;
    }
    const j = await res.json().catch(() => ({}));

    if (!res.ok) {
      setLoading(false);
      setError(j.error || "Не удалось войти.");
      if (j.unconfirmed) router.push("/verify?email=" + encodeURIComponent(email.trim()));
      return;
    }

    if (!j.confirmed) {
      router.push("/verify?email=" + encodeURIComponent(email.trim()));
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

          {callbackError && !error && (
            <div className="auth-msg error">
              Ссылка подтверждения недействительна или устарела. Запросите новое письмо.
            </div>
          )}
          {info && !error && !callbackError && <div className="auth-msg ok">{info}</div>}
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

          <div className="auth-foot">
            ТОО EXIM KZ · Алматы, ул. Чаплина, 71, БЦ «Станица», офис 620
            <br />
            +7 700 494 94 99 · info@exim-trans.kz
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
