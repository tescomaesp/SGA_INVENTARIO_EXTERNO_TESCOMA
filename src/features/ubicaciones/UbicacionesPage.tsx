import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layers, Pencil, Plus, Printer, Search, Trash2, Warehouse } from 'lucide-react';
import { Dialogo } from '@/components/Dialogo';
import { DialogoConfirmar } from '@/components/DialogoConfirmar';
import { MenuAcciones, type OpcionMenu } from '@/components/MenuAcciones';
import { useNotificar } from '@/components/Notificaciones';
import { Placa } from '@/components/Placa';
import { Aviso, Boton, CabeceraPagina, Cargando, Entrada, Selector } from '@/components/ui';
import { useAuth } from '@/features/auth/ProveedorAuth';
import { normalizarCodigo, siguienteCodigo } from '@/lib/codigos';
import { mensajeError } from '@/lib/errores';
import type { Almacen, Estanteria, Hueco, Nivel, Ocupacion, Pasillo } from '@/types/ubicaciones';
import { ubicacionesApi } from './api';
import { DetalleHueco } from './DetalleHueco';
import { ESTADOS, LEYENDA, estadoHueco } from './estado';
import { FormAlmacen, FormCodigo, FormGenerador, FormHueco, FormNivel } from './formularios';
import { MapaEstanteria } from './MapaEstanteria';

type Modal =
  | { tipo: 'almacen-nuevo' }
  | { tipo: 'almacen-editar' }
  | { tipo: 'pasillo-nuevo' }
  | { tipo: 'pasillo-editar'; pasillo: Pasillo }
  | { tipo: 'estanteria-nueva'; pasillo: Pasillo }
  | { tipo: 'estanteria-editar'; estanteria: Estanteria }
  | { tipo: 'nivel-nuevo'; estanteria: Estanteria }
  | { tipo: 'hueco'; hueco: Hueco; codigo: string }
  | { tipo: 'hueco-editar'; hueco: Hueco; codigo: string };

