/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0B5CFF',
          hover: '#0848C7',
          soft: '#E5EFFF',
          link: '#0A5BC4',
        },
        rail: {
          bg: '#0A2A66',
          icon: '#FFFFFF',
          active: '#FFFFFF',
        },
        surface: {
          canvas: '#F3F4F6',
          card: '#FFFFFF',
          border: '#E1E5EB',
          muted: '#5C667A',
          text: '#181B25',
        },
        status: {
          success: '#0F9D58',
          'success-soft': '#DDF5E7',
          warning: '#F5A524',
          'warning-soft': '#FFF1D6',
          danger: '#D92D20',
          'danger-soft': '#FDEBEA',
          info: '#0B5CFF',
          'info-soft': '#E5EFFF',
          neutral: '#5C667A',
          'neutral-soft': '#EDEFF3',
        },
        path: {
          done: '#A8F0E0',
          current: '#0A2A66',
          todo: '#E5E7EB',
        },
      },
      borderRadius: {
        card: '16px',
        input: '8px',
        pill: '9999px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,0.06)',
        popover: '0 8px 24px rgba(16,24,40,0.12)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
