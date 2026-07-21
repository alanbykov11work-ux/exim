/* eslint-disable @next/next/no-img-element */
export default function AuthHero() {
  return (
    <div className="auth-hero">
      <div className="brand">
        <img
          src="/logo.png"
          alt="EXIM"
          style={{
            height: 40,
            background: "#fff",
            borderRadius: 11,
            padding: "6px 10px",
          }}
        />
      </div>
      <div style={{ zIndex: 1 }}>
        <div className="mono">{"// SUPER APP"}</div>
        <h1>
          Груз под контролем,
          <br />
          от порта до двери.
        </h1>
        <p>
          Заявки на перевозку, отслеживание в реальном времени, каталог
          контейнеров и прямая связь с менеджером — в одном приложении.
        </p>
      </div>
      <div className="stats">
        <div>
          <b>1 200+</b>
          <i>перевозок</i>
        </div>
        <div>
          <b>18 дн</b>
          <i>средний срок</i>
        </div>
        <div>
          <b>24/7</b>
          <i>поддержка</i>
        </div>
      </div>
    </div>
  );
}
