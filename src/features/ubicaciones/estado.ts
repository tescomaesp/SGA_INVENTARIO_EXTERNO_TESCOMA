import type { EstadoHueco, Hueco, Ocupacion } from '@/types/ubicaciones';

export function estadoHueco(h: Hueco, o: Ocupacion | undefined): EstadoHueco {
  if (!h.activo) return 'bloqueado';
  const u = o?.unidades ?? 0;
  if (u <= 0) return 'vacio';
  if (!h.capacidad) return 'ocupado';
  return u >= h.capacidad ? 'lleno' : 'parcial';
}

/** Estilos de cada estado en el mapa. El texto acompaña siempre al color. */
export const ESTADOS: Record<EstadoHueco, { texto: string; celda: string }> = {
  vacio: { texto: 'Vacío', celda: 'bg-white border-linea text-suave hover:border-acero' },
  parcial: { texto: 'Con mercancía', celda: 'bg-acero-claro border-acero/40 text-acero-oscuro hover:border-acero' },
  ocupado: { texto: 'Con mercancía (sin capacidad definida)', celda: 'bg-acero-claro border-acero/40 text-acero-oscuro hover:border-acero' },
  lleno: { texto: 'Lleno', celda: 'bg-acero border-acero text-white hover:bg-acero-oscuro' },
  bloqueado: { texto: 'Bloqueado', celda: 'celda-bloqueada border-linea text-suave hover:border-tinta' },
};

export const LEYENDA: EstadoHueco[] = ['vacio', 'parcial', 'lleno', 'bloqueado'];
