import { supabase } from '@/lib/supabase';
import { ordenarPorCodigo } from '@/lib/codigos';
import type { Almacen, HuecoPlano, Ocupacion, Pasillo } from '@/types/ubicaciones';

type Tabla = 'almacenes' | 'pasillos' | 'estanterias' | 'niveles' | 'huecos';

function comprobar<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data as T;
}

/** Ordena toda la jerarquía: códigos de forma natural y niveles de arriba (mayor) a abajo. */
function ordenarEstructura(pasillos: Pasillo[]): Pasillo[] {
  return ordenarPorCodigo(pasillos).map((p) => ({
    ...p,
    estanterias: ordenarPorCodigo(p.estanterias).map((e) => ({
      ...e,
      niveles: [...e.niveles].sort((a, b) => b.orden - a.orden).map((n) => ({ ...n, huecos: ordenarPorCodigo(n.huecos) })),
    })),
  }));
}

export interface FiltroHuecos {
  almacen_id?: string;
  pasillo_id?: string;
  estanteria_id?: string;
  nivel_id?: string;
  id?: string;
}

export const ubicacionesApi = {
  async almacenes(): Promise<Almacen[]> {
    return ordenarPorCodigo(comprobar(await supabase.from('almacenes').select('id, codigo, nombre, direccion')));
  },

  async estructura(almacenId: string): Promise<Pasillo[]> {
    const data = comprobar(
      await supabase
        .from('pasillos')
        .select('id, codigo, descripcion, estanterias(id, codigo, descripcion, niveles(id, codigo, orden, huecos(id, codigo, capacidad, activo, notas)))')
        .eq('almacen_id', almacenId),
    );
    return ordenarEstructura(data as unknown as Pasillo[]);
  },

  async ocupacion(almacenId: string): Promise<Map<string, Ocupacion>> {
    const mapa = new Map<string, Ocupacion>();
    for (let desde = 0; ; desde += 1000) {
      const pagina = comprobar(
        await supabase.from('v_ocupacion_huecos').select('hueco_id, unidades, referencias').eq('almacen_id', almacenId).range(desde, desde + 999),
      ) as Ocupacion[];
      for (const o of pagina) mapa.set(o.hueco_id, { ...o, unidades: Number(o.unidades) });
      if (pagina.length < 1000) break;
    }
    return mapa;
  },

  /** Huecos con su ruta completa. Pagina de 1000 en 1000 (límite por petición de Supabase). */
  async huecosPlanos(filtro: FiltroHuecos): Promise<HuecoPlano[]> {
    const todos: HuecoPlano[] = [];
    for (let desde = 0; ; desde += 1000) {
      let q = supabase.from('v_huecos').select('*').order('codigo_completo').range(desde, desde + 999);
      for (const [campo, valor] of Object.entries(filtro)) if (valor) q = q.eq(campo, valor);
      const pagina = comprobar(await q) as HuecoPlano[];
      todos.push(...pagina);
      if (pagina.length < 1000) break;
    }
    const col = new Intl.Collator('es', { numeric: true });
    return todos.sort((a, b) => col.compare(a.codigo_completo, b.codigo_completo));
  },

  async huecoPorCodigo(codigo: string): Promise<HuecoPlano | null> {
    const data = comprobar(await supabase.from('v_huecos').select('*').eq('codigo_completo', codigo).maybeSingle());
    return data as HuecoPlano | null;
  },

  async crearAlmacen(v: { codigo: string; nombre: string; direccion: string | null }) {
    return comprobar(await supabase.from('almacenes').insert(v).select('id').single()) as { id: string };
  },

  async generarPasillo(v: { almacenId: string; codigo: string; descripcion: string; estanterias: number; niveles: number; huecos: number; capacidad: number | null }) {
    comprobar(
      await supabase.rpc('generar_pasillo', {
        p_almacen_id: v.almacenId,
        p_codigo: v.codigo,
        p_estanterias: v.estanterias,
        p_niveles: v.niveles,
        p_huecos: v.huecos,
        p_capacidad: v.capacidad,
        p_descripcion: v.descripcion,
      }),
    );
  },

  async generarEstanteria(v: { pasilloId: string; codigo: string; descripcion: string; niveles: number; huecos: number; capacidad: number | null }) {
    comprobar(
      await supabase.rpc('generar_estanteria', {
        p_pasillo_id: v.pasilloId,
        p_codigo: v.codigo,
        p_niveles: v.niveles,
        p_huecos: v.huecos,
        p_capacidad: v.capacidad,
        p_descripcion: v.descripcion,
      }),
    );
  },

  async anadirNivel(estanteriaId: string, huecos: number, capacidad: number | null) {
    comprobar(await supabase.rpc('anadir_nivel', { p_estanteria_id: estanteriaId, p_huecos: huecos, p_capacidad: capacidad }));
  },

  async anadirHueco(nivelId: string, capacidad: number | null) {
    comprobar(await supabase.rpc('anadir_hueco', { p_nivel_id: nivelId, p_capacidad: capacidad }));
  },

  async editar(tabla: Tabla, id: string, cambios: Record<string, unknown>) {
    const filas = comprobar(await supabase.from(tabla).update(cambios).eq('id', id).select('id'));
    if (!(filas as unknown[]).length) throw new Error('No tienes permiso para hacer esta operación.');
  },

  async borrar(tabla: Tabla, id: string) {
    const filas = comprobar(await supabase.from(tabla).delete().eq('id', id).select('id'));
    if (!(filas as unknown[]).length) throw new Error('No tienes permiso para hacer esta operación.');
  },
};
