import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { Miniatura } from '@/components/Miniatura';
import { Placa } from '@/components/Placa';
import { Aviso, Boton, Cargando } from '@/components/ui';
import { catalogoApi } from '@/features/catalogo/api';
import { formatearCantidad } from '@/lib/cantidad';
import { mensajeError } from '@/lib/errores';
import { formatearFecha, formatearFechaHora } from '@/lib/formato';
import type { FilaStock, Lote, MovimientoTraza } from '@/types/catalogo';
import { trazabilidadApi } from './api';
import { LineaTemporal } from './LineaTemporal';

interface Destino {
  destino: string;
  cantidad: number;
  envios: number;
  primera: string;
  ultima: string;
  documentos: string[];
}

/**
 * Informe completo de un lote: de dónde vino, dónde está y a quién se ha enviado.
 * Es la pantalla que se usa ante una incidencia o una retirada de producto.
 */
export function LotePage() {
  const { id = '' } = useParams();
  const [lote, setLote] = useState<Lote | null | undefined>(undefined);
  const [recorrido, setRecorrido] = useState<MovimientoTraza[]>([]);
  const [stock, setStock] = useState<FilaStock[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const l = await trazabilidadApi.lote(id);
        setLote(l);
        if (!l) return;
        const [r, s] = await Promise.all([trazabilidadApi.recorridoLote(l.id, l.producto_id), catalogoApi.stock({ lote_id: l.id })]);
        setRecorrido(r);
        setStock(s);
      } catch (e) {
        setError(await mensajeError(e));
      }
    })();
  }, [id]);

  const destinos = useMemo(() => {
    const mapa = new Map<string, Destino>();
    for (const m of recorrido) {
      if (m.tipo !== 'salida') continue;
      const clave = m.destino_externo?.trim() || 'Sin destino indicado';
      const d = mapa.get(clave) ?? { destino: clave, cantidad: 0, envios: 0, primera: m.fecha, ultima: m.fecha, documentos: [] };
      d.cantidad += m.cantidad;
      d.envios += 1;
      d.ultima = m.fecha;
      if (m.documento && !d.documentos.includes(m.documento)) d.documentos.push(m.documento);
      mapa.set(clave, d);
    }
    return [...mapa.values()].sort((a, b) => b.cantidad - a.cantidad);
  }, [recorrido]);

  if (error) return <Aviso>{error}</Aviso>;
  if (lote === undefined) return <Cargando />;
  if (lote === null) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-3xl">Lote no encontrado</h1>
        <Link to="/trazabilidad" className="mt-4 inline-block font-semibold text-acero hover:underline">Volver a trazabilidad</Link>
      </div>
    );
  }

  const caducado = lote.fecha_caducidad && lote.fecha_caducidad < new Date().toISOString().slice(0, 10);
  const cifras = [
    { etiqueta: 'Entrado', valor: lote.entrado },
    { etiqueta: 'Salido', valor: lote.salido },
    { etiqueta: 'Ajustes', valor: lote.ajuste_neto, signo: true },
    { etiqueta: 'En stock', valor: lote.stock_actual, destacado: true },
  ];

  return (
    <article>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link to={`/trazabilidad?producto=${lote.producto_id}&lote=${lote.id}`} className="inline-flex min-h-[44px] items-center gap-2 font-semibold text-acero hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Trazabilidad
        </Link>
        <Boton variante="secundario" icono={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Imprimir informe</Boton>
      </div>

      <header className="mb-6 flex flex-wrap items-start gap-5">
        <Miniatura ruta={lote.foto_url} tamano={96} className="print:hidden" />
        <div className="min-w-0 flex-1">
          <p className="text-suave">Informe de trazabilidad del lote</p>
          <h1 className="text-4xl">Lote {lote.codigo}</h1>
          <Link to={`/productos/${lote.producto_id}`} className="text-lg hover:underline">
            {lote.producto_nombre} <span className="text-suave">{lote.sku}</span>
          </Link>
          {lote.fecha_caducidad && (
            <p className={`mt-1 ${caducado ? 'font-semibold text-peligro' : ''}`}>
              Caducidad: {formatearFecha(lote.fecha_caducidad)}{caducado && ' (caducado)'}
            </p>
          )}
        </div>
        <p className="hidden text-sm text-suave print:block">Generado el {formatearFechaHora(new Date().toISOString())}</p>
      </header>

      <dl className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-linea bg-linea sm:grid-cols-4">
        {cifras.map((c) => (
          <div key={c.etiqueta} className={`p-4 ${c.destacado ? 'bg-acero-claro' : 'bg-white'}`}>
            <dt className="text-sm text-suave">{c.etiqueta}</dt>
            <dd className="font-rotulo text-3xl font-bold tabular-nums">
              {c.signo && c.valor > 0 ? '+' : c.signo && c.valor < 0 ? '−' : ''}
              {formatearCantidad(c.signo ? Math.abs(c.valor) : c.valor)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <section className="break-inside-avoid">
          <h2 className="mb-3 text-2xl">Origen</h2>
          {lote.primera_entrada ? (
            <dl className="space-y-1 rounded-md border border-linea bg-white p-4">
              <div className="flex gap-2"><dt className="w-32 shrink-0 text-suave">Primera entrada</dt><dd>{formatearFechaHora(lote.primera_entrada)}</dd></div>
              <div className="flex gap-2"><dt className="w-32 shrink-0 text-suave">Contacto</dt><dd>{lote.contacto_nombre ?? '—'}{lote.contacto_empresa && `, ${lote.contacto_empresa}`}</dd></div>
              <div className="flex gap-2"><dt className="w-32 shrink-0 text-suave">Albarán</dt><dd>{lote.documento_entrada ?? '—'}</dd></div>
            </dl>
          ) : (
            <p className="text-suave">No consta ninguna entrada de este lote.</p>
          )}
        </section>

        <section className="break-inside-avoid">
          <h2 className="mb-3 text-2xl">Dónde está ahora</h2>
          {stock.length === 0 ? (
            <p className="rounded-md border border-dashed border-linea bg-white p-4 text-suave">No queda stock de este lote en el almacén.</p>
          ) : (
            <ul className="divide-y divide-linea/70 rounded-md border border-linea bg-white">
              {stock.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <Placa tamano="sm">{s.codigo_completo}</Placa>
                  <span className="font-rotulo text-xl font-bold tabular-nums">{formatearCantidad(s.cantidad)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mb-8 break-inside-avoid">
        <h2 className="mb-1 text-2xl">A quién se ha enviado</h2>
        <p className="mb-3 text-suave">Salidas de este lote agrupadas por destino.</p>
        {destinos.length === 0 ? (
          <p className="rounded-md border border-dashed border-linea bg-white p-4 text-suave">Este lote no ha tenido salidas.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-linea bg-white">
            <table className="tabla w-full min-w-[36rem]">
              <thead>
                <tr>
                  <th>Destino</th>
                  <th className="text-right">Cantidad</th>
                  <th>Fechas</th>
                  <th>Documentos</th>
                </tr>
              </thead>
              <tbody>
                {destinos.map((d) => (
                  <tr key={d.destino}>
                    <td className="font-semibold">{d.destino}</td>
                    <td className="text-right font-rotulo text-lg font-bold tabular-nums">{formatearCantidad(d.cantidad)}</td>
                    <td className="text-sm">
                      {formatearFecha(d.primera)}
                      {d.envios > 1 && ` a ${formatearFecha(d.ultima)} (${d.envios} envíos)`}
                    </td>
                    <td className="text-sm">{d.documentos.join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-2xl">Recorrido completo</h2>
        {recorrido.length === 0 ? <p className="text-suave">Sin movimientos.</p> : <LineaTemporal movimientos={recorrido} sinProducto saldo="lote" />}
      </section>
    </article>
  );
}
