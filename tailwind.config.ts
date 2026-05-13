import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#C06A9E",
          elevated: "#D082B2",
          deep: "#8E2D8B",
          glow: "#FD8CD1",
          accent: "#FF8A23",
          ink: "#FFF7FE",
          muted: "#F4D7E9",
          cyan: "#61D6FF",
        },
      },
      fontFamily: {
        sans: ["'Sora'", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glass: "0 24px 90px rgba(50, 0, 64, 0.28)",
        "glass-soft": "0 14px 32px rgba(40, 0, 56, 0.18)",
        pulse: "0 0 0 1px rgba(255,255,255,0.18), 0 0 35px rgba(196,70,214,0.38)"
      },
      backdropBlur: {
        xl: "26px",
      },
      backgroundImage: {
        "alma-shell": "linear-gradient(100deg, rgba(103,24,170,0.92) 0%, rgba(179,109,145,0.86) 34%, rgba(171,52,134,0.92) 100%)",
        "alma-chat": "linear-gradient(105deg, rgba(91,14,177,0.92) 0%, rgba(170,108,138,0.82) 39%, rgba(173,43,131,0.9) 100%)",
        "alma-blur": "radial-gradient(circle at 15% 45%, rgba(98,0,195,0.65), transparent 32%), radial-gradient(circle at 75% 20%, rgba(255,166,205,0.16), transparent 18%)",
      },
      borderRadius: {
        xl2: "1.75rem",
      },
      keyframes: {
        bob: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-3px)" },
        },
        pulseRing: {
          "0%": { boxShadow: "0 0 0 0 rgba(255,138,35,0.45)" },
          "70%": { boxShadow: "0 0 0 14px rgba(255,138,35,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(255,138,35,0)" },
        },
      },
      animation: {
        bob: "bob 3.6s ease-in-out infinite",
        pulseRing: "pulseRing 1.8s ease-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
