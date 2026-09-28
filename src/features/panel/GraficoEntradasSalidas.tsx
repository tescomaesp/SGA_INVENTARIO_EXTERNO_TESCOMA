import { formatearCantidad } from '@/lib/cantidad';

export interface PuntoSerie {
  etiqueta: string;
  etiquetaLarga: string;
  entradas: number;
  salidas: number;
}

const COLOR_ENTRADA = '#2E7D4F';
const COLOR_SALIDA = '#B3261E';

/** Máximo "redondo" para el eje: 87 → 100, 1.340 → 1.500. */
function maximoRedondo(v: number) {
  if (v <= 0) return 10;
  const base = 10 ** Math.floor(Math.log10(v));
  const paso = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * base >= v) ?? 10;
  return paso * base;
}

/**
 * Barras agrupadas de unidades que entran y salen por periodo. SVG propio: ligero, se adapta
 * al ancho y lleva una tabla oculta equivalente para lectores de pantalla.
 */
export function GraficoEntradasSalidas({ datos }: { datos: PuntoSerie[] }) {
  const alto = 200;
  const margenIzq = 44;
  const margenInf = 26;
  const grupo = 34;
  const ancho = margenIzq + datos.length * grupo + 8;
  const max = maximoRedondo(Math.max(...datos.map((d) => Math.max(d.entradas, d.salidas)), 0));
  const y = (v: number) => alto - margenInf - (v / max) * (alto - margenInf - 10);
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const cadaCuanto = datos.length > 16 ? 2 : 1;
  const vacio = datos.every((d) => d.entradas === 0 && d.salidas === 0);

  return (
    <div>
      <div className="mb-2 flex gap-4 text-sm">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: COLOR_ENTRADA }} aria-hidden />Entradas</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: COLOR_SALIDA }} aria-hidden />Salidas</span>
        <span className="text-suave">(unidades)</span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${ancho} ${alto}`} className="h-auto w-full" role="img" aria-label="Gráfico de unidades que entran y salen por periodo" preserveAspectRatio="xMinYMid meet">
          {marcas.map((m) => (
            <g key={m}>
              <line x1={margenIzq} x2={ancho - 4} y1={y(m)} y2={y(m)} stroke="#CBD3DC" strokeWidth={m === 0 ? 1.5 : 0.75} strokeDasharray={m === 0 ? undefined : '3 3'} />
              <text x={margenIzq - 6} y={y(m) + 3.5} textAnchor="end" fontSize="10" fill="#5A6875">
                {m >= 10000 ? `${formatearCantidad(m / 1000)} mil` : formatearCantidad(m)}
              </text>
            </g>
          ))}
          {datos.map((d, i) => {
            const x = margenIzq + i * grupo + 5;
            return (
              <g key={d.etiquetaLarga}>
                <rect x={x} y={y(d.entradas)} width={11} height={Math.max(0, y(0) - y(d.entradas))} fill={COLOR_ENTRADA} rx={1.5}>
                  <title>{`${d.etiquetaLarga}: ${formatearCantidad(d.entradas)} entradas`}</title>
                </rect>
                <rect x={x + 12} y={y(d.salidas)} width={11} height={Math.max(0, y(0) - y(d.salidas))} fill={COLOR_SALIDA} rx={1.5}>
                  <title>{`${d.etiquetaLarga}: ${formatearCantidad(d.salidas)} salidas`}</title>
                </rect>
                {i % cadaCuanto === 0 && (
                  <text x={x + 11.5} y={alto - 8} textAnchor="middle" fontSize="10" fill="#5A6875">{d.etiqueta}</text>
                )}
              </g>
            );
          })}
        </svg>
        {vacio && <p className="absolute inset-0 flex items-center justify-center text-suave">Sin entradas ni salidas en este periodo.</p>}
      </div>
      <table className="sr-only">
        <caption>Unidades que entran y salen por periodo</caption>
        <thead><tr><th>Periodo</th><th>Entradas</th><th>Salidas</th></tr></thead>
        <tbody>
          {datos.map((d) => (
            <tr key={d.etiquetaLarga}><td>{d.etiquetaLarga}</td><td>{formatearCantidad(d.entradas)}</td><td>{formatearCantidad(d.salidas)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
