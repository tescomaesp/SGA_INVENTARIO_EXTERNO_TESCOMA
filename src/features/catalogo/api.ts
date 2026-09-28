import { supabase } from '@/lib/supabase';
import { comprimirImagen } from '@/lib/almacenamiento';
import { textoBusqueda } from '@/lib/cantidad';
import type { Coleccion, Contacto, FilaStock, Movimiento, Producto } from '@/types/catalogo';

function comprobar<T>(r: { data: unknown; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data as T;
}

/** PostgREST devuelve los numeric como texto en algunos casos: se convierten a número. */
function aNumero<T extends object>(fila: T, campos: (keyof T)[]): T {
  const copia = { ...fila } as Record<keyof T, unknown>;
  for (const c of campos) copia[c] = Number(copia[c] ?? 0);
  return copia as T;
}
const productoNum = (p: Producto) => aNumero(p, ['stock_total', 'stock_minimo']);

export interface FiltroProductos {
  texto?: string;
  coleccionId?: string;
  contactoId?: string;
  soloStockBajo?: boolean;
  incluirBajas?: boolean;
}

export const TAMANO_PAGINA = 25;

export const catalogoApi = {
  /* ---------------- Colecciones ---------------- */
  async colecciones(soloActivas = false): Promise<(Coleccion & { productos: number })[]> {
    let q = supabase.from('colecciones').select('id, nombre, descripcion, activa, productos(count)').order('nombre');
    if (soloActivas) q = q.eq('activa', true);
    const data = comprobar<(Coleccion & { productos: { count: number }[] })[]>(await q);
    return data.map(({ productos, ...c }) => ({ ...c, productos: productos?.[0]?.count ?? 0 }));
  },
  async crearColeccion(v: { nombre: string; descripcion: string | null }) {
    return comprobar<Coleccion>(await supabase.from('colecciones').insert(v).select().single());
  },
  async editarColeccion(id: string, v: Partial<Coleccion>) {
    comprobar(await supabase.from('colecciones').update(v).eq('id', id).select('id').single());
  },
  async borrarColeccion(id: string) {
    comprobar(await supabase.from('colecciones').delete().eq('id', id).select('id').single());
  },

  /* ---------------- Contactos ---------------- */
  async contactos(texto = '', limite = 200): Promise<Contacto[]> {
    let q = supabase.from('contactos').select('id, nombre, empresa, telefono, email, notas').order('nombre').limit(limite);
    const t = textoBusqueda(texto);
    if (t) q = q.or(`nombre.ilike.*${t}*,empresa.ilike.*${t}*`);
    return comprobar(await q);
  },
  async contacto(id: string): Promise<Contacto | null> {
    return comprobar(await supabase.from('contactos').select('id, nombre, empresa, telefono, email, notas').eq('id', id).maybeSingle());
  },
  async crearContacto(v: Omit<Contacto, 'id'>) {
    return comprobar<Contacto>(await supabase.from('contactos').insert(v).select('id, nombre, empresa, telefono, email, notas').single());
  },
  async editarContacto(id: string, v: Omit<Contacto, 'id'>) {
    comprobar(await supabase.from('contactos').update(v).eq('id', id).select('id').single());
  },
  async borrarContacto(id: string) {
    comprobar(await supabase.from('contactos').delete().eq('id', id).select('id').single());
  },

  /* ---------------- Productos ---------------- */
  async productos(filtro: FiltroProductos, pagina = 0): Promise<{ filas: Producto[]; total: number }> {
    let q = supabase.from('v_productos').select('*', { count: 'exact' }).order('nombre').range(pagina * TAMANO_PAGINA, pagina * TAMANO_PAGINA + TAMANO_PAGINA - 1);
    const t = textoBusqueda(filtro.texto ?? '');
    if (t) q = q.or(`nombre.ilike.*${t}*,sku.ilike.*${t}*`);
    if (filtro.coleccionId) q = q.eq('coleccion_id', filtro.coleccionId);
    if (filtro.contactoId) q = q.eq('contacto_id', filtro.contactoId);
    if (filtro.soloStockBajo) q = q.eq('stock_bajo', true);
    if (!filtro.incluirBajas) q = q.eq('activo', true);
    const r = await q;
    if (r.error) throw r.error;
    return { filas: (r.data as Producto[]).map(productoNum), total: r.count ?? 0 };
  },
  /** Búsqueda rápida para el autocompletado. */
  async buscarProductos(texto: string): Promise<Producto[]> {
    const t = textoBusqueda(texto);
    if (!t) return [];
    const data = comprobar<Producto[]>(
      await supabase.from('v_productos').select('*').eq('activo', true).or(`nombre.ilike.*${t}*,sku.ilike.*${t}*`).order('nombre').limit(8),
    );
    return data.map(productoNum);
  },
  async productoPorSku(sku: string): Promise<Producto | null> {
    const p = comprobar<Producto | null>(await supabase.from('v_productos').select('*').eq('sku', sku.trim().toUpperCase()).maybeSingle());
    return p ? productoNum(p) : null;
  },
  async producto(id: string): Promise<Producto | null> {
    const p = comprobar<Producto | null>(await supabase.from('v_productos').select('*').eq('id', id).maybeSingle());
    return p ? productoNum(p) : null;
  },
  async editarProducto(id: string, v: { nombre?: string; foto_url?: string | null; coleccion_id?: string; contacto_id?: string | null; stock_minimo?: number; notas?: string | null; activo?: boolean }) {
    comprobar(await supabase.from('productos').update(v).eq('id', id).select('id').single());
  },

  /** Comprime y sube una foto de producto. Devuelve la ruta dentro del bucket. */
  async subirFoto(archivo: File): Promise<string> {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.');
    const comprimida = await comprimirImagen(archivo, 1600);
    const ruta = `${u.user.id}/${crypto.randomUUID()}.webp`;
    comprobar(await supabase.storage.from('productos').upload(ruta, comprimida, { contentType: 'image/webp' }));
    return ruta;
  },

  /* ---------------- Stock y movimientos ---------------- */
  async stock(filtro: { producto_id?: string; hueco_id?: string; lote_id?: string }): Promise<FilaStock[]> {
    let q = supabase.from('v_stock').select('*').order('codigo_completo');
    if (filtro.producto_id) q = q.eq('producto_id', filtro.producto_id);
    if (filtro.hueco_id) q = q.eq('hueco_id', filtro.hueco_id);
    if (filtro.lote_id) q = q.eq('lote_id', filtro.lote_id);
    return comprobar<FilaStock[]>(await q).map((f) => aNumero(f, ['cantidad']));
  },
  async movimientos(filtro: { producto_id?: string; tipo?: string }, desde = 0, cuantos = 25): Promise<Movimiento[]> {
    let q = supabase.from('v_movimientos').select('*').order('fecha', { ascending: false }).order('id', { ascending: false }).range(desde, desde + cuantos - 1);
    if (filtro.producto_id) q = q.eq('producto_id', filtro.producto_id);
    if (filtro.tipo) q = q.eq('tipo', filtro.tipo);
    return comprobar<Movimiento[]>(await q).map((m) => aNumero(m, ['cantidad']));
  },
};
