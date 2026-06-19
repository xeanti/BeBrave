/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fff0f6',
          100: '#ffe0ee',
          400: '#f472b6',
          500: '#ec4899',
          600: '#db2777',
          700: '#be185d',
        },
        accent: {
          400: '#facc15',
          500: '#eab308',
          600: '#ca8a04',
        },
        dark: {
          700: '#2a2a2a',
          800: '#1a1a1a',
          900: '#0f0f0f',
        },
      },
    },
  },
  plugins: [],
};