interface Borrado {
  titulo: string;
  texto: string;
  accion: () => Promise<void>;
}

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString('es-ES')} ${n === 1 ? uno : varios}`;

export function UbicacionesPage() {
  const { puede } = useAuth();
  const editable = puede('gestionar_ubicaciones');
  const notificar = useNotificar();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [almacenes, setAlmacenes] = useState<Almacen[] | null>(null);
  const [pasillos, setPasillos] = useState<Pasillo[] | null>(null);
  const [ocupacion, setOcupacion] = useState<Map<string, Ocupacion>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [modal, setModal] = useState<Modal | null>(null);
  const [borrado, setBorrado] = useState<Borrado | null>(null);

  const almacenId = params.get('almacen') ?? almacenes?.[0]?.id ?? null;
  const almacen = almacenes?.find((a) => a.id === almacenId) ?? null;

  const cargarAlmacenes = useCallback(async () => {
    try {
      setAlmacenes(await ubicacionesApi.almacenes());
    } catch (e) {
      setError(await mensajeError(e));
    }
  }, []);

  const cargarEstructura = useCallback(async () => {
    if (!almacenId) return setPasillos([]);
    try {
      const [p, o] = await Promise.all([ubicacionesApi.estructura(almacenId), ubicacionesApi.ocupacion(almacenId)]);
      setPasillos(p);
      setOcupacion(o);
      setError(null);
    } catch (e) {
      setError(await mensajeError(e));
    }
  }, [almacenId]);

  useEffect(() => {
    cargarAlmacenes();
  }, [cargarAlmacenes]);

  useEffect(() => {
    if (almacenes) {
      setPasillos(null);
      cargarEstructura();
    }
  }, [almacenes, cargarEstructura]);

  const elegirAlmacen = (id: string) => setParams({ almacen: id }, { replace: true });
  const cerrarModal = () => {
    setModal(null);
    if (params.get('hueco')) setParams(almacenId ? { almacen: almacenId } : {}, { replace: true });
  };

  /** Ejecuta una operación, recarga el mapa, cierra el modal y avisa. */
  const hacer = (mensaje: string, fn: () => Promise<unknown>) => async () => {
    await fn();
    setModal(null);
    notificar(mensaje);
    await cargarEstructura();
  };

  // --- Índice de huecos: código completo y búsqueda ---------------------
  const indice = useMemo(() => {
    const lista: { hueco: Hueco; codigo: string }[] = [];
    if (!almacen || !pasillos) return lista;
    for (const p of pasillos)
      for (const e of p.estanterias)
        for (const n of e.niveles)
          for (const h of n.huecos) lista.push({ hueco: h, codigo: `${almacen.codigo}-${p.codigo}-${e.codigo}-${n.codigo}-${h.codigo}` });
    return lista;
  }, [almacen, pasillos]);

  const consulta = normalizarCodigo(busqueda);
  const resaltados = useMemo(
    () => (consulta ? new Set(indice.filter((x) => x.codigo.includes(consulta)).map((x) => x.hueco.id)) : null),
    [indice, consulta],
  );

  const resumen = useMemo(() => {
    const r = { total: indice.length, conMercancia: 0, llenos: 0, bloqueados: 0 };
    for (const { hueco } of indice) {
      const est = estadoHueco(hueco, ocupacion.get(hueco.id));
      if (est === 'bloqueado') r.bloqueados++;
      else if (est !== 'vacio') r.conMercancia++;
      if (est === 'lleno') r.llenos++;
    }
    return r;
  }, [indice, ocupacion]);

  const abrirHueco = (h: Hueco) => {
    const x = indice.find((i) => i.hueco.id === h.id);
    if (x) setModal({ tipo: 'hueco', hueco: h, codigo: x.codigo });
  };

  // Abre la ficha del hueco indicado en la dirección (p. ej. desde la ficha de producto)
  const huecoUrl = params.get('hueco');
  useEffect(() => {
    if (!huecoUrl || !indice.length) return;
    const x = indice.find((i) => i.hueco.id === huecoUrl);
    if (x) setModal({ tipo: 'hueco', hueco: x.hueco, codigo: x.codigo });
  }, [huecoUrl, indice]);

  const etiquetas = (filtro: Record<string, string>) => navigate(`/ubicaciones/etiquetas?${new URLSearchParams(filtro)}`);

  // --- Opciones de menú ---------------------------------------------------
  const opcionesPasillo = (p: Pasillo): OpcionMenu[] => {
    const huecos = p.estanterias.reduce((s, e) => s + e.niveles.reduce((t, n) => t + n.huecos.length, 0), 0);
    return [
      { texto: 'Imprimir etiquetas', icono: <Printer className="h-4 w-4" />, onClick: () => etiquetas({ pasillo_id: p.id }) },
      ...(editable
        ? [
            { texto: 'Añadir estantería', icono: <Plus className="h-4 w-4" />, onClick: () => setModal({ tipo: 'estanteria-nueva', pasillo: p }) },
            { texto: 'Editar pasillo', icono: <Pencil className="h-4 w-4" />, onClick: () => setModal({ tipo: 'pasillo-editar', pasillo: p }) },
            {
              texto: 'Eliminar pasillo',
              icono: <Trash2 className="h-4 w-4" />,
              peligro: true,
              onClick: () =>
                setBorrado({
                  titulo: `Eliminar el pasillo ${p.codigo}`,
                  texto: `Se eliminarán también ${plural(p.estanterias.length, 'estantería', 'estanterías')} y ${plural(huecos, 'hueco', 'huecos')}.`,
                  accion: hacer(`Pasillo ${p.codigo} eliminado`, () => ubicacionesApi.borrar('pasillos', p.id)),
                }),
            },
          ]
        : []),
    ];
  };

  const opcionesEstanteria = (p: Pasillo, e: Estanteria): OpcionMenu[] => {
    const huecos = e.niveles.reduce((t, n) => t + n.huecos.length, 0);
    return [
      { texto: 'Imprimir etiquetas', icono: <Printer className="h-4 w-4" />, onClick: () => etiquetas({ estanteria_id: e.id }) },
      ...(editable
        ? [
            { texto: 'Añadir nivel', icono: <Layers className="h-4 w-4" />, onClick: () => setModal({ tipo: 'nivel-nuevo', estanteria: e }) },
            { texto: 'Editar estantería', icono: <Pencil className="h-4 w-4" />, onClick: () => setModal({ tipo: 'estanteria-editar', estanteria: e }) },
            ...(e.niveles.length
              ? [
                  {
                    texto: `Eliminar nivel superior (${e.niveles[0].codigo})`,
                    icono: <Trash2 className="h-4 w-4" />,
                    peligro: true,
                    onClick: () =>
                      setBorrado({
                        titulo: `Eliminar el nivel ${e.niveles[0].codigo} de ${p.codigo}-${e.codigo}`,
                        texto: `Se eliminarán sus ${plural(e.niveles[0].huecos.length, 'hueco', 'huecos')}.`,
                        accion: hacer(`Nivel ${e.niveles[0].codigo} eliminado`, () => ubicacionesApi.borrar('niveles', e.niveles[0].id)),
                      }),
                  },
                ]
              : []),
            {
              texto: 'Eliminar estantería',
              icono: <Trash2 className="h-4 w-4" />,
              peligro: true,
              onClick: () =>
                setBorrado({
                  titulo: `Eliminar la estantería ${p.codigo}-${e.codigo}`,
                  texto: `Se eliminarán también ${plural(e.niveles.length, 'nivel', 'niveles')} y ${plural(huecos, 'hueco', 'huecos')}.`,
                  accion: hacer(`Estantería ${e.codigo} eliminada`, () => ubicacionesApi.borrar('estanterias', e.id)),
                }),
            },
          ]
        : []),
    ];
  };

  // --- Render ---------------------------------------------------------------
  if (error && !almacenes) return <Aviso>{error}</Aviso>;
  if (!almacenes) return <Cargando />;

  if (almacenes.length === 0) {
    return (
      <>
        <CabeceraPagina titulo="Ubicaciones" />
        <div className="max-w-xl rounded-md border border-dashed border-linea bg-white px-6 py-12 text-center">
          <Warehouse className="mx-auto h-10 w-10 text-suave" aria-hidden />
          <h2 className="mt-3 text-2xl">Aún no hay ningún almacén</h2>
          {editable ? (
            <>
              <p className="mt-1 text-suave">Crea el almacén y después añade sus pasillos y estanterías.</p>
              <Boton className="mt-5" icono={<Plus className="h-4 w-4" />} onClick={() => setModal({ tipo: 'almacen-nuevo' })}>Crear almacén</Boton>
            </>
          ) : (
            <p className="mt-1 text-suave">Un administrador tiene que configurar las ubicaciones.</p>
          )}
        </div>
        <Dialogo abierto={modal?.tipo === 'almacen-nuevo'} onCerrar={() => setModal(null)} titulo="Nuevo almacén">
          {modal?.tipo === 'almacen-nuevo' && (
            <FormAlmacen
              onCancelar={() => setModal(null)}
              onGuardar={async (v) => {
                const { id } = await ubicacionesApi.crearAlmacen(v);
                setModal(null);
                notificar(`Almacén ${v.codigo} creado`);
                await cargarAlmacenes();
                elegirAlmacen(id);
              }}
            />
          )}
        </Dialogo>
      </>
    );
  }

  const opcionesAlmacen: OpcionMenu[] = almacen
    ? [
        { texto: 'Imprimir todas las etiquetas', icono: <Printer className="h-4 w-4" />, onClick: () => etiquetas({ almacen_id: almacen.id }) },
        ...(editable
          ? [
              { texto: 'Nuevo almacén', icono: <Plus className="h-4 w-4" />, onClick: () => setModal({ tipo: 'almacen-nuevo' }) },
              { texto: 'Editar almacén', icono: <Pencil className="h-4 w-4" />, onClick: () => setModal({ tipo: 'almacen-editar' }) },
              {
                texto: 'Eliminar almacén',
                icono: <Trash2 className="h-4 w-4" />,
                peligro: true,
                onClick: () =>
                  setBorrado({
                    titulo: `Eliminar el almacén ${almacen.codigo}`,
                    texto: `Se eliminarán sus ${plural(pasillos?.length ?? 0, 'pasillo', 'pasillos')} y ${plural(indice.length, 'hueco', 'huecos')}. Esta acción no se puede deshacer.`,
                    accion: async () => {
                      await ubicacionesApi.borrar('almacenes', almacen.id);
                      notificar(`Almacén ${almacen.codigo} eliminado`);
                      setParams({}, { replace: true });
                      await cargarAlmacenes();
                    },
                  }),
              },
            ]
          : []),
      ]
    : [];

  const pasillosVisibles = (pasillos ?? [])
    .map((p) => ({
      ...p,
      estanterias: resaltados ? p.estanterias.filter((e) => e.niveles.some((n) => n.huecos.some((h) => resaltados.has(h.id)))) : p.estanterias,
    }))
    .filter((p) => !resaltados || p.estanterias.length > 0);

  return (
    <>
      <CabeceraPagina
        titulo="Ubicaciones"
        descripcion="Mapa del almacén. Pulsa un hueco para ver su contenido."
        acciones={
          <>
            {editable && almacen && (
              <Boton icono={<Plus className="h-4 w-4" />} onClick={() => setModal({ tipo: 'pasillo-nuevo' })}>Nuevo pasillo</Boton>
            )}
            <MenuAcciones opciones={opcionesAlmacen} etiqueta="Más acciones del almacén" />
          </>
        }
      />

      {/* Selector de almacén */}
      {almacenes.length > 1 && (
        <>
          <div className="mb-5 hidden gap-1 border-b border-linea sm:flex" role="tablist" aria-label="Almacenes">
            {almacenes.map((a) => (
              <button
                key={a.id}
                role="tab"
                aria-selected={a.id === almacenId}
                onClick={() => elegirAlmacen(a.id)}
                className={`-mb-px min-h-[44px] border-b-[3px] px-4 font-semibold ${a.id === almacenId ? 'border-acero text-acero' : 'border-transparent text-suave hover:text-tinta'}`}
              >
                {a.nombre}
              </button>
            ))}
          </div>
          <Selector className="mb-5 sm:hidden" value={almacenId ?? ''} onChange={(e) => elegirAlmacen(e.target.value)} aria-label="Almacén">
            {almacenes.map((a) => (
              <option key={a.id} value={a.id}>{a.nombre}</option>
            ))}
          </Selector>
        </>
      )}

      {almacen && (
        <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Placa>{almacen.codigo}</Placa>
          <span className="font-rotulo text-2xl font-bold">{almacen.nombre}</span>
          {almacen.direccion && <span className="text-suave">{almacen.direccion}</span>}
        </div>
      )}

      {/* Búsqueda, resumen y leyenda */}
      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-center">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" aria-hidden />
          <Entrada
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && resaltados?.size === 1) {
                const h = indice.find((x) => resaltados.has(x.hueco.id));
                if (h) abrirHueco(h.hueco);
              }
            }}
            placeholder="Buscar hueco, p. ej. P01-E03-N2"
            className="pl-9 uppercase placeholder:normal-case"
            aria-label="Buscar hueco por código"
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <p aria-live="polite">
            {resaltados ? (
              <strong>{plural(resaltados.size, 'hueco coincide', 'huecos coinciden')}</strong>
            ) : (
              <>
                <strong>{plural(resumen.total, 'hueco', 'huecos')}</strong>
                <span className="text-suave">
                  , {resumen.conMercancia} con mercancía, {resumen.llenos} {resumen.llenos === 1 ? 'lleno' : 'llenos'}, {resumen.bloqueados} {resumen.bloqueados === 1 ? 'bloqueado' : 'bloqueados'}
                </span>
              </>
            )}
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Leyenda">
            {LEYENDA.map((est) => (
              <li key={est} className="flex items-center gap-1.5 text-suave">
                <span className={`inline-block h-4 w-4 rounded-[2px] border-2 ${ESTADOS[est].celda}`} aria-hidden />
                {ESTADOS[est].texto}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {error && <div className="mb-4"><Aviso>{error}</Aviso></div>}

      {/* Mapa */}
      {!pasillos ? (
        <Cargando />
      ) : pasillos.length === 0 ? (
        <div className="rounded-md border border-dashed border-linea bg-white px-6 py-12 text-center text-suave">
          {editable ? (
            <>
              <p>Este almacén no tiene pasillos todavía.</p>
              <Boton className="mt-4" icono={<Plus className="h-4 w-4" />} onClick={() => setModal({ tipo: 'pasillo-nuevo' })}>Crear el primer pasillo</Boton>
            </>
          ) : (
            'Este almacén no tiene pasillos todavía.'
          )}
        </div>
      ) : pasillosVisibles.length === 0 ? (
        <div className="rounded-md border border-dashed border-linea bg-white px-6 py-12 text-center text-suave">
          Ningún hueco coincide con «{busqueda}».
        </div>
      ) : (
        <div className="space-y-8">
          {pasillosVisibles.map((p) => (
            <section key={p.id} aria-labelledby={`pasillo-${p.id}`}>
              <div className="mb-3 flex items-center justify-between gap-3 border-b-2 border-tinta pb-2">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
                  <h2 id={`pasillo-${p.id}`} className="text-2xl">Pasillo {p.codigo}</h2>
                  {p.descripcion && <span className="text-suave">{p.descripcion}</span>}
                </div>
                <MenuAcciones opciones={opcionesPasillo(p)} etiqueta={`Acciones del pasillo ${p.codigo}`} />
              </div>
              <div className="flex flex-wrap items-start gap-4">
                {p.estanterias.map((e) => (
                  <MapaEstanteria
                    key={e.id}
                    estanteria={e}
                    prefijo={`${almacen?.codigo}-${p.codigo}`}
                    ocupacion={ocupacion}
                    resaltados={resaltados}
                    editable={editable}
                    opciones={opcionesEstanteria(p, e)}
                    onHueco={abrirHueco}
                    onAnadirHueco={(n: Nivel) => {
                      const cap = n.huecos[n.huecos.length - 1]?.capacidad ?? null;
                      hacer(`Hueco añadido al nivel ${n.codigo}`, () => ubicacionesApi.anadirHueco(n.id, cap))().catch(async (err) => notificar(await mensajeError(err), 'error'));
                    }}
                    onAnadirNivel={() => setModal({ tipo: 'nivel-nuevo', estanteria: e })}
                  />
                ))}
                {editable && !resaltados && (
                  <button
                    onClick={() => setModal({ tipo: 'estanteria-nueva', pasillo: p })}
                    className="flex min-h-[8rem] w-40 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-linea text-suave hover:border-acero hover:text-acero"
                  >
                    <Plus className="h-5 w-5" aria-hidden />
                    Añadir estantería
                  </button>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* ---------------- Diálogos ---------------- */}
      <Dialogo abierto={modal?.tipo === 'almacen-nuevo'} onCerrar={() => setModal(null)} titulo="Nuevo almacén">
        {modal?.tipo === 'almacen-nuevo' && (
          <FormAlmacen
            sugerido={siguienteCodigo('ALM', almacenes.map((a) => a.codigo), 1)}
            onCancelar={() => setModal(null)}
            onGuardar={async (v) => {
              const { id } = await ubicacionesApi.crearAlmacen(v);
              setModal(null);
              notificar(`Almacén ${v.codigo} creado`);
              await cargarAlmacenes();
              elegirAlmacen(id);
            }}
          />
        )}
      </Dialogo>

      <Dialogo abierto={modal?.tipo === 'almacen-editar'} onCerrar={() => setModal(null)} titulo="Editar almacén">
        {modal?.tipo === 'almacen-editar' && almacen && (
          <FormAlmacen
            inicial={almacen}
            onCancelar={() => setModal(null)}
            onGuardar={async (v) => {
              await ubicacionesApi.editar('almacenes', almacen.id, v);
              setModal(null);
              notificar('Almacén actualizado');
              await cargarAlmacenes();
            }}
          />
        )}
      </Dialogo>

      <Dialogo abierto={modal?.tipo === 'pasillo-nuevo'} onCerrar={() => setModal(null)} titulo="Nuevo pasillo">
        {modal?.tipo === 'pasillo-nuevo' && almacen && (
          <FormGenerador
            tipo="pasillo"
            sugerido={siguienteCodigo('P', (pasillos ?? []).map((p) => p.codigo))}
            onCancelar={() => setModal(null)}
            onGuardar={(v) => hacer(`Pasillo ${v.codigo} creado`, () => ubicacionesApi.generarPasillo({ almacenId: almacen.id, ...v }))()}
          />
        )}
      </Dialogo>

      <Dialogo abierto={modal?.tipo === 'pasillo-editar'} onCerrar={() => setModal(null)} titulo="Editar pasillo">
        {modal?.tipo === 'pasillo-editar' && (
          <FormCodigo
            inicial={modal.pasillo}
            onCancelar={() => setModal(null)}
            onGuardar={(v) => hacer('Pasillo actualizado', () => ubicacionesApi.editar('pasillos', modal.pasillo.id, v))()}
          />
        )}
      </Dialogo>

      <Dialogo abierto={modal?.tipo === 'estanteria-nueva'} onCerrar={() => setModal(null)} titulo={modal?.tipo === 'estanteria-nueva' ? `Nueva estantería en ${modal.pasillo.codigo}` : ''}>
        {modal?.tipo === 'estanteria-nueva' && (
          <FormGenerador
            tipo="estanteria"
            sugerido={siguienteCodigo('E', modal.pasillo.estanterias.map((e) => e.codigo))}
            onCancelar={() => setModal(null)}
            onGuardar={(v) => hacer(`Estantería ${v.codigo} creada`, () => ubicacionesApi.generarEstanteria({ pasilloId: modal.pasillo.id, ...v }))()}
          />
        )}
      </Dialogo>

      <Dialogo abierto={modal?.tipo === 'estanteria-editar'} onCerrar={() => setModal(null)} titulo="Editar estantería">
        {modal?.tipo === 'estanteria-editar' && (
          <FormCodigo
            inicial={modal.estanteria}
            onCancelar={() => setModal(null)}
            onGuardar={(v) => hacer('Estantería actualizada', () => ubicacionesApi.editar('estanterias', modal.estanteria.id, v))()}
          />
        )}
      </Dialogo>

      <Dialogo abierto={modal?.tipo === 'nivel-nuevo'} onCerrar={() => setModal(null)} titulo="Añadir nivel">
        {modal?.tipo === 'nivel-nuevo' && (
          <FormNivel
            codigoNuevo={`N${Math.max(0, ...modal.estanteria.niveles.map((n) => n.orden)) + 1}`}
            onCancelar={() => setModal(null)}
            onGuardar={(v) => hacer('Nivel añadido', () => ubicacionesApi.anadirNivel(modal.estanteria.id, v.huecos, v.capacidad))()}
          />
        )}
      </Dialogo>

      <Dialogo abierto={modal?.tipo === 'hueco'} onCerrar={cerrarModal} titulo="Hueco">
        {modal?.tipo === 'hueco' && (
          <DetalleHueco
            hueco={modal.hueco}
            codigoCompleto={modal.codigo}
            ocupacion={ocupacion.get(modal.hueco.id)}
            editable={editable}
            puedeRegistrar={puede('registrar_movimientos')}
            onRegistrarEntrada={() => navigate(`/entradas/nueva?hueco=${modal.hueco.id}`)}
            onSalida={() => navigate(`/salidas/nueva?hueco=${modal.hueco.id}`)}
            onTraslado={() => navigate(`/traslados/nueva?hueco=${modal.hueco.id}`)}
            onEditar={() => setModal({ tipo: 'hueco-editar', hueco: modal.hueco, codigo: modal.codigo })}
            onImprimir={() => etiquetas({ id: modal.hueco.id })}
            onBorrar={() => {
              const m = modal;
              setModal(null);
              setBorrado({
                titulo: `Eliminar el hueco ${m.codigo}`,
                texto: 'Si tiene etiqueta impresa, retírala de la estantería.',
                accion: hacer(`Hueco ${m.codigo} eliminado`, () => ubicacionesApi.borrar('huecos', m.hueco.id)),
              });
            }}
          />
        )}
      </Dialogo>

      <Dialogo abierto={modal?.tipo === 'hueco-editar'} onCerrar={() => setModal(null)} titulo={modal?.tipo === 'hueco-editar' ? `Editar ${modal.codigo}` : ''}>
        {modal?.tipo === 'hueco-editar' && (
          <FormHueco
            hueco={modal.hueco}
            onCancelar={() => setModal(null)}
            onGuardar={(v) => hacer('Hueco actualizado', () => ubicacionesApi.editar('huecos', modal.hueco.id, v))()}
          />
        )}
      </Dialogo>

      <DialogoConfirmar
        abierto={!!borrado}
        titulo={borrado?.titulo ?? ''}
        textoConfirmar="Eliminar"
        peligro
        onCerrar={() => setBorrado(null)}
        onConfirmar={async () => {
          if (borrado) await borrado.accion();
        }}
      >
        <p>{borrado?.texto}</p>
      </DialogoConfirmar>
    </>
  );
}
