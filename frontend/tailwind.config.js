/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: "#1e1b4b",      // indigo-950
          light: "#ffffff",
          gray: "#64748b",      // slate-500
          page: "#f8fafc",      // slate-50
          border: "#e2e8f0",    // slate-200
          primary: "#7c3aed",   // violet-600
          primaryHover: "#6d28d9", // violet-700
          accent: "#4f46e5",    // indigo-600
        },
      },
    },
  },
  plugins: [],
}
