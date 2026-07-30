/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{svelte,ts}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Rubik"', "system-ui", "sans-serif"],
      },
    },
  },
};
