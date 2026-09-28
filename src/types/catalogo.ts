export interface Coleccion {
  id: string;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
}

export interface Contacto {
  id: string;
  nombre: string;
  empresa: string | null;
  telefono: string | null;
  email: string | null;
  notas: string | null;
}

/** Fila de la vista v_productos. */
export interface Producto {
  id: string;
  sku: string;
  nombre: string;
  foto_url: string | null;
  stock_minimo: number;
  notas: string | null;
  activo: boolean;
  creado_en: string;
  coleccion_id: string;
  coleccion_nombre: string;
  contacto_id: string | null;
  contacto_nombre: string | null;
  stock_total: number;
  ubicaciones: number;
  stock_bajo: boolean;
}

/** Fila de la vista v_stock. */
export interface FilaStock {
  id: number;
  producto_id: string;
  sku: string;
  producto_nombre: string;
  foto_url: string | null;
  hueco_id: string;
  codigo_completo: string;
  almacen_id: string;
  almacen_nombre: string;
  lote_id: string | null;
  lote_codigo: string | null;
  fecha_caducidad: string | null;
  cantidad: number;
  actualizado_en: string;
}

export type TipoMovimiento = 'entrada' | 'salida' | 'traslado' | 'ajuste';

/** Fila de la vista v_movimientos. */
export interface Movimiento {
  id: number;
  tipo: TipoMovimiento;
  fecha: string;
  cantidad: number;
  motivo: string | null;
  destino_externo: string | null;
  documento: string | null;
  notas: string | null;
  producto_id: string;
  sku: string;
  producto_nombre: string;
  foto_url: string | null;
  lote_id: string | null;
  lote_codigo: string | null;
  hueco_origen_id: string | null;
  origen_codigo: string | null;
  hueco_destino_id: string | null;
  destino_codigo: string | null;
  contacto_id: string | null;
  contacto_nombre: string | null;
  usuario_id: string;
  usuario_nombre: string;
}

/** Fila de v_trazabilidad: movimiento con su efecto en el stock. */
export interface MovimientoTraza extends Movimiento {
  variacion: number;
  saldo_producto: number;
  saldo_lote: number | null;
}

/** Fila de v_lotes. */
export interface Lote {
  id: string;
  codigo: string;
  fecha_caducidad: string | null;
  creado_en: string;
  producto_id: string;
  sku: string;
  producto_nombre: string;
  foto_url: string | null;
  primera_entrada: string | null;
  contacto_id: string | null;
  contacto_nombre: string | null;
  contacto_empresa: string | null;
  documento_entrada: string | null;
  entrado: number;
  salido: number;
  ajuste_neto: number;
  stock_actual: number;
  ubicaciones: number;
  destinos: number;
  movimientos: number;
}
