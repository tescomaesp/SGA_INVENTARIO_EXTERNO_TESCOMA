const fmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 });

/** 1234.500 → "1.234,5". PostgREST devuelve los numeric como número o texto. */
export const formatearCantidad = (v: number | string | null | undefined) => fmt.format(Number(v ?? 0));

/**
 * Interpreta lo que escribe el usuario: "12,5" y "12.5" → 12.5; "1.200,5" → 1200.5.
 * Si hay coma, los puntos se toman como separador de miles.
 */
export function leerCantidad(texto: string): number | null {
  const t = texto.trim().replace(/\s/g, '');
  const limpio = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/** Quita de un texto de búsqueda los caracteres con significado en los filtros de PostgREST. */
export const textoBusqueda = (t: string) => t.replace(/[,()*%\\:"']/g, ' ').trim();
