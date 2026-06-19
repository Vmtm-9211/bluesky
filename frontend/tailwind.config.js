/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#e6f4ff",
        lagoon: "#22d3ee",
        coral: "#8b5cf6",
        mint: "#0f172a",
        amberline: "#fbbf24",
        /* dark theme accents */
        neon: "#00d4ff",
        glow: "#7928ca",
      },
    },
  },
  plugins: [],
};
