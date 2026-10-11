import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { dark: "#0E3A31", DEFAULT: "#19765B", soft: "#E7F1EA" },
        marigold: { DEFAULT: "#E9A23B", soft: "#FCF1DC", dark: "#8F5A0B" },
        navy: "#172B3A",
        canvas: "#F6F4EE",
        ink: { DEFAULT: "#182522", muted: "#65736D" },
        line: "#E4E0D3",
        caution: { DEFAULT: "#B7791F", soft: "#FBF3E2" },
        critical: { DEFAULT: "#B42318", soft: "#FCEBE9" },
        info: { DEFAULT: "#3567A8", soft: "#E9F0F9" },
      },
      fontFamily: {
        sans: ["Inter Variable", "Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["Fraunces Variable", "Fraunces", "Georgia", "serif"],
      },
      animation: {
        "fade-in": "fade-in 0.35s ease-out both",
        "fade-in-fast": "fade-in-fast 0.2s ease-out both",
        "slide-up": "slide-up 0.4s ease-out both",
        "slide-in-left": "slide-in-left 0.3s ease-out both",
        "scale-in": "scale-in 0.25s ease-out both",
        "counter": "counter-up 0.45s ease-out both",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "fade-in-fast": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up": { from: { opacity: "0", transform: "translateY(16px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "slide-in-left": { from: { opacity: "0", transform: "translateX(-12px)" }, to: { opacity: "1", transform: "translateX(0)" } },
        "scale-in": { from: { opacity: "0", transform: "scale(0.97)" }, to: { opacity: "1", transform: "scale(1)" } },
        "counter-up": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "translateY(0)" } },
      },
    },
  },
  plugins: [],
};
export default config;
