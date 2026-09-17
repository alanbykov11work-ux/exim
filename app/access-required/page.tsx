import Link from "next/link";

export default function AccessRequiredPage() {
  return (
    <main className="app-boot">
      <div className="auth-card" style={{ maxWidth: 520 }}>
        <span className="eyebrow">Доступ к рабочему пространству</span>
        <h2>Доступ сейчас неактивен</h2>
        <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
          Аккаунт подтверждён, но выбранная роль или модуль недоступны.
          Выберите другой назначенный рабочий контур либо обратитесь к администратору компании.
          Данные других компаний не открыты.
        </p>
        <Link className="btn btn-primary btn-lg" href="/select-context">
          Выбрать компанию и роль
        </Link>
      </div>
    </main>
  );
}
