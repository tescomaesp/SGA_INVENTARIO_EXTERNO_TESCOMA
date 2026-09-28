import { supabase } from '@/lib/supabase';

/** Zona horaria del navegador, para que "hoy" y los rangos de fechas sean los del usuario. */
export const ZONA = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid';

/** Cualquier consulta de Supabase que admita .range() (tipado flexible a propósito). */
interface Consulta {
  range: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>;
}

/** Descarga todas las filas de una consulta, de 1000 en 1000 (límite por petición de Supabase). */
export async function todasLasFilas<T>(crear: () => Consulta): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await crear().range(desde, desde + 999);
    if (error) throw error;
    const pagina = (data ?? []) as T[];
    filas.push(...pagina);
    if (pagina.length < 1000) break;
    if (filas.length >= 100_000) break; // tope de seguridad para el navegador
  }
  return filas;
}

export async function rpc<T>(funcion: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(funcion, { ...args, p_zona: ZONA });
  if (error) throw error;
  return data as T;
}

/** Inicio del día local en ISO, para filtrar columnas timestamptz. */
export const inicioDia = (dia: string, sumarDias = 0) => {
  const d = new Date(`${dia}T00:00:00`);
  d.setDate(d.getDate() + sumarDias);
  return d.toISOString();
};

/** Fecha local en formato AAAA-MM-DD. */
export const fechaLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
