import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, FileSpreadsheet, Package, Search, Undo2 } from 'lucide-react';
import { Miniatura } from '@/components/Miniatura';
import { useNotificar } from '@/components/Notificaciones';
import { Aviso, Boton, CabeceraPagina, Cargando, Entrada } from '@/components/ui';
import { useAuth } from '@/features/auth/ProveedorAuth';
import { formatearCantidad } from '@/lib/cantidad';
import { mensajeError } from '@/lib/errores';
import { exportarExcel } from '@/lib/exportar';
import { formatearFecha } from '@/lib/formato';
import { diasFuera, nombreEvento, prestamosApi, type Pendiente } from './api';

type Vista = 'evento' | 'producto';

interface Grupo {
  clave: string;
  titulo: string;
  subtitulo?: string;
  foto?: string | null;
  total: number;
  desde: string;
  filas: Pendiente[];
}

function agrupar(lista: Pendiente[], vista: Vista): Grupo[] {
  const m = new Map<string, Grupo>();
  for (const p of lista) {
    const k = vista === 'evento' ? p.clave_evento : p.producto_id;
    const g = m.get(k) ?? {
      clave: k,
      titulo: vista === 'evento' ? nombreEvento(p.evento) : p.nombre,
      subtitulo: vista === 'producto' ? p.sku : undefined,
      foto: vista === 'producto' ? p.foto_url : undefined,
      total: 0,
      desde: p.primera_salida,
      filas: [],
    };
    g.total += p.pendiente;
    if (p.primera_salida < g.desde) g.desde = p.primera_salida;
    g.filas.push(p);
    m.set(k, g);
  }
  // Lo que lleva más tiempo fuera, primero
  return [...m.values()].sort((a, b) => a.desde.localeCompare(b.desde));
}

