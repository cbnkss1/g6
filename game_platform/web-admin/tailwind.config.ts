import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        premium: {
          DEFAULT: "#d4af37",
          muted: "#8a7530",
          glow: "#f0e2a8",
          dim: "#5c4a18",
        },
        glass: {
          DEFAULT: "rgba(15,23,42,0.75)",
          light: "rgba(30,41,59,0.60)",
          border: "rgba(212,175,55,0.18)",
        },
        depth: {
          0: "#d4af37",   // 슈퍼관리자 — 골드
          1: "#60a5fa",   // 1뎁스 — 블루
          2: "#34d399",   // 2뎁스 — 에메랄드
          3: "#a78bfa",   // 3뎁스 — 퍼플
          4: "#f87171",   // 4뎁스 — 레드
          5: "#fb923c",   // 5뎁스 — 오렌지
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "premium-radial": "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(212,175,55,0.25), transparent)",
        "card-gradient": "linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(7,11,22,0.98) 100%)",
        "gold-gradient": "linear-gradient(135deg, #d4af37 0%, #f0e2a8 50%, #8a7530 100%)",
        "danger-gradient": "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
        "win-gradient": "linear-gradient(135deg, #10b981 0%, #047857 100%)",
      },
      boxShadow: {
        "premium": "0 0 40px -8px rgba(212,175,55,0.4), 0 4px 24px rgba(0,0,0,0.6)",
        "premium-sm": "0 0 20px -4px rgba(212,175,55,0.3), 0 2px 12px rgba(0,0,0,0.5)",
        "glow-gold": "0 0 32px rgba(212,175,55,0.5)",
        "glow-emerald": "0 0 32px rgba(52,211,153,0.4)",
        "glow-red": "0 0 32px rgba(239,68,68,0.4)",
        "glass": "0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
        "inner-premium": "inset 0 1px 0 rgba(212,175,55,0.2)",
      },
      animation: {
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "float": "float 6s ease-in-out infinite",
        "particle": "particle 0.8s ease-out forwards",
        "slide-in": "slide-in 0.3s cubic-bezier(0.34,1.56,0.64,1)",
        "fade-up": "fade-up 0.4s ease-out",
        "shimmer": "shimmer 2s linear infinite",
      },
      keyframes: {
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 20px rgba(212,175,55,0.2)" },
          "50%": { boxShadow: "0 0 40px rgba(212,175,55,0.5), 0 0 80px rgba(212,175,55,0.2)" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "particle": {
          "0%": { transform: "translate(0,0) scale(1)", opacity: "1" },
          "100%": { transform: "translate(var(--tx), var(--ty)) scale(0)", opacity: "0" },
        },
        "slide-in": {
          "0%": { transform: "translateX(-12px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "fade-up": {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};

export default config;
