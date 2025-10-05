import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./renderer/index.html', './renderer/src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
      },
      colors: {
        surface: {
          100: '#0f172a',
          200: '#111c2f',
          300: '#152036',
          400: '#1a243d',
        },
      },
      boxShadow: {
        card: '0 10px 40px -20px rgba(15, 23, 42, 0.9)',
      },
    },
  },
  plugins: [],
};

export default config;