export function PrestamosPage() {
  const { puede } = useAuth();
  const notificar = useNotificar();
  const [params, setParams] = useSearchParams();
  const [lista, setLista] = useState<Pendiente[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState(params.get('q') ?? '');
  const vista: Vista = params.get('vista') === 'producto' ? 'producto' : 'evento';

  useEffect(() => {
    prestamosApi.pendientes().then(setLista).catch(async (e) => setError(await mensajeError(e)));
  }, []);

  const filtrada = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return (lista ?? []).filter((p) => !t || `${p.sku} ${p.nombre} ${nombreEvento(p.evento)}`.toLowerCase().includes(t));
  }, [lista, texto]);
  const grupos = useMemo(() => agrupar(filtrada, vista), [filtrada, vista]);
  const totales = useMemo(
    () => ({
      unidades: (lista ?? []).reduce((s, p) => s + p.pendiente, 0),
      productos: new Set((lista ?? []).map((p) => p.producto_id)).size,
      eventos: new Set((lista ?? []).map((p) => p.clave_evento)).size,
    }),
    [lista],
  );

  async function exportar() {
    try {
      await exportarExcel({
        archivo: `Pendientes de devolución ${new Date().toISOString().slice(0, 10)}`,
        titulo: 'Pendientes de devolución',
        columnas: [
          { titulo: 'Evento o destino', valor: (p: Pendiente) => nombreEvento(p.evento), ancho: 28 },
          { titulo: 'SKU', valor: (p) => p.sku, ancho: 10 },
          { titulo: 'Producto', valor: (p) => p.nombre, ancho: 30 },
          { titulo: 'Salieron', valor: (p) => p.salido, tipo: 'numero', ancho: 10 },
          { titulo: 'Devueltas', valor: (p) => p.devuelto, tipo: 'numero', ancho: 10 },
          { titulo: 'Pendientes', valor: (p) => p.pendiente, tipo: 'numero', ancho: 11 },
          { titulo: 'Primera salida', valor: (p) => p.primera_salida, tipo: 'fecha', ancho: 13 },
          { titulo: 'Días fuera', valor: (p) => diasFuera(p.primera_salida), tipo: 'numero', ancho: 10 },
          { titulo: 'Última devolución', valor: (p) => p.ultima_devolucion, tipo: 'fecha', ancho: 14 },
        ],
        filas: filtrada,
      });
    } catch (e) {
      notificar(await mensajeError(e), 'error');
    }
  }

  const enlaceDevolver = (p: Pendiente) => `/devoluciones/nueva?producto=${p.producto_id}&evento=${encodeURIComponent(p.clave_evento)}`;

  return (
    <>
      <CabeceraPagina
        titulo="Préstamos"
        descripcion="Todo lo que ha salido y aún no ha vuelto, por evento o por producto. Las mermas no cuentan."
        acciones={
          <>
            <Boton variante="secundario" icono={<FileSpreadsheet className="h-4 w-4" />} disabled={!filtrada.length} onClick={exportar}>Excel</Boton>
            {puede('registrar_movimientos') && (
              <Link to="/devoluciones/nueva" className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-acero px-4 font-semibold text-white hover:bg-acero-oscuro">
                <Undo2 className="h-4 w-4" aria-hidden /> Registrar devolución
              </Link>
            )}
          </>
        }
      />

      {error ? (
        <Aviso>{error}</Aviso>
      ) : !lista ? (
        <Cargando />
      ) : lista.length === 0 ? (
        <Aviso tipo="ok">No hay nada pendiente de devolver: todo lo que ha salido ha vuelto al almacén.</Aviso>
      ) : (
        <>
          <dl className="mb-5 grid grid-cols-3 divide-x divide-linea rounded-md border border-linea bg-white text-center">
            {[
              ['Unidades fuera', formatearCantidad(totales.unidades)],
              ['Productos', totales.productos],
              ['Eventos', totales.eventos],
            ].map(([t, v]) => (
              <div key={t as string} className="px-3 py-4">
                <dt className="text-sm text-suave">{t}</dt>
                <dd className="font-rotulo text-3xl font-bold tabular-nums text-peligro">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[16rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" aria-hidden />
              <Entrada type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar producto, SKU o evento" className="pl-9" aria-label="Buscar" />
            </div>
            <div role="tablist" aria-label="Agrupar por" className="inline-flex rounded-md border border-linea bg-white p-1">
              {(['evento', 'producto'] as Vista[]).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={vista === v}
                  onClick={() => setParams((p) => { p.set('vista', v); return p; }, { replace: true })}
                  className={`inline-flex min-h-[40px] items-center gap-2 rounded px-3 font-semibold ${vista === v ? 'bg-acero text-white' : 'text-suave hover:bg-fondo'}`}
                >
                  {v === 'evento' ? <CalendarDays className="h-4 w-4" aria-hidden /> : <Package className="h-4 w-4" aria-hidden />}
                  Por {v}
                </button>
              ))}
            </div>
          </div>

          {grupos.length === 0 ? (
            <p className="rounded-md border border-dashed border-linea bg-white px-6 py-10 text-center text-suave">Nada pendiente coincide con la búsqueda.</p>
          ) : (
            <ul className="space-y-4">
              {grupos.map((g) => (
                <li key={g.clave} className="overflow-hidden rounded-md border border-linea bg-white">
                  <div className="flex flex-wrap items-center gap-3 border-b border-linea bg-fondo/60 px-4 py-3">
                    {vista === 'producto' && <Miniatura ruta={g.foto ?? null} tamano={40} />}
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-xl">
                        {g.titulo} {g.subtitulo && <span className="text-base font-normal text-suave">{g.subtitulo}</span>}
                      </h2>
                      <p className="text-sm text-suave">Fuera desde el {formatearFecha(g.desde)} ({diasFuera(g.desde)} días)</p>
                    </div>
                    <p className="text-right">
                      <span className="font-rotulo text-2xl font-bold tabular-nums text-peligro">{formatearCantidad(g.total)}</span>
                      <span className="block text-xs text-suave">pendientes</span>
                    </p>
                  </div>
                  <ul className="divide-y divide-linea/70">
                    {g.filas.map((p) => (
                      <li key={`${p.producto_id}|${p.clave_evento}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                        {vista === 'evento' && <Miniatura ruta={p.foto_url} tamano={36} />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {vista === 'evento' ? <>{p.nombre} <span className="font-normal text-suave">{p.sku}</span></> : nombreEvento(p.evento)}
                          </p>
                          <p className="text-sm text-suave">
                            Salieron {formatearCantidad(p.salido)}, han vuelto {formatearCantidad(p.devuelto)}
                            {p.ultima_devolucion && ` (última el ${formatearFecha(p.ultima_devolucion)})`}
                          </p>
                        </div>
                        <span className="font-rotulo text-xl font-bold tabular-nums text-peligro">{formatearCantidad(p.pendiente)}</span>
                        {puede('registrar_movimientos') && (
                          <Link to={enlaceDevolver(p)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-linea px-3 text-sm font-semibold hover:bg-fondo">
                            <Undo2 className="h-4 w-4" aria-hidden /> Devolver
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
