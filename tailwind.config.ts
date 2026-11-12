import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      // スタッフ画面の着せ替え用。実際の色は globals.css の CSS 変数（src/lib/themes.ts 参照）
      colors: {
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          soft: 'rgb(var(--accent-soft) / <alpha-value>)',
        },
        page: 'rgb(var(--page) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};

export default config;
