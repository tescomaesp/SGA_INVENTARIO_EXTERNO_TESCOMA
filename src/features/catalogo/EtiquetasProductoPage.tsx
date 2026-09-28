import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { HojaEtiquetas, type Etiqueta } from '@/components/HojaEtiquetas';
import { Aviso, Entrada } from '@/components/ui';
import { PREFIJO_QR_PRODUCTO } from '@/lib/codigos';
import { mensajeError } from '@/lib/errores';
import type { Producto } from '@/types/catalogo';
import { catalogoApi } from './api';

/**
 * Etiquetas de producto: ?producto=<id> (con número de copias) o ?coleccion=<id> (una por producto).
 * El QR contiene PRD:<SKU> y se lee en salidas y traslados.
 */
export function EtiquetasProductoPage() {
  const [params] = useSearchParams();
  const productoId = params.get('producto');
  const coleccionId = params.get('coleccion');
  const [productos, setProductos] = useState<Producto[] | null>(null);
  const [copias, setCopias] = useState('1');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (productoId) {
          const p = await catalogoApi.producto(productoId);
          setProductos(p ? [p] : []);
        } else if (coleccionId) {
          const todos: Producto[] = [];
          for (let pagina = 0; ; pagina++) {
            const { filas, total } = await catalogoApi.productos({ coleccionId }, pagina);
            todos.push(...filas);
            if (todos.length >= total || !filas.length) break;
          }
          setProductos(todos);
        } else setError('No se ha indicado qué etiquetas imprimir.');
      } catch (e) {
        setError(await mensajeError(e));
      }
    })();
  }, [productoId, coleccionId]);

  const nCopias = Math.min(Math.max(Number.parseInt(copias, 10) || 1, 1), 500);
  const etiquetas = useMemo<Etiqueta[] | null>(() => {
    if (!productos) return null;
    const veces = productoId ? nCopias : 1;
    return productos.flatMap((p) =>
      Array.from({ length: veces }, (_, i) => ({
        clave: `${p.id}-${i}`,
        qr: PREFIJO_QR_PRODUCTO + p.sku,
        arriba: p.coleccion_nombre,
        grande: p.sku,
        abajo: p.nombre,
      })),
    );
  }, [productos, productoId, nCopias]);

  if (error) return <div className="mx-auto max-w-lg p-6"><Aviso>{error}</Aviso></div>;

  return (
    <HojaEtiquetas
      titulo="Etiquetas de producto"
      etiquetas={etiquetas}
      volver={
        <Link to={productoId ? `/productos/${productoId}` : '/productos'} className="inline-flex min-h-[44px] items-center gap-2 rounded px-2 font-semibold text-acero hover:bg-acero-claro">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {productoId ? 'Producto' : 'Productos'}
        </Link>
      }
      controles={
        productoId && (
          <label className="flex items-center gap-2">
            Copias
            <Entrada type="number" min={1} max={500} inputMode="numeric" value={copias} onChange={(e) => setCopias(e.target.value)} className="w-20" />
          </label>
        )
      }
    />
  );
}
