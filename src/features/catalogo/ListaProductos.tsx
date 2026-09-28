import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Miniatura } from '@/components/Miniatura';
import { Aviso, Boton, Cargando, Entrada, Selector } from '@/components/ui';
import { formatearCantidad } from '@/lib/cantidad';
import { mensajeError } from '@/lib/errores';
import type { Coleccion, Contacto, Producto } from '@/types/catalogo';
import { catalogoApi, TAMANO_PAGINA, type FiltroProductos } from './api';

export function ListaProductos() {
  const [params] = useSearchParams();
  const [filtro, setFiltro] = useState<FiltroProductos>(() => ({ soloStockBajo: params.get('stock_bajo') === '1' }));
  const [texto, setTexto] = useState('');
  const [pagina, setPagina] = useState(0);
  const [datos, setDatos] = useState<{ filas: Producto[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [colecciones, setColecciones] = useState<Coleccion[]>([]);
  const [contactos, setContactos] = useState<Contacto[]>([]);

  useEffect(() => {
    catalogoApi.colecciones().then(setColecciones).catch(() => {});
    catalogoApi.contactos('', 500).then(setContactos).catch(() => {});
  }, []);

  // La búsqueda por texto espera a que se deje de escribir
  useEffect(() => {
    const t = setTimeout(() => {
      setFiltro((f) => ({ ...f, texto }));
      setPagina(0);
    }, 300);
    return () => clearTimeout(t);
  }, [texto]);

  useEffect(() => {
    let vigente = true;
    catalogoApi
      .productos(filtro, pagina)
      .then((d) => vigente && (setDatos(d), setError(null)))
      .catch(async (e) => vigente && setError(await mensajeError(e)));
    return () => {
      vigente = false;
    };
  }, [filtro, pagina]);

  const cambiar = (c: Partial<FiltroProductos>) => {
    setFiltro((f) => ({ ...f, ...c }));
    setPagina(0);
  };
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / TAMANO_PAGINA)) : 1;

  return (
    <>
      <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_12rem_auto] lg:items-center">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" aria-hidden />
          <Entrada type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre o SKU" className="pl-9" aria-label="Buscar productos" />
        </div>
        <Selector value={filtro.coleccionId ?? ''} onChange={(e) => cambiar({ coleccionId: e.target.value || undefined })} aria-label="Filtrar por colección">
          <option value="">Todas las colecciones</option>
          {colecciones.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </Selector>
        <Selector value={filtro.contactoId ?? ''} onChange={(e) => cambiar({ contactoId: e.target.value || undefined })} aria-label="Filtrar por contacto">
          <option value="">Todos los contactos</option>
          {contactos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </Selector>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2">
            <input type="checkbox" className="h-5 w-5 accent-acero" checked={!!filtro.soloStockBajo} onChange={(e) => cambiar({ soloStockBajo: e.target.checked })} />
            Stock bajo
          </label>
          <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2">
            <input type="checkbox" className="h-5 w-5 accent-acero" checked={!!filtro.incluirBajas} onChange={(e) => cambiar({ incluirBajas: e.target.checked })} />
            Ver bajas
          </label>
        </div>
      </div>

      {error ? (
        <Aviso>{error}</Aviso>
      ) : !datos ? (
        <Cargando />
      ) : datos.filas.length === 0 ? (
        <div className="rounded-md border border-dashed border-linea bg-white px-6 py-12 text-center text-suave">
          {filtro.texto || filtro.coleccionId || filtro.contactoId || filtro.soloStockBajo
            ? 'Ningún producto coincide con los filtros.'
            : 'Todavía no hay productos. Se crean al registrar la primera entrada de cada uno.'}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-linea/70 rounded-md border border-linea bg-white">
            {datos.filas.map((p) => (
              <li key={p.id}>
                <Link to={`/productos/${p.id}`} className={`flex items-center gap-4 px-4 py-3 hover:bg-fondo/60 ${p.activo ? '' : 'opacity-60'}`}>
                  <Miniatura ruta={p.foto_url} tamano={56} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{p.nombre}{!p.activo && <span className="ml-2 text-sm font-normal text-suave">(de baja)</span>}</p>
                    <p className="truncate text-sm text-suave">
                      {p.sku}, {p.coleccion_nombre}
                      {p.contacto_nombre && <span className="hidden sm:inline">, {p.contacto_nombre}</span>}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`font-rotulo text-2xl font-bold tabular-nums ${p.stock_bajo ? 'text-peligro' : ''}`}>
                      {p.stock_bajo && <AlertTriangle className="mr-1 inline h-4 w-4 align-baseline" aria-label="Stock bajo" />}
                      {formatearCantidad(p.stock_total)}
                    </p>
                    <p className="text-sm text-suave">
                      {p.ubicaciones === 0 ? 'Sin stock' : `${p.ubicaciones} ${p.ubicaciones === 1 ? 'ubicación' : 'ubicaciones'}`}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-suave">
              {datos.total.toLocaleString('es-ES')} {datos.total === 1 ? 'producto' : 'productos'}
            </p>
            {paginas > 1 && (
              <div className="flex items-center gap-2">
                <Boton variante="secundario" icono={<ChevronLeft className="h-4 w-4" />} disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)} aria-label="Página anterior" />
                <span className="tabular-nums">Página {pagina + 1} de {paginas}</span>
                <Boton variante="secundario" icono={<ChevronRight className="h-4 w-4" />} disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)} aria-label="Página siguiente" />
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
