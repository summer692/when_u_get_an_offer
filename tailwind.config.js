/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#0A84FF",
          hover: "#0969DA",
        },
        ink: {
          900: "#1D1D1F",
          700: "#3A3A3C",
          500: "#86868B",
          300: "#D2D2D7",
          100: "#F5F5F7",
        },
      },
      fontFamily: {
        display: [
          "SF Pro Display",
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "PingFang SC",
          "Noto Sans SC",
          "sans-serif",
        ],
        text: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Text",
          "Inter",
          "PingFang SC",
          "Noto Sans SC",
          "sans-serif",
        ],
      },
      fontSize: {
        hero: ["clamp(3rem, 8vw, 6rem)", { lineHeight: "1.05", letterSpacing: "-0.03em" }],
        mega: ["clamp(4rem, 12vw, 8rem)", { lineHeight: "1", letterSpacing: "-0.04em" }],
      },
      borderRadius: {
        card: "20px",
      },
      transitionTimingFunction: {
        apple: "cubic-bezier(.2,.8,.2,1)",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04)",
        "card-dark": "0 1px 2px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.25)",
      },
    },
  },
  plugins: [],
};
