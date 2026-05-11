import type { Config } from "tailwindcss";

// Restrained, calm palette. Students will look at this for hours on phones
// in classrooms with bad lighting. High contrast for accessibility, soft
// neutrals to not fry retinas. The accent is a single muted teal so it
// stands out without being shouty.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1280px" },
    },
    extend: {
      colors: {
        // Tokens map to CSS variables in globals.css so dark mode just works.
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        fg: "rgb(var(--fg) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-fg": "rgb(var(--accent-fg) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
      },
      fontFamily: {
        // Fraunces for headings — a serif with personality, free on Google
        // Fonts. iA Writer Mono fallback chain for code. System UI for body
        // because students' phones already have it cached.
        display: ['"Fraunces"', "Georgia", "serif"],
        sans: [
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        DEFAULT: "0.375rem",
      },
      // Don't over-animate — students with vestibular sensitivities exist.
      // Respect prefers-reduced-motion globally in globals.css.
      transitionDuration: {
        DEFAULT: "150ms",
      },
    },
  },
  plugins: [],
};

export default config;
