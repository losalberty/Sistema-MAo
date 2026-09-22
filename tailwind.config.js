/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Inter se carga en app/layout.tsx y queda en esta variable
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        // Color de marca: azul marino. Cambiarlo aqui lo cambia en todo el sistema.
        brand: {
          50: "#f2f5fb",
          100: "#e3e9f5",
          200: "#c5d2ea",
          300: "#9bb1d9",
          400: "#6a88c2",
          500: "#4568a8",
          600: "#34528c",
          700: "#2a4272",
          800: "#22355c",
          900: "#1b2a49",
          950: "#111b30",
        },
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(16 24 40 / 0.04)",
        pop: "0 12px 32px -8px rgb(16 24 40 / 0.22)",
      },
    },
  },
  plugins: [],
};
