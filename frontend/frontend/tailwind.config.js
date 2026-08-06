/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          950: '#0a0f14',
          900: '#0f151c',
          850: '#131a22',
          800: '#1a232d',
          700: '#26323f',
          600: '#3a4a5a'
        },
        accent: {
          DEFAULT: '#2dd4bf',
          dim: '#14b8a6',
          bright: '#5eead4'
        },
        aqi: {
          good: '#4ade80',
          moderate: '#facc15',
          sensitive: '#fb923c',
          unhealthy: '#f87171',
          veryUnhealthy: '#c084fc',
          hazardous: '#a16207'
        }
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace']
      }
    }
  },
  plugins: []
};
