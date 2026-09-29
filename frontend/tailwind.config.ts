import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        panel: v("panel"),
        card: v("card"),
        elevated: v("elevated"),
        line: v("line"),
        fg: v("fg"),
        muted: v("muted"),
        dim: v("dim"),
        pass: v("pass"),
        fail: v("fail"),
        err: v("err"),
        warn: v("warn"),
        brand: { blue: "#3b82f6", sky: "#60a5fa", cyan: "#67e8f9", violet: "#a855f7" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      backgroundImage: {
        "brand-grad": "linear-gradient(90deg, #3b82f6 0%, #5fa8f8 45%, #8be4fb 100%)",
        "brand-grad-v": "linear-gradient(0deg, #2563eb 0%, #38bdf8 70%, #7ee7fb 100%)",
        "fail-grad": "linear-gradient(180deg, #e879f9, #a855f7)",
      },
      boxShadow: {
        glow: "0 10px 30px -10px rgba(56,189,248,.55)",
        featured: "0 0 0 1px rgba(96,165,250,.12), 0 24px 60px -24px rgba(59,130,246,.5)",
      },
      keyframes: {
        "slide-in": { from: { transform: "translateX(24px)", opacity: "0" }, to: { transform: "none", opacity: "1" } },
        pulse2: { "0%,100%": { opacity: "1" }, "50%": { opacity: ".35" } },
      },
      animation: { "slide-in": "slide-in .22s ease-out", pulse2: "pulse2 1.4s ease-in-out infinite" },
    },
  },
  plugins: [],
} satisfies Config;
