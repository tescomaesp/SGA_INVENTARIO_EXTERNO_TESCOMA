import { supabase } from '@/lib/supabase';

export interface DatosEntrada {
  huecoId: string;
  cantidad: number;
  contactoId: string;
  productoId?: string | null;
  nombre?: string;
  fotoUrl?: string | null;
  coleccionId?: string | null;
  lote?: string;
  fechaCaducidad?: string | null;
  documento?: string;
  notas?: string;
}

export interface ResultadoEntrada {
  movimiento_id: number;
  producto_id: string;
  sku: string;
  nuevo: boolean;
  espacio_libre: number | null;
}

export async function registrarEntrada(d: DatosEntrada): Promise<ResultadoEntrada> {
  const { data, error } = await supabase.rpc('registrar_entrada', {
    p_hueco_id: d.huecoId,
    p_cantidad: d.cantidad,
    p_contacto_id: d.contactoId,
    p_producto_id: d.productoId ?? null,
    p_nombre: d.nombre ?? null,
    p_foto_url: d.fotoUrl ?? null,
    p_coleccion_id: d.coleccionId ?? null,
    p_lote: d.lote || null,
    p_fecha_caducidad: d.fechaCaducidad || null,
    p_documento: d.documento || null,
    p_notas: d.notas || null,
  });
  if (error) throw error;
  return data as ResultadoEntrada;
}
