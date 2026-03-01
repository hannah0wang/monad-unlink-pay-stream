/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        monad: {
          purple: '#836EF9',
          dark: '#0E0E16',
          card: '#14141F',
          border: '#2A2A3A',
        },
      },
    },
  },
  plugins: [],
}
