/** @type {import('tailwindcss').Config} */
export default {
  content: ["./dashboard/index.html", "./dashboard/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Poppins"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ['"Poppins"', "ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        glow: "0 18px 50px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};
