"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthHero from "@/components/AuthHero";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (p1.length < 8) return setMsg("Пароль должен быть не короче 8 символов.");
    if (p1 !== p2) return setMsg("Пароли не совпадают.");

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: p1 });
    setBusy(false);
    if (error) return setMsg(error.message);
    router.push("/app");
    router.refresh();
  }

  return (
    <div className="auth-wrap">
      <AuthHero />
      <div className="auth-form-wrap">
        <form className="auth-card" onSubmit={onSubmit}>
          <span className="eyebrow">Восстановление доступа</span>
          <h2>Новый пароль</h2>

          {msg && <div className="auth-msg error">{msg}</div>}

          <div className="form-group">
            <label className="form-label">Новый пароль</label>
            <input
              type="password"
              className="form-input"
              placeholder="Минимум 8 символов"
              value={p1}
              onChange={(e) => setP1(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Повторите пароль</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={p2}
              onChange={(e) => setP2(e.target.value)}
              required
            />
          </div>

          <button className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? "Сохраняем…" : "Сохранить и войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
