import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, History, PackageMinus, PackageOpen, PackagePlus, Pencil, Printer, Trash2 } from 'lucide-react';
import { Miniatura } from '@/components/Miniatura';
import { catalogoApi } from '@/features/catalogo/api';
import { formatearCantidad } from '@/lib/cantidad';
import type { FilaStock } from '@/types/catalogo';
import { Placa } from '@/components/Placa';
import { Boton } from '@/components/ui';
import type { Hueco, Ocupacion } from '@/types/ubicaciones';
import { ESTADOS, estadoHueco } from './estado';

interface Props {
  hueco: Hueco;
  codigoCompleto: string;
  ocupacion: Ocupacion | undefined;
  editable: boolean;
  puedeRegistrar: boolean;
  onRegistrarEntrada: () => void;
  onSalida: () => void;
  onTraslado: () => void;
  onEditar: () => void;
  onImprimir: () => void;
  onBorrar: () => void;
}

export function DetalleHueco({ hueco, codigoCompleto, ocupacion, editable, puedeRegistrar, onRegistrarEntrada, onSalida, onTraslado, onEditar, onImprimir, onBorrar }: Props) {
  const [contenido, setContenido] = useState<FilaStock[] | null>(null);
  useEffect(() => {
    catalogoApi.stock({ hueco_id: hueco.id }).then(setContenido).catch(() => setContenido([]));
  }, [hueco.id]);

  const estado = estadoHueco(hueco, ocupacion);
  const unidades = ocupacion?.unidades ?? 0;
  const porcentaje = hueco.capacidad ? Math.min(100, Math.round((unidades / hueco.capacidad) * 100)) : null;

  return (
    <div className="space-y-5">
      <div>
        <Placa className="text-xl sm:text-2xl">{codigoCompleto}</Placa>
        <p className="mt-2 font-semibold">{ESTADOS[estado].texto}</p>
        {hueco.notas && <p className="text-suave">{hueco.notas}</p>}
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-linea bg-linea">
        <div className="bg-white p-3">
          <dt className="text-sm text-suave">Unidades</dt>
          <dd className="font-rotulo text-2xl font-bold tabular-nums">{formatearCantidad(unidades)}</dd>
        </div>
        <div className="bg-white p-3">
          <dt className="text-sm text-suave">Capacidad</dt>
          <dd className="font-rotulo text-2xl font-bold tabular-nums">{hueco.capacidad?.toLocaleString('es-ES') ?? 'Sin definir'}</dd>
        </div>
        {porcentaje !== null && (
          <div className="col-span-2 bg-white p-3">
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-suave">Ocupación</span>
              <span className="font-semibold tabular-nums">{porcentaje} %</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-fondo" role="progressbar" aria-valuenow={porcentaje} aria-valuemin={0} aria-valuemax={100} aria-label="Ocupación">
              <div className="h-full bg-acero" style={{ width: `${porcentaje}%` }} />
            </div>
          </div>
        )}
      </dl>

      <section>
        <h3 className="text-xl">Contenido</h3>
        {contenido === null ? (
          <p className="mt-2 text-suave">Cargando…</p>
        ) : contenido.length === 0 ? (
          <p className="mt-2 flex items-center gap-2 text-suave">
            <PackageOpen className="h-5 w-5" aria-hidden />
            Este hueco está vacío.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-linea/70 rounded-md border border-linea">
            {contenido.map((f) => (
              <li key={f.id}>
                <Link to={`/productos/${f.producto_id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-fondo">
                  <Miniatura ruta={f.foto_url} tamano={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{f.producto_nombre}</span>
                    <span className="block text-sm text-suave">{f.sku}{f.lote_codigo && `, lote ${f.lote_codigo}`}</span>
                  </span>
                  <span className="font-rotulo text-lg font-bold tabular-nums">{formatearCantidad(f.cantidad)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-2 border-t border-linea pt-5">
        {puedeRegistrar && hueco.activo && (
          <Boton icono={<PackagePlus className="h-4 w-4" />} onClick={onRegistrarEntrada}>Entrada aquí</Boton>
        )}
        {puedeRegistrar && !!contenido?.length && (
          <>
            <Boton variante="secundario" icono={<PackageMinus className="h-4 w-4" />} onClick={onSalida}>Salida</Boton>
            <Boton variante="secundario" icono={<ArrowLeftRight className="h-4 w-4" />} onClick={onTraslado}>Trasladar</Boton>
          </>
        )}
        {editable && <Boton variante="secundario" icono={<Pencil className="h-4 w-4" />} onClick={onEditar}>Editar</Boton>}
        <Link to={`/trazabilidad?hueco=${hueco.id}`} className="inline-flex min-h-[44px] items-center gap-2 rounded border border-linea bg-white px-4 font-semibold hover:bg-fondo">
          <History className="h-4 w-4" aria-hidden />
          Historial
        </Link>
        <Boton variante="secundario" icono={<Printer className="h-4 w-4" />} onClick={onImprimir}>Imprimir etiqueta</Boton>
        {editable && (
          <Boton variante="fantasma" className="text-peligro hover:bg-peligro-claro sm:ml-auto" icono={<Trash2 className="h-4 w-4" />} onClick={onBorrar}>Eliminar</Boton>
        )}
      </div>
    </div>
  );
}
