import { supabase } from '@/lib/supabase';
import { textoBusqueda } from '@/lib/cantidad';
import type { Lote, MovimientoTraza, TipoMovimiento } from '@/types/catalogo';

export interface FiltroTraza {
  producto?: string;
  lote?: string;
  tipos?: TipoMovimiento[];
  usuario?: string;
  contacto?: string;
  hueco?: string;
  ubicacion?: string; // parte de un código: "P01-E03"
  desde?: string; // AAAA-MM-DD (día incluido, hora local)
  hasta?: string; // AAAA-MM-DD (día incluido, hora local)
  texto?: string; // documento o destino
}

const NUMERICOS = ['cantidad', 'variacion', 'saldo_producto', 'saldo_lote'] as const;

function aNumeros<T extends object>(fila: T): T {
  const c = { ...fila } as Record<string, unknown>;
  for (const k of NUMERICOS) if (c[k] !== null && c[k] !== undefined) c[k] = Number(c[k]);
  return c as T;
}

/** Inicio del día local en ISO (para filtrar timestamptz). */
const inicioDia = (dia: string, sumarDias = 0) => {
  const d = new Date(`${dia}T00:00:00`);
  d.setDate(d.getDate() + sumarDias);
  return d.toISOString();
};

export const trazabilidadApi = {
  async movimientos(f: FiltroTraza, desde = 0, cuantos = 50): Promise<{ filas: MovimientoTraza[]; total: number }> {
    let q = supabase
      .from('v_trazabilidad')
      .select('*', { count: 'exact' })
      .order('fecha', { ascending: false })
      .order('id', { ascending: false })
      .range(desde, desde + cuantos - 1);

    if (f.producto) q = q.eq('producto_id', f.producto);
    if (f.lote) q = q.eq('lote_id', f.lote);
    if (f.tipos?.length) q = q.in('tipo', f.tipos);
    if (f.usuario) q = q.eq('usuario_id', f.usuario);
    if (f.contacto) q = q.eq('contacto_id', f.contacto);
    if (f.desde) q = q.gte('fecha', inicioDia(f.desde));
    if (f.hasta) q = q.lt('fecha', inicioDia(f.hasta, 1));

    // Condiciones "o" (varias columnas): se combinan con "y" entre sí
    const grupos: string[] = [];
    if (f.hueco) grupos.push(`hueco_origen_id.eq.${f.hueco},hueco_destino_id.eq.${f.hueco}`);
    const ubic = textoBusqueda(f.ubicacion ?? '').toUpperCase();
    if (ubic) grupos.push(`origen_codigo.ilike.*${ubic}*,destino_codigo.ilike.*${ubic}*`);
    const t = textoBusqueda(f.texto ?? '');
    if (t) grupos.push(`documento.ilike.*${t}*,destino_externo.ilike.*${t}*,notas.ilike.*${t}*`);
    if (grupos.length === 1) q = q.or(grupos[0]);
    else if (grupos.length > 1) q = q.or(`and(${grupos.map((g) => `or(${g})`).join(',')})`);

    const r = await q;
    if (r.error) throw r.error;
    return { filas: (r.data as MovimientoTraza[]).map(aNumeros), total: r.count ?? 0 };
  },

  /** Todos los movimientos de un lote en orden cronológico (para el informe del lote). */
  async recorridoLote(loteId: string, productoId: string): Promise<MovimientoTraza[]> {
    const todos: MovimientoTraza[] = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await supabase
        .from('v_trazabilidad')
        .select('*')
        .eq('producto_id', productoId)
        .eq('lote_id', loteId)
        .order('fecha')
        .order('id')
        .range(desde, desde + 999);
      if (error) throw error;
      todos.push(...(data as MovimientoTraza[]).map(aNumeros));
      if (data.length < 1000) break;
    }
    return todos;
  },

  async lote(id: string): Promise<Lote | null> {
    const { data, error } = await supabase.from('v_lotes').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? aLote(data as Lote) : null;
  },

  async lotesDeProducto(productoId: string): Promise<Lote[]> {
    const { data, error } = await supabase.from('v_lotes').select('*').eq('producto_id', productoId).order('creado_en', { ascending: false });
    if (error) throw error;
    return (data as Lote[]).map(aLote);
  },

  async usuarios(): Promise<{ id: string; nombre_completo: string; email: string }[]> {
    const { data, error } = await supabase.from('perfiles').select('id, nombre_completo, email').order('nombre_completo');
    if (error) throw error;
    return data;
  },
};

function aLote(l: Lote): Lote {
  return { ...l, entrado: Number(l.entrado), salido: Number(l.salido), ajuste_neto: Number(l.ajuste_neto), stock_actual: Number(l.stock_actual) };
}
