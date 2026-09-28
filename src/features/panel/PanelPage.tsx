import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeftRight, CalendarClock, PackageMinus, PackagePlus, ShieldAlert } from 'lucide-react';
import { FilaMovimiento } from '@/components/FilaMovimiento';
import { Miniatura } from '@/components/Miniatura';
import { Aviso, Boton, Cargando } from '@/components/ui';
import { useAuth } from '@/features/auth/ProveedorAuth';
import { catalogoApi } from '@/features/catalogo/api';
import { fechaLocal, rpc, todasLasFilas } from '@/features/informes/api';
import { formatearCantidad } from '@/lib/cantidad';
import { mensajeError } from '@/lib/errores';
import { formatearFecha } from '@/lib/formato';
import { supabase } from '@/lib/supabase';
import type { Lote, Movimiento, Producto } from '@/types/catalogo';
import { GraficoEntradasSalidas, type PuntoSerie } from './GraficoEntradasSalidas';

interface ResumenPeriodo {
  entradas: number;
  unidades_entrada: number;
  salidas: number;
  unidades_salida: number;
  traslados: number;
  ajustes: number;
}

interface Indicadores {
  referencias: number;
  referencias_con_stock: number;
  unidades: number;
  stock_bajo: number;
  hoy: ResumenPeriodo;
  semana: ResumenPeriodo;
  huecos: { total: number; con_mercancia: number; bloqueados: number; llenos: number; capacidad: number; unidades_con_capacidad: number };
  caducan_pronto: number;
  caducados: number;
  descuadres: number | null;
}

interface FilaSerie {
  periodo: string;
  entradas: number;
  salidas: number;
}

interface OcupacionPasillo {
  clave: string;
  almacen: string;
  pasillo: string;
  huecos: number;
  conMercancia: number;
  capacidad: number;
  unidadesConCapacidad: number;
}

type Modo = 'dia' | 'semana' | 'mes';

const MODOS: Record<Modo, { texto: string; periodos: number }> = {
  dia: { texto: '14 días', periodos: 14 },
  semana: { texto: '12 semanas', periodos: 12 },
  mes: { texto: '12 meses', periodos: 12 },
};

function rangoSerie(modo: Modo): { desde: string; hasta: string } {
  const hoy = new Date();
  const d = new Date(hoy);
  if (modo === 'dia') d.setDate(d.getDate() - 13);
  else if (modo === 'semana') d.setDate(d.getDate() - 7 * 11);
  else d.setMonth(d.getMonth() - 11, 1);
  return { desde: fechaLocal(d), hasta: fechaLocal(hoy) };
}

const fmtDia = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'numeric' });
const fmtMes = new Intl.DateTimeFormat('es-ES', { month: 'short' });
const fmtLargo = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtMesLargo = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
const fmtHoy = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

function Indicador({ etiqueta, valor, detalle, alerta }: { etiqueta: string; valor: ReactNode; detalle?: ReactNode; alerta?: boolean }) {
  return (
    <div className="bg-white p-4">
      <dt className="text-sm text-suave">{etiqueta}</dt>
      <dd className={`font-rotulo text-4xl font-bold leading-tight tabular-nums ${alerta ? 'text-peligro' : ''}`}>{valor}</dd>
      {detalle && <dd className="text-sm text-suave">{detalle}</dd>}
    </div>
  );
}

function Bloque({ titulo, enlace, children }: { titulo: string; enlace?: { a: string; texto: string }; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-md border border-linea bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-linea px-4 py-3">
        <h2 className="text-2xl">{titulo}</h2>
        {enlace && <Link to={enlace.a} className="text-sm font-semibold text-acero hover:underline">{enlace.texto}</Link>}
      </div>
      {children}
    </section>
  );
}

