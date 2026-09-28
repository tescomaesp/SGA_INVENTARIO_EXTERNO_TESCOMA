import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Filter, X } from 'lucide-react';
import { Combobox } from '@/components/Combobox';
import { TIPO_MOVIMIENTO } from '@/components/FilaMovimiento';
import { Miniatura } from '@/components/Miniatura';
import { Placa } from '@/components/Placa';
import { Aviso, Boton, CabeceraPagina, Cargando, Entrada, Selector } from '@/components/ui';
import { catalogoApi } from '@/features/catalogo/api';
import { ubicacionesApi } from '@/features/ubicaciones/api';
import { formatearCantidad } from '@/lib/cantidad';
import { mensajeError } from '@/lib/errores';
import type { Contacto, Lote, MovimientoTraza, Producto, TipoMovimiento } from '@/types/catalogo';
import { trazabilidadApi, type FiltroTraza } from './api';
import { LineaTemporal } from './LineaTemporal';

const TIPOS: TipoMovimiento[] = ['entrada', 'salida', 'traslado', 'ajuste'];
const POR_PAGINA = 50;
const CLAVES = ['producto', 'lote', 'tipos', 'usuario', 'contacto', 'hueco', 'ubicacion', 'desde', 'hasta', 'texto'] as const;

function leerFiltro(p: URLSearchParams): FiltroTraza {
  const f: FiltroTraza = {};
  for (const c of CLAVES) {
    const v = p.get(c);
    if (!v) continue;
    if (c === 'tipos') f.tipos = v.split(',').filter((t): t is TipoMovimiento => TIPOS.includes(t as TipoMovimiento));
    else f[c] = v;
  }
  return f;
}

