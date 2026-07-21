"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AuthHero from "@/components/AuthHero";

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState({
    name: "",
    company: "",
    phone: "",
    email: "",
    password: "",
    password2: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.password.length < 8) {
      setError("Пароль должен быть не короче 8 символов.");
      return;
    }
    if (form.password !== form.password2) {
      setError("Пароли не совпадают.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          full_name: form.name.trim(),
          company: form.company.trim(),
          phone: form.phone.trim(),
          role: "client",
        },
      },
    });
    setLoading(false);

    if (error) {
      if (error.message.toLowerCase().includes("already registered")) {
        setError("Этот email уже зарегистрирован. Попробуйте войти.");
      } else {
        setError(error.message);
      }
      return;
    }

    router.push("/verify?sent=1&email=" + encodeURIComponent(form.email.trim()));
  }

  return (
    <div className="auth-wrap">
      <AuthHero />
      <div className="auth-form-wrap">
        <form className="auth-card" onSubmit={onSubmit}>
          <span className="eyebrow">Регистрация</span>
          <h2>Создать аккаунт</h2>

          {error && <div className="auth-msg error">{error}</div>}

          <div className="form-group">
            <label className="form-label">Ваше имя</label>
            <input
              className="form-input"
              placeholder="Иван Петров"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Компания</label>
            <input
              className="form-input"
              placeholder="ТОО «Компания»"
              value={form.company}
              onChange={(e) => set("company", e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Телефон</label>
            <input
              className="form-input"
              placeholder="+7 ___ ___ __ __"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              placeholder="you@company.kz"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Пароль</label>
            <input
              type="password"
              className="form-input"
              placeholder="Минимум 8 символов"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Повторите пароль</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={form.password2}
              onChange={(e) => set("password2", e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          <button className="btn btn-primary btn-lg" disabled={loading}>
            {loading ? "Создаём аккаунт…" : "Зарегистрироваться"}
          </button>

          <div className="form-hint" style={{ marginTop: 12, textAlign: "center" }}>
            После регистрации мы отправим письмо для подтверждения почты.
            Роли «Менеджер» и «Логист» назначает администратор.
          </div>

          <div className="auth-alt">
            Уже есть аккаунт? <Link href="/login">Войти</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
