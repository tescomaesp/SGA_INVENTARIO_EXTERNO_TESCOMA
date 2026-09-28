import { supabase } from '@/lib/supabase';
import type { Columna } from '@/lib/exportar';
import { textoMotivo } from '@/lib/motivos';
import { TIPO_MOVIMIENTO } from '@/components/FilaMovimiento';
import type { TipoMovimiento } from '@/types/catalogo';
import { inicioDia, rpc, todasLasFilas } from './api';

export interface FiltrosInforme {
  desde: string;
  hasta: string;
  tipo: TipoMovimiento | '';
  usuario: string;
  coleccion: string;
  almacen: string;
  vistaStock: 'lineas' | 'productos';
  agrupacion: 'hueco' | 'estanteria' | 'pasillo';
}

export type CampoFiltro = 'fechas' | 'tipo' | 'usuario' | 'coleccion' | 'almacen' | 'vistaStock' | 'agrupacion';

type Fila = Record<string, unknown>;

export interface Informe {
  id: string;
  titulo: string;
  descripcion: string;
  filtros: CampoFiltro[];
  cargar: (f: FiltrosInforme) => Promise<Fila[]>;
  columnas: (f: FiltrosInforme) => Columna<Fila>[];
}

const txt = (clave: string) => (f: Fila) => (f[clave] as string | null) ?? null;
const num = (clave: string) => (f: Fila) => (f[clave] === null || f[clave] === undefined ? null : Number(f[clave]));

/* ---------------------------------------------------------------------------------- */

const stock: Informe = {
  id: 'stock',
  titulo: 'Stock actual',
  descripcion: 'Qué hay en el almacén ahora mismo, por ubicación y lote o en total por producto.',
  filtros: ['vistaStock', 'coleccion', 'almacen'],
  cargar: async (f) => {
    if (f.vistaStock === 'productos') {
      return todasLasFilas<Fila>(() => {
        let q = supabase.from('v_productos').select('*').eq('activo', true).order('nombre');
        if (f.coleccion) q = q.eq('coleccion_id', f.coleccion);
        return q;
      });
    }
    return todasLasFilas<Fila>(() => {
      let q = supabase.from('v_informe_stock').select('*').order('producto_nombre').order('codigo_completo');
      if (f.coleccion) q = q.eq('coleccion_id', f.coleccion);
      if (f.almacen) q = q.eq('almacen_id', f.almacen);
      return q;
    });
  },
  columnas: (f) =>
    f.vistaStock === 'productos'
      ? [
          { titulo: 'SKU', valor: txt('sku'), ancho: 10 },
          { titulo: 'Producto', valor: txt('nombre'), ancho: 34 },
          { titulo: 'Colección', valor: txt('coleccion_nombre'), ancho: 18 },
          { titulo: 'Contacto', valor: txt('contacto_nombre'), ancho: 18 },
          { titulo: 'Stock', valor: num('stock_total'), tipo: 'numero', ancho: 10, total: true },
          { titulo: 'Mínimo', valor: (r) => (Number(r.stock_minimo) > 0 ? Number(r.stock_minimo) : null), tipo: 'numero', ancho: 9 },
          { titulo: 'Ubicaciones', valor: num('ubicaciones'), tipo: 'numero', ancho: 10 },
          { titulo: 'Stock bajo', valor: (r) => (r.stock_bajo ? 'Sí' : ''), ancho: 9 },
        ]
      : [
          { titulo: 'SKU', valor: txt('sku'), ancho: 10 },
          { titulo: 'Producto', valor: txt('producto_nombre'), ancho: 32 },
          { titulo: 'Colección', valor: txt('coleccion_nombre'), ancho: 16 },
          { titulo: 'Almacén', valor: txt('almacen_nombre'), ancho: 14 },
          { titulo: 'Ubicación', valor: txt('codigo_completo'), ancho: 22 },
          { titulo: 'Lote', valor: txt('lote_codigo'), ancho: 12 },
          { titulo: 'Caducidad', valor: txt('fecha_caducidad'), tipo: 'fecha', ancho: 11 },
          { titulo: 'Cantidad', valor: num('cantidad'), tipo: 'numero', ancho: 10, total: true },
        ],
};

