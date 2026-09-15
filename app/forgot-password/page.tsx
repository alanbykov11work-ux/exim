"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AuthHero from "@/components/AuthHero";

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    setMsg(
      error
        ? { kind: "error", text: error.message }
        : { kind: "ok", text: "Если такой аккаунт существует — письмо для сброса пароля отправлено." }
    );
  }

  return (
    <div className="auth-wrap">
      <AuthHero />
      <div className="auth-form-wrap">
        <form className="auth-card" onSubmit={onSubmit}>
          <span className="eyebrow">Восстановление доступа</span>
          <h2>Сброс пароля</h2>

          {msg && <div className={`auth-msg ${msg.kind}`}>{msg.text}</div>}

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              placeholder="you@company.kz"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <button className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? "Отправляем…" : "Отправить ссылку для сброса"}
          </button>

          <div className="auth-alt">
            <Link href="/login">← Вернуться ко входу</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