export function PanelPage() {
  const { perfil, puede } = useAuth();
  const navigate = useNavigate();

  const [ind, setInd] = useState<Indicadores | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>('dia');
  const [serie, setSerie] = useState<FilaSerie[] | null>(null);
  const [stockBajo, setStockBajo] = useState<Producto[]>([]);
  const [caducidades, setCaducidades] = useState<Lote[]>([]);
  const [pasillos, setPasillos] = useState<OcupacionPasillo[] | null>(null);
  const [ultimos, setUltimos] = useState<Movimiento[] | null>(null);

  useEffect(() => {
    rpc<Indicadores>('panel_indicadores', {}).then(setInd).catch(async (e) => setError(await mensajeError(e)));
    catalogoApi.movimientos({}, 0, 8).then(setUltimos).catch(() => setUltimos([]));

    supabase.from('v_productos').select('*').eq('activo', true).eq('stock_bajo', true).order('stock_total').limit(6)
      .then(({ data }) => setStockBajo(((data ?? []) as Producto[]).map((p) => ({ ...p, stock_total: Number(p.stock_total), stock_minimo: Number(p.stock_minimo) }))));

    const limite = new Date();
    limite.setDate(limite.getDate() + 30);
    supabase.from('v_lotes').select('*').gt('stock_actual', 0).lte('fecha_caducidad', fechaLocal(limite)).order('fecha_caducidad').limit(6)
      .then(({ data }) => setCaducidades(((data ?? []) as Lote[]).map((l) => ({ ...l, stock_actual: Number(l.stock_actual) }))));

    todasLasFilas<{ almacen_codigo: string; almacen_nombre: string; pasillo_codigo: string; capacidad: number | null; unidades: number }>(() =>
      supabase.from('v_informe_ubicaciones').select('almacen_codigo, almacen_nombre, pasillo_codigo, capacidad, unidades').order('codigo_completo'),
    )
      .then((filas) => {
        const mapa = new Map<string, OcupacionPasillo>();
        for (const h of filas) {
          const clave = `${h.almacen_codigo}-${h.pasillo_codigo}`;
          const p = mapa.get(clave) ?? { clave, almacen: h.almacen_nombre, pasillo: h.pasillo_codigo, huecos: 0, conMercancia: 0, capacidad: 0, unidadesConCapacidad: 0 };
          p.huecos++;
          if (Number(h.unidades) > 0) p.conMercancia++;
          if (h.capacidad) {
            p.capacidad += Number(h.capacidad);
            p.unidadesConCapacidad += Number(h.unidades);
          }
          mapa.set(clave, p);
        }
        const col = new Intl.Collator('es', { numeric: true });
        setPasillos([...mapa.values()].sort((a, b) => col.compare(a.clave, b.clave)));
      })
      .catch(() => setPasillos([]));
  }, []);

  useEffect(() => {
    setSerie(null);
    const { desde, hasta } = rangoSerie(modo);
    rpc<FilaSerie[]>('serie_movimientos', { p_desde: desde, p_hasta: hasta, p_agrupar: modo })
      .then((r) => setSerie(r.map((f) => ({ ...f, entradas: Number(f.entradas), salidas: Number(f.salidas) }))))
      .catch(() => setSerie([]));
  }, [modo]);

  const datosGrafico = useMemo<PuntoSerie[]>(
    () =>
      (serie ?? []).map((f) => {
        const d = new Date(`${f.periodo}T00:00:00`);
        return {
          etiqueta: modo === 'mes' ? fmtMes.format(d).replace('.', '') : fmtDia.format(d),
          etiquetaLarga: modo === 'mes' ? fmtMesLargo.format(d) : modo === 'semana' ? `semana del ${fmtLargo.format(d)}` : fmtLargo.format(d),
          entradas: f.entradas,
          salidas: f.salidas,
        };
      }),
    [serie, modo],
  );

  if (!perfil) return null;
  const nombre = perfil.nombre_completo.split(' ')[0] || perfil.email;
  const hoyTexto = fmtHoy.format(new Date());
  const hoy = fechaLocal();

  const ocupacion = ind
    ? ind.huecos.capacidad > 0
      ? { valor: `${formatearCantidad(Math.round((Number(ind.huecos.unidades_con_capacidad) * 1000) / Number(ind.huecos.capacidad)) / 10)} %`, detalle: `${ind.huecos.con_mercancia} de ${ind.huecos.total} huecos con mercancía` }
      : { valor: `${ind.huecos.con_mercancia}/${ind.huecos.total}`, detalle: 'huecos con mercancía' }
    : null;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-suave">{hoyTexto.charAt(0).toUpperCase() + hoyTexto.slice(1)}</p>
          <h1 className="text-4xl">Hola, {nombre}</h1>
        </div>
        {puede('registrar_movimientos') && (
          <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto">
            <Boton icono={<PackagePlus className="h-5 w-5" />} onClick={() => navigate('/entradas/nueva')} className="flex-col sm:flex-row">Entrada</Boton>
            <Boton icono={<PackageMinus className="h-5 w-5" />} onClick={() => navigate('/salidas/nueva')} className="flex-col sm:flex-row">Salida</Boton>
            <Boton variante="secundario" icono={<ArrowLeftRight className="h-5 w-5" />} onClick={() => navigate('/traslados/nueva')} className="flex-col sm:flex-row">Traslado</Boton>
          </div>
        )}
      </div>

      {error && <div className="mb-4"><Aviso>{error}</Aviso></div>}

      {ind?.descuadres ? (
        <div className="mb-4 flex items-start gap-3 rounded-md border-2 border-peligro bg-peligro-claro p-4 text-peligro" role="alert">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>
            <strong>Hay {ind.descuadres} {ind.descuadres === 1 ? 'descuadre' : 'descuadres'} entre el stock y el historial de movimientos.</strong> No debería ocurrir nunca.
            Consulta la vista <code>v_descuadres_stock</code> en Supabase antes de registrar más operaciones.
          </p>
        </div>
      ) : null}

      {/* Indicadores */}
      {!ind ? (
        !error && <Cargando />
      ) : (
        <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-linea bg-linea lg:grid-cols-5">
          <Indicador etiqueta="Referencias" valor={formatearCantidad(ind.referencias)} detalle={`${ind.referencias_con_stock} con stock`} />
          <Indicador etiqueta="Unidades en stock" valor={formatearCantidad(ind.unidades)} />
          <Indicador
            etiqueta="Entradas hoy"
            valor={formatearCantidad(ind.hoy.unidades_entrada)}
            detalle={`${ind.hoy.entradas} ${ind.hoy.entradas === 1 ? 'registro' : 'registros'}; semana: ${formatearCantidad(ind.semana.unidades_entrada)}`}
          />
          <Indicador
            etiqueta="Salidas hoy"
            valor={formatearCantidad(ind.hoy.unidades_salida)}
            detalle={`${ind.hoy.salidas} ${ind.hoy.salidas === 1 ? 'registro' : 'registros'}; semana: ${formatearCantidad(ind.semana.unidades_salida)}`}
          />
          <div className="col-span-2 lg:col-span-1">
            <Indicador etiqueta="Ocupación" valor={ocupacion?.valor} detalle={ocupacion?.detalle} />
          </div>
        </dl>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-6">
          <Bloque titulo="Entradas y salidas">
            <div className="p-4">
              <div className="mb-3 inline-flex rounded border border-linea p-0.5" role="group" aria-label="Periodo del gráfico">
                {(Object.keys(MODOS) as Modo[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setModo(m)}
                    aria-pressed={modo === m}
                    className={`min-h-[36px] rounded-[4px] px-3 text-sm font-semibold ${modo === m ? 'bg-acero text-white' : 'text-suave hover:text-tinta'}`}
                  >
                    {MODOS[m].texto}
                  </button>
                ))}
              </div>
              {serie ? <GraficoEntradasSalidas datos={datosGrafico} /> : <Cargando />}
            </div>
          </Bloque>

          <Bloque titulo="Últimos movimientos" enlace={{ a: '/trazabilidad', texto: 'Ver toda la trazabilidad' }}>
            {!ultimos ? (
              <Cargando />
            ) : ultimos.length === 0 ? (
              <p className="px-4 py-8 text-center text-suave">Todavía no hay movimientos.</p>
            ) : (
              <ul>{ultimos.map((m) => <FilaMovimiento key={m.id} m={m} />)}</ul>
            )}
          </Bloque>
        </div>

        <div className="min-w-0 space-y-6">
          <Bloque titulo="Stock bajo" enlace={ind && ind.stock_bajo > 0 ? { a: '/productos?stock_bajo=1', texto: `Ver los ${ind.stock_bajo}` } : undefined}>
            {stockBajo.length === 0 ? (
              <p className="px-4 py-6 text-suave">Ningún producto está por debajo de su mínimo.</p>
            ) : (
              <ul className="divide-y divide-linea/70">
                {stockBajo.map((p) => (
                  <li key={p.id}>
                    <Link to={`/productos/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-fondo/60">
                      <Miniatura ruta={p.foto_url} tamano={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{p.nombre}</span>
                        <span className="block text-sm text-suave">Mínimo {formatearCantidad(p.stock_minimo)}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 font-rotulo text-xl font-bold tabular-nums text-peligro">
                        <AlertTriangle className="h-4 w-4" aria-hidden />
                        {formatearCantidad(p.stock_total)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Bloque>

          <Bloque titulo="Caducidades">
            {caducidades.length === 0 ? (
              <p className="px-4 py-6 text-suave">Ningún lote con stock caduca en los próximos 30 días.</p>
            ) : (
              <ul className="divide-y divide-linea/70">
                {caducidades.map((l) => {
                  const caducado = !!l.fecha_caducidad && l.fecha_caducidad < hoy;
                  return (
                    <li key={l.id}>
                      <Link to={`/trazabilidad/lote/${l.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-fondo/60">
                        <CalendarClock className={`h-5 w-5 shrink-0 ${caducado ? 'text-peligro' : 'text-suave'}`} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{l.producto_nombre}</span>
                          <span className={`block text-sm ${caducado ? 'font-semibold text-peligro' : 'text-suave'}`}>
                            Lote {l.codigo}, {caducado ? 'caducó' : 'caduca'} el {formatearFecha(l.fecha_caducidad!)}
                          </span>
                        </span>
                        <span className="font-rotulo text-xl font-bold tabular-nums">{formatearCantidad(l.stock_actual)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Bloque>

          <Bloque titulo="Ocupación por pasillo" enlace={puede('informes') ? { a: '/informes?informe=ubicaciones', texto: 'Informe completo' } : { a: '/ubicaciones', texto: 'Ver mapa' }}>
            {!pasillos ? (
              <Cargando />
            ) : pasillos.length === 0 ? (
              <p className="px-4 py-6 text-suave">Aún no hay ubicaciones configuradas.</p>
            ) : (
              <ul className="space-y-3 p-4">
                {pasillos.map((p) => {
                  const pct = p.capacidad > 0 ? Math.min(100, (p.unidadesConCapacidad * 100) / p.capacidad) : (p.conMercancia * 100) / p.huecos;
                  return (
                    <li key={p.clave}>
                      <div className="mb-1 flex justify-between gap-2 text-sm">
                        <span className="font-semibold">
                          Pasillo {p.pasillo}
                          {pasillos.some((x) => x.almacen !== p.almacen) && <span className="font-normal text-suave">, {p.almacen}</span>}
                        </span>
                        <span className="tabular-nums text-suave">
                          {p.capacidad > 0 ? `${formatearCantidad(Math.round(pct))} %` : `${p.conMercancia}/${p.huecos} huecos`}
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-fondo" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`Ocupación del pasillo ${p.pasillo}`}>
                        <div className={`h-full ${pct >= 90 ? 'bg-peligro' : 'bg-acero'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Bloque>
        </div>
      </div>
    </>
  );
}
