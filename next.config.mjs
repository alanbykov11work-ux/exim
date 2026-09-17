/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  env: {
    // метка сборки: статика кэшируется браузером и сбрасывается только при новом деплое
    NEXT_PUBLIC_BUILD_TS: String(Date.now()),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // запрет встраивания сайта в чужие iframe (кликджекинг)
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
