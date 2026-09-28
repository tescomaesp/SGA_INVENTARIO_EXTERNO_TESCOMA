import { supabase } from '@/lib/supabase';
import type { MotivoAjuste, MotivoSalida } from '@/lib/motivos';

async function llamar<T>(funcion: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(funcion, args);
  if (error) throw error;
  return data as T;
}

export const movimientosApi = {
  salida: (d: { productoId: string; huecoId: string; loteId: string | null; cantidad: number; motivo: MotivoSalida; destino?: string; documento?: string; notas?: string }) =>
    llamar<{ movimiento_id: number; restante: number }>('registrar_salida', {
      p_producto_id: d.productoId,
      p_hueco_id: d.huecoId,
      p_cantidad: d.cantidad,
      p_motivo: d.motivo,
      p_lote_id: d.loteId,
      p_destino_externo: d.destino || null,
      p_documento: d.documento || null,
      p_notas: d.notas || null,
    }),

  traslado: (d: { productoId: string; origenId: string; destinoId: string; loteId: string | null; cantidad: number; notas?: string }) =>
    llamar<{ movimiento_id: number; restante_origen: number; espacio_libre_destino: number | null }>('registrar_traslado', {
      p_producto_id: d.productoId,
      p_hueco_origen_id: d.origenId,
      p_hueco_destino_id: d.destinoId,
      p_cantidad: d.cantidad,
      p_lote_id: d.loteId,
      p_notas: d.notas || null,
    }),

  ajuste: (d: { productoId: string; huecoId: string; loteId: string | null; cantidadReal: number; motivo: MotivoAjuste; notas: string }) =>
    llamar<{ movimiento_id: number; anterior: number; diferencia: number }>('registrar_ajuste', {
      p_producto_id: d.productoId,
      p_hueco_id: d.huecoId,
      p_cantidad_real: d.cantidadReal,
      p_motivo: d.motivo,
      p_notas: d.notas,
      p_lote_id: d.loteId,
    }),
};
