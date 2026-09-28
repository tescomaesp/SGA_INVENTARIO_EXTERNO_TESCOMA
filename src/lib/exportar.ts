/**
 * Exportación de tablas a Excel (.xlsx), CSV y PDF.
 * Las librerías de Excel y PDF se cargan solo al exportar para no engordar la aplicación.
 */
import type { Cell as Celda, SheetData } from 'write-excel-file';

export type TipoColumna = 'texto' | 'numero' | 'fecha' | 'fechahora' | 'porcentaje';

export interface Columna<T> {
  titulo: string;
  valor: (fila: T) => string | number | null | undefined;
  tipo?: TipoColumna;
  /** Ancho aproximado en caracteres (Excel) y peso relativo (PDF). */
  ancho?: number;
  /** Sumar la columna en la fila de totales. */
  total?: boolean;
}

export interface DatosExportacion<T> {
  archivo: string; // sin extensión
  titulo: string;
  subtitulo?: string;
  columnas: Columna<T>[];
  filas: T[];
}

const numero = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 });
const fechaCorta = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fechaHora = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** "2026-09-25" se interpreta como fecha local (no UTC) para no cambiar de día. */
function aFecha(v: string | number): Date {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [a, m, d] = v.split('-').map(Number);
    return new Date(a, m - 1, d);
  }
  return new Date(v);
}

/** Valor como texto legible en español (vista previa, CSV y PDF). */
export function formatearCelda(v: string | number | null | undefined, tipo: TipoColumna = 'texto'): string {
  if (v === null || v === undefined || v === '') return '';
  switch (tipo) {
    case 'numero':
      return numero.format(Number(v));
    case 'porcentaje':
      return `${numero.format(Number(v))} %`;
    case 'fecha':
      return fechaCorta.format(aFecha(v));
    case 'fechahora':
      return fechaHora.format(aFecha(v));
    default:
      return String(v);
  }
}

export function calcularTotales<T>(columnas: Columna<T>[], filas: T[]): (number | null)[] {
  return columnas.map((c) => (c.total ? filas.reduce((s, f) => s + (Number(c.valor(f)) || 0), 0) : null));
}

const nombreSeguro = (s: string) => s.replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/_+/g, '_').slice(0, 80);

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------------ */
/* CSV: separador ";" y coma decimal, como lo espera Excel en español */
/* ------------------------------------------------------------------ */
export function exportarCsv<T>({ archivo, columnas, filas }: DatosExportacion<T>) {
  const escapar = (s: string) => (/[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const celda = (v: string | number | null | undefined, tipo: TipoColumna = 'texto') => {
    if (v === null || v === undefined) return '';
    if (tipo === 'numero' || tipo === 'porcentaje') return String(Number(v)).replace('.', ',');
    return escapar(formatearCelda(v, tipo));
  };
  const lineas = [
    columnas.map((c) => escapar(c.titulo)).join(';'),
    ...filas.map((f) => columnas.map((c) => celda(c.valor(f), c.tipo)).join(';')),
  ];
  // BOM para que Excel reconozca UTF-8 (tildes y eñes)
  descargar(new Blob(['\uFEFF' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${nombreSeguro(archivo)}.csv`);
}

/* ------------------------------------------------------------------ */
/* Excel                                                               */
/* ------------------------------------------------------------------ */
export async function exportarExcel<T>({ archivo, titulo, columnas, filas }: DatosExportacion<T>) {
  const { default: writeXlsxFile } = await import('write-excel-file');

  const cabecera: Celda[] = columnas.map((c) => ({
    value: c.titulo,
    fontWeight: 'bold',
    backgroundColor: '#DCE6F2',
    align: c.tipo === 'numero' || c.tipo === 'porcentaje' ? 'right' : 'left',
  }));

  const cuerpo: Celda[][] = filas.map((f) =>
    columnas.map((c): Celda => {
      const v = c.valor(f);
      if (v === null || v === undefined || v === '') return null;
      switch (c.tipo) {
        case 'numero':
          return { type: Number, value: Number(v), format: '#,##0.###' };
        case 'porcentaje':
          return { type: Number, value: Number(v) / 100, format: '0.0%' };
        case 'fecha':
          return { type: Date, value: aFecha(v), format: 'dd/mm/yyyy' };
        case 'fechahora':
          return { type: Date, value: aFecha(v), format: 'dd/mm/yyyy hh:mm' };
        default:
          return { type: String, value: String(v) };
      }
    }),
  );

  const totales = calcularTotales(columnas, filas);
  const filaTotales: Celda[] | null = totales.some((t) => t !== null)
    ? columnas.map((_, i) =>
        i === 0 && totales[0] === null
          ? { value: 'Total', fontWeight: 'bold' }
          : totales[i] !== null
            ? { type: Number, value: totales[i]!, format: '#,##0.###', fontWeight: 'bold' }
            : null,
      )
    : null;

  const hoja: SheetData = [cabecera, ...cuerpo, ...(filaTotales ? [filaTotales] : [])];
  await writeXlsxFile(hoja, {
    columns: columnas.map((c) => ({ width: c.ancho ?? Math.max(10, c.titulo.length + 2) })),
    sheet: titulo.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31),
    stickyRowsCount: 1,
    fileName: `${nombreSeguro(archivo)}.xlsx`,
  });
}

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */
/** Las fuentes estándar de PDF no incluyen algunos símbolos: se sustituyen. */
const paraPdf = (s: string) => s.replace(/−/g, '-').replace(/→/g, '>').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

export async function exportarPdf<T>({ archivo, titulo, subtitulo, columnas, filas }: DatosExportacion<T>) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const horizontal = columnas.length > 6;
  const doc = new jsPDF({ orientation: horizontal ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const anchoPagina = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(paraPdf(titulo), 12, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90, 104, 117);
  const generado = `Generado el ${fechaHora.format(new Date())}`;
  doc.text(paraPdf(subtitulo ? `${subtitulo}. ${generado}` : generado), 12, 21);
  doc.setTextColor(22, 33, 44);

  const totales = calcularTotales(columnas, filas);
  const hayTotales = totales.some((t) => t !== null);
  const pesoTotal = columnas.reduce((s, c) => s + (c.ancho ?? 12), 0);
  const anchoUtil = anchoPagina - 24;

  autoTable(doc, {
    startY: 26,
    margin: { left: 12, right: 12 },
    head: [columnas.map((c) => paraPdf(c.titulo))],
    body: filas.map((f) => columnas.map((c) => paraPdf(formatearCelda(c.valor(f), c.tipo)))),
    foot: hayTotales ? [columnas.map((_, i) => (totales[i] !== null ? formatearCelda(totales[i], 'numero') : i === 0 ? 'Total' : ''))] : undefined,
    showFoot: 'lastPage',
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.6, overflow: 'linebreak', textColor: [22, 33, 44] },
    headStyles: { fillColor: [19, 55, 96], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [220, 230, 242], textColor: [22, 33, 44], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [246, 247, 249] },
    columnStyles: Object.fromEntries(
      columnas.map((c, i) => [i, { cellWidth: (anchoUtil * (c.ancho ?? 12)) / pesoTotal, halign: c.tipo === 'numero' || c.tipo === 'porcentaje' ? 'right' : 'left' }]),
    ),
    didDrawPage: () => {
      const n = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(90, 104, 117);
      doc.text(`Página ${n}`, anchoPagina - 12, doc.internal.pageSize.getHeight() - 7, { align: 'right' });
    },
  });

  doc.save(`${nombreSeguro(archivo)}.pdf`);
}
