"use client";

import { useState } from "react";
import Link from "next/link";
import AuthHero from "@/components/AuthHero";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    await fetch("/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    }).catch(() => null);
    setBusy(false);
    setMessage("Если аккаунт существует, инструкция будет отправлена после подключения почтового сервиса.");
  }

  return (
    <div className="auth-wrap">
      <AuthHero />
      <div className="auth-form-wrap">
        <form className="auth-card" onSubmit={onSubmit}>
          <span className="eyebrow">Восстановление доступа</span>
          <h2>Сброс пароля</h2>
          {message && <div className="auth-msg info">{message}</div>}
          <div className="form-group">
            <label className="form-label">Email</label>
            <input type="email" className="form-input" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? "Отправляем…" : "Запросить восстановление"}</button>
          <div className="auth-alt"><Link href="/login">← Вернуться ко входу</Link></div>
        </form>
      </div>
    </div>
  );
}
