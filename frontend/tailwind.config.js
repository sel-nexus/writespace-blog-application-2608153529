/** Keep the editorial palette and type decisions in semantic Tailwind tokens. */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        background: '#faf7ef',
        surface: '#fffdf8',
        'surface-raised': '#f0ebdf',
        foreground: '#183c39',
        'foreground-muted': '#56645e',
        border: '#d8d5c9',
        ring: '#17736b',
        primary: { DEFAULT: '#124e4a', light: '#e3eeea', hover: '#0a3b38', foreground: '#fffdf8' },
        secondary: { DEFAULT: '#a65b3f', light: '#f6e8de' },
        error: { DEFAULT: '#9b3027', light: '#fceee8' },
        warning: { DEFAULT: '#725221', light: '#f5ecda' },
        success: { DEFAULT: '#225e41', light: '#e6f0e8' },
      },
      fontFamily: {
        sans: ['Source Sans 3', 'sans-serif'],
        display: ['Playfair Display', 'serif'],
      },
      fontSize: { hero: ['clamp(2.5rem, 5vw, 4.5rem)', { lineHeight: '1.08', letterSpacing: '-0.035em' }] },
      boxShadow: { editorial: '0 12px 40px -20px rgb(24 60 57 / 0.3)' },
    },
  },
  plugins: [],
};
