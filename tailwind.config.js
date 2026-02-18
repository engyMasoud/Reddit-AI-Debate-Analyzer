/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        reddit: {
          dark: "#030303",
          light: "#ffffff",
          gray: "#818384",
          page: "#fafafa",
          border: "#ccc",
        },
      },
    },
  },
  plugins: [],
}
