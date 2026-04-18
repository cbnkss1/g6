import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        premium: {
          DEFAULT: "#d4af37",
          muted: "#8a7530",
          glow: "#f0e2a8",
        },
        /** 마이페이지·고객센터·메인과 동일 톤 (v6 quantum_editorial_shell --qe-primary 계열) */
        quantum: {
          cyan: "#8aebff",
          magenta: "#e879f9",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        premium: "0 0 40px -8px rgba(212,175,55,0.35), 0 4px 24px rgba(0,0,0,0.55)",
        "quantum-glow":
          "0 0 20px rgba(138, 235, 255, 0.35), 0 0 48px rgba(34, 211, 238, 0.12), inset 0 1px 0 rgba(255,255,255,0.04)",
        "quantum-glow-lg":
          "0 0 40px rgba(232, 121, 249, 0.2), 0 0 72px rgba(138, 235, 255, 0.12), 0 8px 32px rgba(0,0,0,0.5)",
      },
      dropShadow: {
        quantum: "0 0 14px rgba(138, 235, 255, 0.45)",
      },
    },
  },
  plugins: [],
};

export default config;
