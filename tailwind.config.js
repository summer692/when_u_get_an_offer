/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Accent flips black ↔ white by theme via CSS var (set in index.css).
        // Used for primary buttons, links, and emphasis throughout the app.
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
        },
        ink: {
          900: "#0A0A0A",
          700: "#1F1F1F",
          500: "#737373",
          300: "#D4D4D4",
          100: "#F5F5F5",
          50: "#FAFAFA",
        },
        paper: {
          DEFAULT: "#FFFFFF",
          dark: "#000000",
          warm: "#FAFAFA",
        },
      },
      fontFamily: {
        display: [
          '"SF Pro Display"',
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          '"PingFang SC"',
          '"Noto Sans SC"',
          "sans-serif",
        ],
        text: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Text"',
          "Inter",
          '"PingFang SC"',
          '"Noto Sans SC"',
          "sans-serif",
        ],
        serif: [
          '"Source Serif 4"',
          '"Source Serif Pro"',
          '"Songti SC"',
          '"Noto Serif SC"',
          "Georgia",
          "serif",
        ],
      },
      fontSize: {
        hero: [
          "clamp(3rem, 8vw, 6rem)",
          { lineHeight: "1.05", letterSpacing: "-0.03em" },
        ],
        mega: [
          "clamp(4rem, 12vw, 8rem)",
          { lineHeight: "1", letterSpacing: "-0.04em" },
        ],
      },
      borderRadius: {
        card: "2px",
      },
      transitionTimingFunction: {
        apple: "cubic-bezier(.2,.8,.2,1)",
      },
      boxShadow: {
        card: "none",
        "card-dark": "none",
      },
    },
  },
  plugins: [],
};
