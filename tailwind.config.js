/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tinta: '#16212C',       // texto principal
        suave: '#5A6875',       // texto secundario
        fondo: '#EDF0F3',       // fondo de la aplicación
        linea: '#CBD3DC',       // bordes
        acero: { DEFAULT: '#1D4E89', oscuro: '#133760', claro: '#DCE6F2' }, // azul de estantería
        senal: { DEFAULT: '#F5C400', claro: '#FFF4C2' },                    // amarillo de señalización
        peligro: { DEFAULT: '#B3261E', claro: '#FBE4E2' },
        ok: { DEFAULT: '#2E7D4F', claro: '#E1F1E7' },
      },
      fontFamily: {
        sans: ['Barlow', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        rotulo: ['"Barlow Condensed"', 'Barlow', 'system-ui', 'sans-serif'],
      },
      borderRadius: { DEFAULT: '6px' },
    },
  },
  plugins: [],
};
