import type { Config } from "tailwindcss";

// Colours come from CSS variables (see app/globals.css) so the light theme (default) and optional dark theme share one code path.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"), card: v("card"), primary: v("primary"), secondary: v("secondary"), accent: v("accent"),
        ink: v("ink"), muted: v("muted"), line: v("line"),
        success: { DEFAULT: v("success"), soft: v("success-soft") },
        warning: { DEFAULT: v("warning"), soft: v("warning-soft") },
        danger: { DEFAULT: v("danger"), soft: v("danger-soft") },
      },
      borderRadius: { DEFAULT: "4px", md: "6px", lg: "8px" },
      boxShadow: { card: "0 1px 2px rgba(15,23,42,.06), 0 1px 1px rgba(15,23,42,.04)" },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "Arial", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
