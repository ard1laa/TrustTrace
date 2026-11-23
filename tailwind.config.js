/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(0.97)' }, to: { opacity: '1', transform: 'scale(1)' } },
        'slide-up': { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } }
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'scale-in': 'scale-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'slide-up': 'slide-up 220ms cubic-bezier(0.2, 0.8, 0.2, 1)'
      },
      colors: {
        linkedin: {
          blue: '#0A66C2',
          hover: '#004182',
          light: '#EBF3FB',
          bg: '#F4F2EE',
          card: '#FFFFFF',
          border: '#E0DFDC',
          darkBg: '#0D1117',
          darkCard: '#1B1F23',
          darkBorder: '#30363D'
        }
      }
    }
  },
  plugins: []
};
