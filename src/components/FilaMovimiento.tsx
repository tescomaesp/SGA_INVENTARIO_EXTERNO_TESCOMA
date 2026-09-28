import { Link } from 'react-router-dom';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, SlidersHorizontal } from 'lucide-react';
import { Miniatura } from './Miniatura';
import { formatearCantidad } from '@/lib/cantidad';
import { formatearFechaHora } from '@/lib/formato';
import { textoMotivo } from '@/lib/motivos';
import type { Movimiento, TipoMovimiento } from '@/types/catalogo';

export const TIPO_MOVIMIENTO: Record<TipoMovimiento, { texto: string; icono: typeof ArrowDownToLine; color: string; signo: string }> = {
  entrada: { texto: 'Entrada', icono: ArrowDownToLine, color: 'text-ok', signo: '+' },
  salida: { texto: 'Salida', icono: ArrowUpFromLine, color: 'text-peligro', signo: '−' },
  traslado: { texto: 'Traslado', icono: ArrowLeftRight, color: 'text-acero', signo: '' },
  ajuste: { texto: 'Ajuste', icono: SlidersHorizontal, color: 'text-suave', signo: '±' },
};

/** Una línea de movimiento para listados. Con `sinProducto` se omite la foto y el nombre (ficha de producto). */
export function FilaMovimiento({ m, sinProducto }: { m: Movimiento; sinProducto?: boolean }) {
  const t = TIPO_MOVIMIENTO[m.tipo];
  const Icono = t.icono;
  const signo = m.tipo === 'ajuste' ? (m.hueco_destino_id ? '+' : '−') : t.signo;
  const ruta = [m.origen_codigo, m.destino_codigo].filter(Boolean).join(' → ');

  return (
    <li className="flex items-start gap-3 border-b border-linea/70 px-4 py-3 last:border-0">
      {sinProducto ? (
        <span className={`mt-0.5 ${t.color}`}><Icono className="h-5 w-5" aria-hidden /></span>
      ) : (
        <Link to={`/productos/${m.producto_id}`} className="shrink-0"><Miniatura ruta={m.foto_url} tamano={44} /></Link>
      )}
      <div className="min-w-0 flex-1">
        {!sinProducto && (
          <Link to={`/productos/${m.producto_id}`} className="block truncate font-semibold hover:underline">
            {m.producto_nombre} <span className="font-normal text-suave">{m.sku}</span>
          </Link>
        )}
        <p className={sinProducto ? 'font-semibold' : 'text-sm'}>
          <span className={t.color}>{t.texto}</span>
          {ruta && <span className="font-rotulo font-bold"> {ruta}</span>}
          {m.lote_codigo && m.lote_id && (
            <>
              <span className="text-suave">, </span>
              <Link to={`/trazabilidad/lote/${m.lote_id}`} className="text-acero hover:underline">lote {m.lote_codigo}</Link>
            </>
          )}
        </p>
        <p className="text-sm text-suave">
          {formatearFechaHora(m.fecha)}, {m.usuario_nombre}
          {m.contacto_nombre && <>, contacto {m.contacto_nombre}</>}
          {m.destino_externo && <>, destino {m.destino_externo}</>}
          {m.documento && <>, doc. {m.documento}</>}
          {m.motivo && <>, {textoMotivo(m.motivo)?.toLowerCase()}</>}
        </p>
        {m.notas && <p className="text-sm italic text-suave">{m.notas}</p>}
      </div>
      <span className={`shrink-0 font-rotulo text-xl font-bold tabular-nums ${t.color}`}>
        {signo}{formatearCantidad(m.cantidad)}
      </span>
    </li>
  );
}