const movimientos: Informe = {
  id: 'movimientos',
  titulo: 'Movimientos',
  descripcion: 'Entradas, salidas, traslados y ajustes de un periodo, con todos sus datos.',
  filtros: ['fechas', 'tipo', 'usuario', 'coleccion'],
  cargar: (f) =>
    todasLasFilas<Fila>(() => {
      let q = supabase
        .from('v_informe_movimientos')
        .select('*')
        .gte('fecha', inicioDia(f.desde))
        .lt('fecha', inicioDia(f.hasta, 1))
        .order('fecha')
        .order('id');
      if (f.tipo) q = q.eq('tipo', f.tipo);
      if (f.usuario) q = q.eq('usuario_id', f.usuario);
      if (f.coleccion) q = q.eq('coleccion_id', f.coleccion);
      return q;
    }),
  columnas: () => [
    { titulo: 'Fecha', valor: txt('fecha'), tipo: 'fechahora', ancho: 15 },
    { titulo: 'Tipo', valor: (r) => TIPO_MOVIMIENTO[r.tipo as TipoMovimiento]?.texto ?? String(r.tipo), ancho: 9 },
    { titulo: 'SKU', valor: txt('sku'), ancho: 9 },
    { titulo: 'Producto', valor: txt('producto_nombre'), ancho: 26 },
    { titulo: 'Colección', valor: txt('coleccion_nombre'), ancho: 14 },
    {
      titulo: 'Cantidad',
      // Con signo según el efecto en el stock; los traslados no cambian el total
      valor: (r) => {
        const c = Number(r.cantidad);
        if (r.tipo === 'salida' || (r.tipo === 'ajuste' && !r.hueco_destino_id)) return -c;
        return c;
      },
      tipo: 'numero',
      ancho: 9,
    },
    { titulo: 'Origen', valor: txt('origen_codigo'), ancho: 20 },
    { titulo: 'Destino', valor: txt('destino_codigo'), ancho: 20 },
    { titulo: 'Lote', valor: txt('lote_codigo'), ancho: 10 },
    { titulo: 'Motivo', valor: (r) => textoMotivo(r.motivo as string | null), ancho: 16 },
    { titulo: 'Destino externo', valor: txt('destino_externo'), ancho: 16 },
    { titulo: 'Documento', valor: txt('documento'), ancho: 12 },
    { titulo: 'Contacto', valor: txt('contacto_nombre'), ancho: 14 },
    { titulo: 'Usuario', valor: txt('usuario_nombre'), ancho: 14 },
    { titulo: 'Notas', valor: txt('notas'), ancho: 20 },
  ],
};

const usuarios: Informe = {
  id: 'usuarios',
  titulo: 'Actividad por usuario',
  descripcion: 'Cuántas operaciones y unidades ha registrado cada persona en el periodo.',
  filtros: ['fechas'],
  cargar: (f) => rpc<Fila[]>('informe_por_usuario', { p_desde: f.desde, p_hasta: f.hasta }),
  columnas: () => [
    { titulo: 'Usuario', valor: (r) => (r.usuario_nombre as string) || (r.email as string), ancho: 22 },
    { titulo: 'Email', valor: txt('email'), ancho: 24 },
    { titulo: 'Entradas', valor: num('entradas'), tipo: 'numero', ancho: 9, total: true },
    { titulo: 'Uds. entrada', valor: num('unidades_entrada'), tipo: 'numero', ancho: 11, total: true },
    { titulo: 'Salidas', valor: num('salidas'), tipo: 'numero', ancho: 9, total: true },
    { titulo: 'Uds. salida', valor: num('unidades_salida'), tipo: 'numero', ancho: 11, total: true },
    { titulo: 'Traslados', valor: num('traslados'), tipo: 'numero', ancho: 9, total: true },
    { titulo: 'Ajustes', valor: num('ajustes'), tipo: 'numero', ancho: 9, total: true },
    { titulo: 'Total', valor: num('total'), tipo: 'numero', ancho: 8, total: true },
    { titulo: 'Último movimiento', valor: txt('ultimo_movimiento'), tipo: 'fechahora', ancho: 16 },
  ],
};

const colecciones: Informe = {
  id: 'colecciones',
  titulo: 'Resumen por colección',
  descripcion: 'Referencias, stock actual y unidades que han entrado y salido en el periodo por colección.',
  filtros: ['fechas'],
  cargar: (f) => rpc<Fila[]>('informe_por_coleccion', { p_desde: f.desde, p_hasta: f.hasta }),
  columnas: () => [
    { titulo: 'Colección', valor: txt('coleccion_nombre'), ancho: 26 },
    { titulo: 'Estado', valor: (r) => (r.activa ? 'Activa' : 'Inactiva'), ancho: 9 },
    { titulo: 'Referencias', valor: num('referencias'), tipo: 'numero', ancho: 10, total: true },
    { titulo: 'Con stock bajo', valor: num('referencias_stock_bajo'), tipo: 'numero', ancho: 12, total: true },
    { titulo: 'Stock actual', valor: num('stock_actual'), tipo: 'numero', ancho: 12, total: true },
    { titulo: 'Uds. entradas', valor: num('unidades_entrada'), tipo: 'numero', ancho: 12, total: true },
    { titulo: 'Uds. salidas', valor: num('unidades_salida'), tipo: 'numero', ancho: 12, total: true },
    { titulo: 'Movimientos', valor: num('movimientos'), tipo: 'numero', ancho: 11, total: true },
  ],
};

