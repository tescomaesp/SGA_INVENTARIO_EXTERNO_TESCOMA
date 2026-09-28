import type { RolId } from '@/types/modelos';

// Copia para la interfaz de la matriz de public.tiene_permiso() (migración 001).
// La seguridad real la aplica la base de datos; esto solo decide qué se muestra.
export type Accion =
  | 'ver_stock'
  | 'registrar_movimientos'
  | 'editar_productos'
  | 'ajustes'
  | 'informes'
  | 'gestionar_ubicaciones'
  | 'gestionar_usuarios';

const MATRIZ: Record<Accion, RolId[]> = {
  ver_stock: ['admin', 'responsable', 'operario', 'consulta'],
  registrar_movimientos: ['admin', 'responsable', 'operario'],
  editar_productos: ['admin', 'responsable'],
  ajustes: ['admin', 'responsable'],
  informes: ['admin', 'responsable', 'consulta'],
  gestionar_ubicaciones: ['admin'],
  gestionar_usuarios: ['admin'],
};

export const ETIQUETA_ACCION: Record<Accion, string> = {
  ver_stock: 'Ver stock, catálogo e historial',
  registrar_movimientos: 'Registrar entradas, salidas y traslados',
  editar_productos: 'Editar fichas de producto',
  ajustes: 'Hacer ajustes de inventario',
  informes: 'Ver informes y exportar',
  gestionar_ubicaciones: 'Gestionar ubicaciones y colecciones',
  gestionar_usuarios: 'Gestionar usuarios y roles',
};

export const ACCIONES = Object.keys(MATRIZ) as Accion[];

export function puede(rol: RolId | null | undefined, accion: Accion): boolean {
  return !!rol && MATRIZ[accion].includes(rol);
}

export const NOMBRE_ROL: Record<RolId, string> = {
  admin: 'Administrador',
  responsable: 'Responsable de almacén',
  operario: 'Operario',
  consulta: 'Consulta',
};

export const ROLES_ORDENADOS: RolId[] = ['admin', 'responsable', 'operario', 'consulta'];