export function TrazabilidadPage() {
  const [params, setParams] = useSearchParams();
  const filtro = useMemo(() => leerFiltro(params), [params]);

  const [filas, setFilas] = useState<MovimientoTraza[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);

  // Datos para los controles
  const [producto, setProducto] = useState<Producto | null>(null);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [usuarios, setUsuarios] = useState<{ id: string; nombre_completo: string; email: string }[]>([]);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [huecoCodigo, setHuecoCodigo] = useState<string | null>(null);
  const [textoProducto, setTextoProducto] = useState('');
  const [ubicacion, setUbicacion] = useState(filtro.ubicacion ?? '');
  const [texto, setTexto] = useState(filtro.texto ?? '');
  const buscarProducto = useCallback((t: string) => catalogoApi.buscarProductos(t), []);

  const cambiar = useCallback(
    (cambios: Partial<Record<(typeof CLAVES)[number], string | undefined>>) => {
      const n = new URLSearchParams(params);
      for (const [k, v] of Object.entries(cambios)) {
        if (v) n.set(k, v);
        else n.delete(k);
      }
      setParams(n, { replace: true });
    },
    [params, setParams],
  );

  useEffect(() => {
    trazabilidadApi.usuarios().then(setUsuarios).catch(() => {});
    catalogoApi.contactos('', 500).then(setContactos).catch(() => {});
  }, []);

  useEffect(() => {
    setProducto(null);
    setLotes([]);
    if (!filtro.producto) return;
    catalogoApi.producto(filtro.producto).then(setProducto);
    trazabilidadApi.lotesDeProducto(filtro.producto).then(setLotes);
  }, [filtro.producto]);

  useEffect(() => {
    setHuecoCodigo(null);
    if (filtro.hueco) ubicacionesApi.huecosPlanos({ id: filtro.hueco }).then(([h]) => setHuecoCodigo(h?.codigo_completo ?? null));
  }, [filtro.hueco]);

  // Campos de texto: se aplican al dejar de escribir
  useEffect(() => {
    const t = setTimeout(() => {
      if ((filtro.ubicacion ?? '') !== ubicacion || (filtro.texto ?? '') !== texto) cambiar({ ubicacion, texto });
    }, 400);
    return () => clearTimeout(t);
  }, [ubicacion, texto, filtro.ubicacion, filtro.texto, cambiar]);

  useEffect(() => {
    let vigente = true;
    setFilas(null);
    trazabilidadApi
      .movimientos(filtro, 0, POR_PAGINA)
      .then((r) => {
        if (!vigente) return;
        setFilas(r.filas);
        setTotal(r.total);
        setError(null);
      })
      .catch(async (e) => vigente && setError(await mensajeError(e)));
    return () => {
      vigente = false;
    };
  }, [filtro]);

  const activos = CLAVES.filter((c) => params.get(c)).length;
  const lote = lotes.find((l) => l.id === filtro.lote);
  const tiposActivos = filtro.tipos ?? [];

  const alternarTipo = (t: TipoMovimiento) => {
    const nuevos = tiposActivos.includes(t) ? tiposActivos.filter((x) => x !== t) : [...tiposActivos, t];
    cambiar({ tipos: nuevos.length && nuevos.length < TIPOS.length ? nuevos.join(',') : undefined });
  };

  const panelFiltros = (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-sm font-semibold">Producto</p>
        {producto ? (
          <div className="flex items-center gap-2 rounded border border-acero bg-acero-claro/40 p-2">
            <Miniatura ruta={producto.foto_url} tamano={36} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{producto.nombre}</span>
            <button onClick={() => cambiar({ producto: undefined, lote: undefined })} className="rounded p-1.5 hover:bg-white" aria-label="Quitar filtro de producto">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Combobox<Producto>
            etiquetaAria="Filtrar por producto"
            valor={textoProducto}
            onCambio={setTextoProducto}
            buscar={buscarProducto}
            clave={(p) => p.id}
            onElegir={(p) => {
              setTextoProducto('');
              cambiar({ producto: p.id, lote: undefined });
            }}
            placeholder="Nombre o SKU"
            renderOpcion={(p) => (
              <span className="block truncate">
                {p.nombre} <span className="text-suave">{p.sku}</span>
              </span>
            )}
          />
        )}
      </div>

      {producto && lotes.length > 0 && (
        <div>
          <label htmlFor="f-lote" className="mb-1.5 block text-sm font-semibold">Lote</label>
          <Selector id="f-lote" value={filtro.lote ?? ''} onChange={(e) => cambiar({ lote: e.target.value || undefined })}>
            <option value="">Todos los lotes</option>
            {lotes.map((l) => (
              <option key={l.id} value={l.id}>{l.codigo}{l.stock_actual > 0 ? ` (${formatearCantidad(l.stock_actual)} en stock)` : ''}</option>
            ))}
          </Selector>
        </div>
      )}

      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">Tipo de movimiento</legend>
        <div className="flex flex-wrap gap-2">
          {TIPOS.map((t) => {
            const activo = tiposActivos.length === 0 || tiposActivos.includes(t);
            const T = TIPO_MOVIMIENTO[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => alternarTipo(t)}
                aria-pressed={tiposActivos.includes(t)}
                className={`inline-flex min-h-[40px] items-center gap-1.5 rounded border-2 px-3 text-sm font-semibold ${
                  tiposActivos.includes(t) ? 'border-acero bg-acero-claro' : activo ? 'border-linea bg-white' : 'border-linea bg-white opacity-50'
                }`}
              >
                <T.icono className={`h-4 w-4 ${T.color}`} aria-hidden />
                {T.texto}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <div>
          <label htmlFor="f-usuario" className="mb-1.5 block text-sm font-semibold">Usuario</label>
          <Selector id="f-usuario" value={filtro.usuario ?? ''} onChange={(e) => cambiar({ usuario: e.target.value || undefined })}>
            <option value="">Todos</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre_completo || u.email}</option>)}
          </Selector>
        </div>
        <div>
          <label htmlFor="f-contacto" className="mb-1.5 block text-sm font-semibold">Persona de contacto</label>
          <Selector id="f-contacto" value={filtro.contacto ?? ''} onChange={(e) => cambiar({ contacto: e.target.value || undefined })}>
            <option value="">Todas</option>
            {contactos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Selector>
        </div>
      </div>

      <div>
        <label htmlFor="f-ubicacion" className="mb-1.5 block text-sm font-semibold">Ubicación</label>
        {filtro.hueco ? (
          <div className="flex items-center gap-2">
            <Placa tamano="sm">{huecoCodigo ?? '…'}</Placa>
            <button onClick={() => cambiar({ hueco: undefined })} className="rounded p-1.5 hover:bg-fondo" aria-label="Quitar filtro de hueco">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Entrada id="f-ubicacion" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Ej.: P01 o P01-E03" className="uppercase placeholder:normal-case" />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="f-desde" className="mb-1.5 block text-sm font-semibold">Desde</label>
          <Entrada id="f-desde" type="date" value={filtro.desde ?? ''} max={filtro.hasta} onChange={(e) => cambiar({ desde: e.target.value || undefined })} />
        </div>
        <div>
          <label htmlFor="f-hasta" className="mb-1.5 block text-sm font-semibold">Hasta</label>
          <Entrada id="f-hasta" type="date" value={filtro.hasta ?? ''} min={filtro.desde} onChange={(e) => cambiar({ hasta: e.target.value || undefined })} />
        </div>
      </div>

      <div>
        <label htmlFor="f-texto" className="mb-1.5 block text-sm font-semibold">Pedido, albarán, destino o notas</label>
        <Entrada id="f-texto" type="search" value={texto} onChange={(e) => setTexto(e.target.value)} />
      </div>

      {activos > 0 && (
        <Boton
          variante="secundario"
          ancho
          onClick={() => {
            setUbicacion('');
            setTexto('');
            setParams({}, { replace: true });
          }}
        >
          Quitar todos los filtros
        </Boton>
      )}
    </div>
  );

  return (
    <>
      <CabeceraPagina titulo="Trazabilidad" descripcion="Todo lo que ha pasado en el almacén: qué, cuándo, dónde, cuánto y quién." />

      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        {/* Filtros: panel lateral en escritorio, desplegable en móvil */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <button
            onClick={() => setFiltrosAbiertos((a) => !a)}
            aria-expanded={filtrosAbiertos}
            className="flex min-h-[44px] w-full items-center justify-between rounded-md border border-linea bg-white px-4 font-semibold lg:hidden"
          >
            <span className="inline-flex items-center gap-2">
              <Filter className="h-4 w-4" aria-hidden />
              Filtros{activos > 0 && ` (${activos})`}
            </span>
            <span className="text-suave">{filtrosAbiertos ? 'Ocultar' : 'Mostrar'}</span>
          </button>
          <div className={`mt-3 rounded-md border border-linea bg-white p-4 lg:mt-0 lg:block ${filtrosAbiertos ? 'block' : 'hidden'}`}>{panelFiltros}</div>
        </aside>

        <div className="min-w-0">
          {producto && (
            <div className="mb-5 flex flex-wrap items-center gap-4 rounded-md border border-linea bg-white p-4">
              <Miniatura ruta={producto.foto_url} tamano={56} />
              <div className="min-w-0 flex-1">
                <Link to={`/productos/${producto.id}`} className="font-semibold hover:underline">{producto.nombre}</Link>
                <p className="text-sm text-suave">{producto.sku}, {producto.coleccion_nombre}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-suave">{lote ? `Stock del lote ${lote.codigo}` : 'Stock actual'}</p>
                <p className="font-rotulo text-3xl font-bold tabular-nums">{formatearCantidad(lote ? lote.stock_actual : producto.stock_total)}</p>
              </div>
              {lote && (
                <Link to={`/trazabilidad/lote/${lote.id}`} className="w-full font-semibold text-acero hover:underline sm:w-auto">
                  Ver informe del lote {lote.codigo}
                </Link>
              )}
            </div>
          )}

          {error ? (
            <Aviso>{error}</Aviso>
          ) : !filas ? (
            <Cargando />
          ) : filas.length === 0 ? (
            <div className="rounded-md border border-dashed border-linea bg-white px-6 py-12 text-center text-suave">
              {activos ? 'Ningún movimiento coincide con los filtros.' : 'Todavía no hay movimientos registrados.'}
            </div>
          ) : (
            <>
              <p className="mb-4 text-suave" aria-live="polite">
                {total.toLocaleString('es-ES')} {total === 1 ? 'movimiento' : 'movimientos'}
                {total > filas.length && `, mostrando los ${filas.length} más recientes`}
              </p>
              <LineaTemporal movimientos={filas} sinProducto={!!producto} saldo={filtro.lote ? 'lote' : 'producto'} />
              {filas.length < total && (
                <div className="mt-6 text-center">
                  <Boton
                    variante="secundario"
                    cargando={cargandoMas}
                    onClick={async () => {
                      setCargandoMas(true);
                      try {
                        const r = await trazabilidadApi.movimientos(filtro, filas.length, POR_PAGINA);
                        setFilas([...filas, ...r.filas]);
                      } finally {
                        setCargandoMas(false);
                      }
                    }}
                  >
                    Ver más antiguos
                  </Boton>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
