const colador = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

/** Ordena por código de forma natural: E2 antes que E10. */
export const ordenarPorCodigo = <T extends { codigo: string }>(lista: T[]) => [...lista].sort((a, b) => colador.compare(a.codigo, b.codigo));

/** Normaliza igual que la base de datos: mayúsculas y sin espacios. */
export const normalizarCodigo = (v: string) => v.toUpperCase().replace(/\s+/g, '');

export const CODIGO_VALIDO = /^[A-Z0-9]{1,12}$/;

/** Siguiente código libre con un prefijo: ['E01','E02'] → 'E03'. */
export function siguienteCodigo(prefijo: string, existentes: string[], relleno = 2) {
  const patron = new RegExp(`^${prefijo}(\\d+)$`);
  const max = existentes.reduce((m, c) => {
    const r = patron.exec(c);
    return r ? Math.max(m, Number(r[1])) : m;
  }, 0);
  return prefijo + String(max + 1).padStart(relleno, '0');
}

/** Prefijo del contenido de los QR de ubicación, para distinguirlos de los de producto. */
export const PREFIJO_QR_UBICACION = 'UBI:';

/** Prefijo del contenido de los QR de producto: PRD:<SKU>. */
export const PREFIJO_QR_PRODUCTO = 'PRD:';
