import { supabase } from '@/lib/supabase';

/** Lo que está fuera pendiente de volver de un producto en un evento. */
export interface Pendiente {
  producto_id: string;
  sku: string;
  nombre: string;
  foto_url: string | null;
  /** Nombre del evento tal y como se escribió en la primera salida ('' = sin evento indicado). */
  evento: string;
  clave_evento: string;
  salido: number;
  devuelto: number;
  pendiente: number;
  primera_salida: string;
  ultima_salida: string;
  ultima_devolucion: string | null;
  hueco_ultima_salida: string | null;
}

export const SIN_EVENTO = 'Sin evento indicado';
export const nombreEvento = (e: string) => e || SIN_EVENTO;

const aNumero = (p: Pendiente): Pendiente => ({ ...p, salido: Number(p.salido), devuelto: Number(p.devuelto), pendiente: Number(p.pendiente) });

export const prestamosApi = {
  async pendientes(): Promise<Pendiente[]> {
    const { data, error } = await supabase.from('v_prestamos_pendientes').select('*').order('primera_salida').limit(5000);
    if (error) throw error;
    return (data as Pendiente[]).map(aNumero);
  },

  /** Eventos con algo pendiente de volver, para sugerirlos al registrar una salida. */
  async eventosAbiertos(): Promise<string[]> {
    const { data, error } = await supabase.from('v_prestamos_pendientes').select('evento').neq('evento', '').limit(5000);
    if (error) throw error;
    return [...new Set((data as { evento: string }[]).map((d) => d.evento))].sort((a, b) => a.localeCompare(b, 'es'));
  },

  async registrarDevolucion(d: { producto_id: string; evento: string; cantidad: number; hueco_id: string; contacto_id?: string | null; notas?: string; lote?: string }) {
    const { data, error } = await supabase.rpc('registrar_devolucion', {
      p_producto_id: d.producto_id,
      p_evento: d.evento,
      p_cantidad: d.cantidad,
      p_hueco_id: d.hueco_id,
      p_contacto_id: d.contacto_id ?? null,
      p_notas: d.notas?.trim() || null,
      p_lote: d.lote?.trim() || null,
    });
    if (error) throw error;
    return data as { movimiento_id: number; pendiente: number; espacio_libre: number | null };
  },
};

/** Días que lleva fuera desde la primera salida. */
export function diasFuera(desde: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(desde).getTime()) / 86_400_000));
}