const ubicaciones: Informe = {
  id: 'ubicaciones',
  titulo: 'Ocupación por ubicación',
  descripcion: 'Unidades y ocupación de cada hueco, estantería o pasillo.',
  filtros: ['almacen', 'agrupacion'],
  cargar: async (f) => {
    const filas = await todasLasFilas<Fila>(() => {
      let q = supabase.from('v_informe_ubicaciones').select('*').order('codigo_completo');
      if (f.almacen) q = q.eq('almacen_id', f.almacen);
      return q;
    });
    const col = new Intl.Collator('es', { numeric: true });
    filas.sort((a, b) => col.compare(String(a.codigo_completo), String(b.codigo_completo)));
    if (f.agrupacion === 'hueco') return filas;

    // Agrupar por estantería o pasillo
    const grupos = new Map<string, Fila>();
    for (const h of filas) {
      const clave =
        f.agrupacion === 'pasillo' ? `${h.almacen_codigo}-${h.pasillo_codigo}` : `${h.almacen_codigo}-${h.pasillo_codigo}-${h.estanteria_codigo}`;
      const g =
        grupos.get(clave) ??
        ({ codigo: clave, almacen_nombre: h.almacen_nombre, pasillo_codigo: h.pasillo_codigo, estanteria_codigo: h.estanteria_codigo, huecos: 0, con_mercancia: 0, bloqueados: 0, capacidad: 0, unidades: 0, unidades_con_capacidad: 0, sin_capacidad: 0 } as Fila);
      g.huecos = Number(g.huecos) + 1;
      if (Number(h.unidades) > 0) g.con_mercancia = Number(g.con_mercancia) + 1;
      if (!h.activo) g.bloqueados = Number(g.bloqueados) + 1;
      g.unidades = Number(g.unidades) + Number(h.unidades);
      if (h.capacidad !== null) {
        g.capacidad = Number(g.capacidad) + Number(h.capacidad);
        g.unidades_con_capacidad = Number(g.unidades_con_capacidad) + Number(h.unidades);
      } else g.sin_capacidad = Number(g.sin_capacidad) + 1;
      grupos.set(clave, g);
    }
    return [...grupos.values()].map((g) => ({
      ...g,
      porcentaje: Number(g.capacidad) > 0 ? Math.round((Number(g.unidades_con_capacidad) * 1000) / Number(g.capacidad)) / 10 : null,
    }));
  },
  columnas: (f) =>
    f.agrupacion === 'hueco'
      ? [
          { titulo: 'Ubicación', valor: txt('codigo_completo'), ancho: 22 },
          { titulo: 'Almacén', valor: txt('almacen_nombre'), ancho: 14 },
          { titulo: 'Pasillo', valor: txt('pasillo_codigo'), ancho: 8 },
          { titulo: 'Estantería', valor: txt('estanteria_codigo'), ancho: 9 },
          { titulo: 'Nivel', valor: txt('nivel_codigo'), ancho: 7 },
          { titulo: 'Hueco', valor: txt('hueco_codigo'), ancho: 7 },
          { titulo: 'Capacidad', valor: num('capacidad'), tipo: 'numero', ancho: 10, total: true },
          { titulo: 'Unidades', valor: num('unidades'), tipo: 'numero', ancho: 10, total: true },
          { titulo: 'Referencias', valor: num('referencias'), tipo: 'numero', ancho: 10 },
          { titulo: 'Ocupación', valor: num('porcentaje'), tipo: 'porcentaje', ancho: 10 },
          { titulo: 'Estado', valor: (r) => (!r.activo ? 'Bloqueado' : Number(r.unidades) > 0 ? 'Con mercancía' : 'Vacío'), ancho: 12 },
        ]
      : [
          { titulo: f.agrupacion === 'pasillo' ? 'Pasillo' : 'Estantería', valor: txt('codigo'), ancho: 18 },
          { titulo: 'Almacén', valor: txt('almacen_nombre'), ancho: 14 },
          { titulo: 'Huecos', valor: num('huecos'), tipo: 'numero', ancho: 8, total: true },
          { titulo: 'Con mercancía', valor: num('con_mercancia'), tipo: 'numero', ancho: 12, total: true },
          { titulo: 'Bloqueados', valor: num('bloqueados'), tipo: 'numero', ancho: 10, total: true },
          { titulo: 'Capacidad', valor: (r) => (Number(r.capacidad) > 0 ? Number(r.capacidad) : null), tipo: 'numero', ancho: 10, total: true },
          { titulo: 'Unidades', valor: num('unidades'), tipo: 'numero', ancho: 10, total: true },
          { titulo: 'Ocupación', valor: num('porcentaje'), tipo: 'porcentaje', ancho: 10 },
        ],
};

export const INFORMES: Informe[] = [stock, movimientos, usuarios, colecciones, ubicaciones];

