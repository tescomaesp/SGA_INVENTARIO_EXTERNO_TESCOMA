import { Link } from 'react-router-dom';
import { TIPO_MOVIMIENTO } from '@/components/FilaMovimiento';
import { Miniatura } from '@/components/Miniatura';
import { Placa } from '@/components/Placa';
import { formatearCantidad } from '@/lib/cantidad';
import { textoMotivo } from '@/lib/motivos';
import type { MovimientoTraza } from '@/types/catalogo';

const dia = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const hora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
const claveDia = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

interface Props {
  movimientos: MovimientoTraza[];
  /** Oculta foto y nombre del producto (cuando todos son del mismo). */
  sinProducto?: boolean;
  /** Qué saldo mostrar tras cada movimiento. */
  saldo?: 'producto' | 'lote' | null;
}

/** Historial agrupado por día, con una línea vertical que une los movimientos. */
export function LineaTemporal({ movimientos, sinProducto, saldo = null }: Props) {
  const grupos: { clave: string; titulo: string; items: MovimientoTraza[] }[] = [];
  for (const m of movimientos) {
    const c = claveDia(m.fecha);
    let g = grupos[grupos.length - 1];
    if (!g || g.clave !== c) {
      const t = dia.format(new Date(m.fecha));
      g = { clave: c, titulo: t.charAt(0).toUpperCase() + t.slice(1), items: [] };
      grupos.push(g);
    }
    g.items.push(m);
  }

  return (
    <div className="space-y-6">
      {grupos.map((g) => (
        <section key={g.clave} aria-label={g.titulo} className="break-inside-avoid-page">
          <h3 className="mb-2 font-sans text-base font-semibold text-suave">{g.titulo}</h3>
          <ol className="relative ml-4 border-l-2 border-linea">
            {g.items.map((m) => {
              const t = TIPO_MOVIMIENTO[m.tipo];
              const Icono = t.icono;
              const signo = m.variacion > 0 ? '+' : m.variacion < 0 ? '−' : '';
              const valorSaldo = saldo === 'producto' ? m.saldo_producto : saldo === 'lote' ? m.saldo_lote : null;
              return (
                <li key={m.id} className="relative mb-3 ml-6 break-inside-avoid rounded-md border border-linea bg-white p-3 last:mb-0">
                  <span className={`absolute -left-[2.35rem] top-3 flex h-7 w-7 items-center justify-center rounded-full border-2 border-linea bg-white ${t.color}`} aria-hidden>
                    <Icono className="h-4 w-4" />
                  </span>
                  <div className="flex flex-wrap items-start gap-3">
                    {!sinProducto && (
                      <Link to={`/productos/${m.producto_id}`} className="shrink-0 print:hidden">
                        <Miniatura ruta={m.foto_url} tamano={44} />
                      </Link>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        <span className="tabular-nums text-suave">{hora.format(new Date(m.fecha))}</span>{' '}
                        <span className={t.color}>{t.texto}</span>
                        {m.motivo && <span className="font-normal">, {textoMotivo(m.motivo)?.toLowerCase()}</span>}
                      </p>
                      {!sinProducto && (
                        <Link to={`/productos/${m.producto_id}`} className="block truncate hover:underline">
                          {m.producto_nombre} <span className="text-suave">{m.sku}</span>
                        </Link>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {m.origen_codigo && <Placa tamano="sm">{m.origen_codigo}</Placa>}
                        {m.origen_codigo && m.destino_codigo && <span aria-label="a">→</span>}
                        {m.destino_codigo && <Placa tamano="sm">{m.destino_codigo}</Placa>}
                        {m.lote_id && m.lote_codigo && (
                          <Link to={`/trazabilidad/lote/${m.lote_id}`} className="ml-1 text-sm font-semibold text-acero hover:underline">Lote {m.lote_codigo}</Link>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-suave">
                        {m.usuario_nombre}
                        {m.contacto_nombre && <>, contacto {m.contacto_nombre}</>}
                        {m.destino_externo && <>, destino {m.destino_externo}</>}
                        {m.documento && <>, doc. {m.documento}</>}
                      </p>
                      {m.notas && <p className="mt-0.5 text-sm italic">{m.notas}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`font-rotulo text-xl font-bold tabular-nums ${t.color}`}>
                        {m.tipo === 'traslado' ? '' : signo}
                        {formatearCantidad(m.cantidad)}
                      </p>
                      {valorSaldo !== null && valorSaldo !== undefined && (
                        <p className="text-sm tabular-nums text-suave">Queda {formatearCantidad(valorSaldo)}</p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
