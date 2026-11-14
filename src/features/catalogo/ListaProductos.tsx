import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { BarraSeleccion } from '@/components/BarraSeleccion';
import { Casilla } from '@/components/Casilla';
import { DialogoEliminar } from '@/components/DialogoEliminar';
import { Miniatura } from '@/components/Miniatura';
import { useAuth } from '@/features/auth/ProveedorAuth';
import type { ElementoAEliminar } from '@/features/modificaciones/api';
import { Aviso, Boton, Cargando, Entrada, Selector } from '@/components/ui';
import { formatearCantidad } from '@/lib/cantidad';
import { mensajeError } from '@/lib/errores';
import type { Coleccion, Contacto, Producto } from '@/types/catalogo';
import { catalogoApi, TAMANO_PAGINA, type FiltroProductos } from './api';

export function ListaProductos() {
  const { puede } = useAuth();
  const puedeEliminar = puede('eliminar');
  const [params] = useSearchParams();
  const [filtro, setFiltro] = useState<FiltroProductos>(() => ({ soloStockBajo: params.get('stock_bajo') === '1', ubicacion: params.get('ubicacion') ?? undefined }));
  const [texto, setTexto] = useState('');
  const [ubicacion, setUbicacion] = useState(params.get('ubicacion') ?? '');
  const [pagina, setPagina] = useState(0);
  const [datos, setDatos] = useState<{ filas: Producto[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [colecciones, setColecciones] = useState<Coleccion[]>([]);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  // Selección múltiple (solo administradores): se conserva al cambiar de página o de filtro
  const [seleccion, setSeleccion] = useState<Map<string, Producto>>(new Map());
  const [aEliminar, setAEliminar] = useState<ElementoAEliminar[] | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    catalogoApi.colecciones().then(setColecciones).catch(() => {});
    catalogoApi.contactos('', 500).then(setContactos).catch(() => {});
  }, []);

  // Las búsquedas de texto esperan a que se deje de escribir
  useEffect(() => {
    const t = setTimeout(() => {
      setFiltro((f) => (f.texto === texto && (f.ubicacion ?? '') === ubicacion ? f : { ...f, texto, ubicacion }));
      setPagina(0);
    }, 300);
    return () => clearTimeout(t);
  }, [texto, ubicacion]);

  useEffect(() => {
    let vigente = true;
    catalogoApi
      .productos(filtro, pagina)
      .then((d) => vigente && (setDatos(d), setError(null)))
      .catch(async (e) => vigente && setError(await mensajeError(e)));
    return () => {
      vigente = false;
    };
  }, [filtro, pagina, recarga]);

  const alternar = (p: Producto, marcar: boolean) =>
    setSeleccion((s) => {
      const n = new Map(s);
      if (marcar) n.set(p.id, p);
      else n.delete(p.id);
      return n;
    });

  const cambiar = (c: Partial<FiltroProductos>) => {
    setFiltro((f) => ({ ...f, ...c }));
    setPagina(0);
  };
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / TAMANO_PAGINA)) : 1;

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_11rem_11rem_11rem_auto] xl:items-center">
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
        <Entrada
          value={ubicacion}
          onChange={(e) => setUbicacion(e.target.value)}
          placeholder="Ubicación: P01, P01-E03…"
          aria-label="Filtrar por ubicación"
          className="uppercase placeholder:normal-case"
        />
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
          {filtro.texto || filtro.coleccionId || filtro.contactoId || filtro.ubicacion || filtro.soloStockBajo
            ? 'Ningún producto coincide con los filtros.'
            : 'Todavía no hay productos. Se crean al registrar la primera entrada de cada uno.'}
        </div>
      ) : (
        <>
          {puedeEliminar && (
            <label className="mb-2 inline-flex min-h-[44px] cursor-pointer items-center gap-3 px-4 text-sm font-semibold text-suave">
              <Casilla
                etiqueta="Seleccionar todos los de esta página"
                marcada={datos.filas.every((p) => seleccion.has(p.id))}
                indeterminada={datos.filas.some((p) => seleccion.has(p.id))}
                onCambio={(v) => datos.filas.forEach((p) => alternar(p, v))}
              />
              Seleccionar los de esta página
            </label>
          )}
          <ul className="divide-y divide-linea/70 rounded-md border border-linea bg-white">
            {datos.filas.map((p) => (
              <li key={p.id} className={`flex items-center ${seleccion.has(p.id) ? 'bg-peligro-claro/60' : ''}`}>
                {puedeEliminar && (
                  <label className="flex min-h-[64px] cursor-pointer items-center pl-4">
                    <Casilla etiqueta={`Seleccionar ${p.nombre}`} marcada={seleccion.has(p.id)} onCambio={(v) => alternar(p, v)} />
                  </label>
                )}
                <Link to={`/productos/${p.id}`} className={`flex min-w-0 flex-1 items-center gap-4 px-4 py-3 hover:bg-fondo/60 ${p.activo ? '' : 'opacity-60'}`}>
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
      {seleccion.size > 0 && (
        <BarraSeleccion
          texto={`${seleccion.size} ${seleccion.size === 1 ? 'producto seleccionado' : 'productos seleccionados'}`}
          onCancelar={() => setSeleccion(new Map())}
          onEliminar={() =>
            setAEliminar(
              [...seleccion.values()].map((p) => ({
                tipo: 'producto',
                id: p.id,
                descripcion: `${p.sku} ${p.nombre}`,
                aviso: p.stock_total > 0 ? `Tiene ${formatearCantidad(p.stock_total)} uds en stock: se retirarán con un ajuste registrado.` : undefined,
              })),
            )
          }
        />
      )}
      {seleccion.size > 0 && <div className="h-20" aria-hidden />}
      <DialogoEliminar
        elementos={aEliminar}
        onCerrar={() => setAEliminar(null)}
        onHecho={(r) => {
          setSeleccion((s) => {
            const n = new Map(s);
            r.eliminados.forEach((e) => n.delete(e.id));
            return n;
          });
          setRecarga((x) => x + 1);
        }}
      />
    </>
  );
}
