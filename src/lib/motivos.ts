export const MOTIVOS_SALIDA = {
  envio: 'Envío a cliente',
  devolucion: 'Devolución a proveedor',
  merma: 'Merma o rotura',
  uso_interno: 'Uso interno',
  otro: 'Otro',
} as const;

export const MOTIVOS_AJUSTE = {
  recuento: 'Recuento de inventario',
  rotura: 'Rotura o deterioro',
  error_registro: 'Error al registrar',
  otro: 'Otro',
} as const;

export type MotivoSalida = keyof typeof MOTIVOS_SALIDA;
export type MotivoAjuste = keyof typeof MOTIVOS_AJUSTE;

export function textoMotivo(motivo: string | null): string | null {
  if (!motivo) return null;
  return (MOTIVOS_SALIDA as Record<string, string>)[motivo] ?? (MOTIVOS_AJUSTE as Record<string, string>)[motivo] ?? motivo;
}
