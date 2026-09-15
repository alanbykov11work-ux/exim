/* eslint-disable @next/next/no-img-element */
export default function AuthHero() {
  return (
    <div className="auth-hero">
      <div className="brand">
        <img src="/logo.png" alt="EXIM KZ" />
        <div className="brand-sub">
          Транспортно-логистическая
          <br />
          компания · Алматы
        </div>
      </div>

      <div className="hero-mid">
        <div className="mono-xs kicker">Личный кабинет клиента</div>
        <h1>Все перевозки, документы и счета — в одном окне.</h1>
        <p className="hero-lead">
          Авто, авиа, ЖД и мультимодальные перевозки, таможенное оформление и
          складские услуги. Статус груза — в реальном времени.
        </p>

        <div className="route-line">
          <span className="dot" />
          <span>ГУАНЧЖОУ</span>
          <span className="track" />
          <span>ХОРГОС</span>
          <span className="track" />
          <span>АЛМАТЫ</span>
          <span className="dot end" />
        </div>
      </div>

      <div className="facts">
        <div>
          <b>150+</b>
          <span>партнёров по миру</span>
        </div>
        <div>
          <b>15 мин</b>
          <span>среднее время ответа</span>
        </div>
        <div>
          <b>100%</b>
          <span>перевозок застраховано</span>
        </div>
      </div>
    </div>
  );
}
