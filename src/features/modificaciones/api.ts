import { supabase } from '@/lib/supabase';

export type TipoElemento = 'almacen' | 'pasillo' | 'estanteria' | 'nivel' | 'hueco' | 'producto' | 'coleccion' | 'contacto';

export interface ElementoAEliminar {
  tipo: TipoElemento;
  id: string;
  /** Texto que ve el administrador en la confirmación (código, nombre…). */
  descripcion: string;
  /** Aviso opcional, p. ej. «se retirarán 20 uds de stock». */
  aviso?: string;
}

export interface ResultadoEliminacion {
  eliminados: { tipo: TipoElemento; id: string; descripcion: string }[];
  bloqueados: { tipo: TipoElemento; id: string; descripcion: string; motivo: string }[];
}

export const NOMBRE_TIPO: Record<TipoElemento, [string, string]> = {
  almacen: ['almacén', 'almacenes'],
  pasillo: ['pasillo', 'pasillos'],
  estanteria: ['estantería', 'estanterías'],
  nivel: ['nivel', 'niveles'],
  hueco: ['hueco', 'huecos'],
  producto: ['producto', 'productos'],
  coleccion: ['colección', 'colecciones'],
  contacto: ['contacto', 'contactos'],
};

export interface EntradaRegistro {
  id: number;
  fecha: string;
  usuario_id: string | null;
  usuario_nombre: string;
  accion: 'eliminacion' | 'edicion';
  entidad: TipoElemento;
  entidad_id: string;
  descripcion: string;
  motivo: string | null;
  detalle: Record<string, unknown>;
}

export interface FiltroRegistro {
  accion?: string;
  entidad?: string;
  usuario?: string;
  desde?: string;
  hasta?: string;
  texto?: string;
}

const inicioDia = (dia: string, mas = 0) => {
  const d = new Date(`${dia}T00:00:00`);
  d.setDate(d.getDate() + mas);
  return d.toISOString();
};

export const modificacionesApi = {
  /** Elimina uno o varios elementos. Los que no se pueden eliminar vuelven en «bloqueados» con el motivo. */
  async eliminar(elementos: Pick<ElementoAEliminar, 'tipo' | 'id'>[], motivo?: string): Promise<ResultadoEliminacion> {
    const { data, error } = await supabase.rpc('eliminar_elementos', {
      p_elementos: elementos.map(({ tipo, id }) => ({ tipo, id })),
      p_motivo: motivo?.trim() || null,
    });
    if (error) throw error;
    return data as ResultadoEliminacion;
  },

  async registro(f: FiltroRegistro, desde = 0, cuantos = 50): Promise<{ filas: EntradaRegistro[]; total: number }> {
    let q = supabase
      .from('registro_modificaciones')
      .select('*', { count: 'exact' })
      .order('fecha', { ascending: false })
      .order('id', { ascending: false })
      .range(desde, desde + cuantos - 1);
    if (f.accion) q = q.eq('accion', f.accion);
    if (f.entidad) q = q.eq('entidad', f.entidad);
    if (f.usuario) q = q.eq('usuario_id', f.usuario);
    if (f.desde) q = q.gte('fecha', inicioDia(f.desde));
    if (f.hasta) q = q.lt('fecha', inicioDia(f.hasta, 1));
    const t = (f.texto ?? '').replace(/[,()*%\\:"']/g, ' ').trim();
    if (t) q = q.or(`descripcion.ilike.*${t}*,motivo.ilike.*${t}*`);
    const r = await q;
    if (r.error) throw r.error;
    return { filas: r.data as EntradaRegistro[], total: r.count ?? 0 };
  },
};
