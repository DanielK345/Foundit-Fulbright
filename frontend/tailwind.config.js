/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          gold: '#F5A623',
          navy: '#1B2B4B',
        },
      },
    },
  },
  plugins: [],
}
