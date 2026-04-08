/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0a0a0a',
          surface: '#121212',
        },
        neon: {
          blue: '#00a8ff',
          green: '#00ff99',
          yellow: '#ffd633',
          red: '#ff4c4c',
        }
      },
      boxShadow: {
        'glow-blue': '0 0 20px rgba(0, 168, 255, 0.5)',
        'glow-green': '0 0 20px rgba(0, 255, 153, 0.5)',
        'glow-yellow': '0 0 20px rgba(255, 214, 51, 0.5)',
        'glow-red': '0 0 20px rgba(255, 76, 76, 0.5)',
      }
    },
  },
  plugins: [],
}

