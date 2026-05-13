import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0b",
        panel: "#131316",
        panel2: "#1a1a1f",
        border: "#2a2a31",
        accent: "#22d3ee",
        accent2: "#a3e635",
        muted: "#8b8b96",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto"],
      },
    },
  },
  plugins: [],
};
export default config;
