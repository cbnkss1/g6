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
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        premium: "0 0 40px -8px rgba(212,175,55,0.35), 0 4px 24px rgba(0,0,0,0.55)",
      },
    },
  },
  plugins: [],
};

export default config;
