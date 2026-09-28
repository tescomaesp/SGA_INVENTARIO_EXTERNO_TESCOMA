import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileDown, FileSpreadsheet, FileText } from 'lucide-react';
import { useNotificar } from '@/components/Notificaciones';
import { Aviso, Boton, CabeceraPagina, Cargando, Entrada, Selector } from '@/components/ui';
import { TIPO_MOVIMIENTO } from '@/components/FilaMovimiento';
import { useAuth } from '@/features/auth/ProveedorAuth';
import { catalogoApi } from '@/features/catalogo/api';
import { trazabilidadApi } from '@/features/trazabilidad/api';
import { ubicacionesApi } from '@/features/ubicaciones/api';
import { mensajeError } from '@/lib/errores';
import { calcularTotales, exportarCsv, exportarExcel, exportarPdf, formatearCelda, type DatosExportacion } from '@/lib/exportar';
import type { Almacen } from '@/types/ubicaciones';
import type { Coleccion, TipoMovimiento } from '@/types/catalogo';
import { fechaLocal } from './api';
import { INFORMES, type FiltrosInforme } from './definiciones';

const VISTA_PREVIA = 100;

const primerDiaMes = () => {
  const d = new Date();
  return fechaLocal(new Date(d.getFullYear(), d.getMonth(), 1));
};

const fechaCorta = (dia: string) => new Intl.DateTimeFormat('es-ES').format(new Date(`${dia}T00:00:00`));

export function InformesPage() {
  const { perfil } = useAuth();
  const notificar = useNotificar();
  const [params, setParams] = useSearchParams();
  const informe = INFORMES.find((i) => i.id === params.get('informe')) ?? INFORMES[0];

  const [filtros, setFiltros] = useState<FiltrosInforme>({
    desde: primerDiaMes(),
    hasta: fechaLocal(),
    tipo: '',
    usuario: '',
    coleccion: '',
    almacen: '',
    vistaStock: 'lineas',
    agrupacion: 'hueco',
  });
  const [filas, setFilas] = useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState<string | null>(null);

  const [colecciones, setColecciones] = useState<Coleccion[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [usuarios, setUsuarios] = useState<{ id: string; nombre_completo: string; email: string }[]>([]);

  useEffect(() => {
    catalogoApi.colecciones().then(setColecciones).catch(() => {});
    ubicacionesApi.almacenes().then(setAlmacenes).catch(() => {});
    trazabilidadApi.usuarios().then(setUsuarios).catch(() => {});
  }, []);

  const rangoValido = !informe.filtros.includes('fechas') || (filtros.desde && filtros.hasta && filtros.desde <= filtros.hasta);

  useEffect(() => {
    if (!rangoValido) return;
    let vigente = true;
    setFilas(null);
    setError(null);
    informe
      .cargar(filtros)
      .then((r) => vigente && setFilas(r))
      .catch(async (e) => vigente && setError(await mensajeError(e)));
    return () => {
      vigente = false;
    };
  }, [informe, filtros, rangoValido]);

  const columnas = useMemo(() => informe.columnas(filtros), [informe, filtros]);
  const totales = useMemo(() => (filas ? calcularTotales(columnas, filas) : []), [columnas, filas]);
  const hayTotales = totales.some((t) => t !== null);

  /** Texto con los filtros aplicados: aparece bajo el título del Excel/PDF. */
  const descripcionFiltros = useMemo(() => {
    const partes: string[] = [];
    const f = informe.filtros;
    if (f.includes('fechas')) partes.push(`Del ${fechaCorta(filtros.desde)} al ${fechaCorta(filtros.hasta)}`);
    if (f.includes('vistaStock')) partes.push(filtros.vistaStock === 'productos' ? 'Total por producto' : 'Por ubicación y lote');
    if (f.includes('agrupacion')) partes.push(`Por ${filtros.agrupacion === 'hueco' ? 'hueco' : filtros.agrupacion}`);
    if (f.includes('tipo') && filtros.tipo) partes.push(`Solo ${TIPO_MOVIMIENTO[filtros.tipo].texto.toLowerCase()}s`);
    if (f.includes('usuario') && filtros.usuario) partes.push(`Usuario: ${usuarios.find((u) => u.id === filtros.usuario)?.nombre_completo ?? ''}`);
    if (f.includes('coleccion') && filtros.coleccion) partes.push(`Colección: ${colecciones.find((c) => c.id === filtros.coleccion)?.nombre ?? ''}`);
    if (f.includes('almacen') && filtros.almacen && !(f.includes('vistaStock') && filtros.vistaStock === 'productos'))
      partes.push(`Almacén: ${almacenes.find((a) => a.id === filtros.almacen)?.nombre ?? ''}`);
    return partes.join(', ');
  }, [informe, filtros, usuarios, colecciones, almacenes]);

  async function exportar(formato: 'excel' | 'csv' | 'pdf') {
    if (!filas) return;
    const datos: DatosExportacion<Record<string, unknown>> = {
      archivo: `${informe.titulo} ${fechaLocal()}`,
      titulo: informe.titulo,
      subtitulo: [descripcionFiltros, perfil ? `Generado por ${perfil.nombre_completo || perfil.email}` : ''].filter(Boolean).join('. '),
      columnas,
      filas,
    };
    setExportando(formato);
    try {
      if (formato === 'excel') await exportarExcel(datos);
      else if (formato === 'csv') exportarCsv(datos);
      else {
        if (filas.length > 5000) notificar('Un PDF con tantas filas puede tardar. Para listados largos es mejor Excel.', 'error');
        await exportarPdf(datos);
      }
    } catch (e) {
      notificar(await mensajeError(e), 'error');
    } finally {
      setExportando(null);
    }
  }

  const set = <K extends keyof FiltrosInforme>(k: K, v: FiltrosInforme[K]) => setFiltros((f) => ({ ...f, [k]: v }));
  const tiene = (campo: (typeof informe.filtros)[number]) => informe.filtros.includes(campo);

  return (
    <>
      <CabeceraPagina titulo="Informes" descripcion="Consulta los datos del almacén y descárgalos en Excel, CSV o PDF." />

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label="Tipos de informe">
          <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {INFORMES.map((i) => (
              <li key={i.id} className="shrink-0">
                <button
                  onClick={() => setParams({ informe: i.id }, { replace: true })}
                  aria-current={i.id === informe.id ? 'page' : undefined}
                  className={`w-full rounded-md border-2 px-3 py-2.5 text-left font-semibold lg:px-4 ${
                    i.id === informe.id ? 'border-acero bg-acero-claro text-acero-oscuro' : 'border-transparent bg-white hover:border-linea'
                  }`}
                >
                  {i.titulo}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          <div className="mb-4">
            <h2 className="text-3xl">{informe.titulo}</h2>
            <p className="text-suave">{informe.descripcion}</p>
          </div>

          {/* Filtros */}
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md border border-linea bg-white p-4">
            {tiene('vistaStock') && (
              <div>
                <label htmlFor="i-vista" className="mb-1 block text-sm font-semibold">Detalle</label>
                <Selector id="i-vista" value={filtros.vistaStock} onChange={(e) => set('vistaStock', e.target.value as FiltrosInforme['vistaStock'])} className="w-auto">
                  <option value="lineas">Por ubicación y lote</option>
                  <option value="productos">Total por producto</option>
                </Selector>
              </div>
            )}
            {tiene('agrupacion') && (
              <div>
                <label htmlFor="i-agr" className="mb-1 block text-sm font-semibold">Agrupar por</label>
                <Selector id="i-agr" value={filtros.agrupacion} onChange={(e) => set('agrupacion', e.target.value as FiltrosInforme['agrupacion'])} className="w-auto">
                  <option value="hueco">Hueco</option>
                  <option value="estanteria">Estantería</option>
                  <option value="pasillo">Pasillo</option>
                </Selector>
              </div>
            )}
            {tiene('fechas') && (
              <>
                <div>
                  <label htmlFor="i-desde" className="mb-1 block text-sm font-semibold">Desde</label>
                  <Entrada id="i-desde" type="date" value={filtros.desde} max={filtros.hasta} onChange={(e) => set('desde', e.target.value)} className="w-auto" />
                </div>
                <div>
                  <label htmlFor="i-hasta" className="mb-1 block text-sm font-semibold">Hasta</label>
                  <Entrada id="i-hasta" type="date" value={filtros.hasta} min={filtros.desde} onChange={(e) => set('hasta', e.target.value)} className="w-auto" />
                </div>
              </>
            )}
            {tiene('tipo') && (
              <div>
                <label htmlFor="i-tipo" className="mb-1 block text-sm font-semibold">Tipo</label>
                <Selector id="i-tipo" value={filtros.tipo} onChange={(e) => set('tipo', e.target.value as TipoMovimiento | '')} className="w-auto">
                  <option value="">Todos</option>
                  {(Object.keys(TIPO_MOVIMIENTO) as TipoMovimiento[]).map((t) => <option key={t} value={t}>{TIPO_MOVIMIENTO[t].texto}</option>)}
                </Selector>
              </div>
            )}
            {tiene('usuario') && (
              <div>
                <label htmlFor="i-usuario" className="mb-1 block text-sm font-semibold">Usuario</label>
                <Selector id="i-usuario" value={filtros.usuario} onChange={(e) => set('usuario', e.target.value)} className="w-auto max-w-[14rem]">
                  <option value="">Todos</option>
                  {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre_completo || u.email}</option>)}
                </Selector>
              </div>
            )}
            {tiene('coleccion') && (
              <div>
                <label htmlFor="i-col" className="mb-1 block text-sm font-semibold">Colección</label>
                <Selector id="i-col" value={filtros.coleccion} onChange={(e) => set('coleccion', e.target.value)} className="w-auto max-w-[14rem]">
                  <option value="">Todas</option>
                  {colecciones.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </Selector>
              </div>
            )}
            {tiene('almacen') && almacenes.length > 1 && !(tiene('vistaStock') && filtros.vistaStock === 'productos') && (
              <div>
                <label htmlFor="i-alm" className="mb-1 block text-sm font-semibold">Almacén</label>
                <Selector id="i-alm" value={filtros.almacen} onChange={(e) => set('almacen', e.target.value)} className="w-auto">
                  <option value="">Todos</option>
                  {almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </Selector>
              </div>
            )}
          </div>

          {/* Exportación */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-suave" aria-live="polite">
              {filas ? `${filas.length.toLocaleString('es-ES')} ${filas.length === 1 ? 'fila' : 'filas'}` : ''}
              {filas && filas.length > VISTA_PREVIA && `; se muestran las ${VISTA_PREVIA} primeras, la descarga incluye todas`}
            </p>
            <div className="flex flex-wrap gap-2">
              <Boton variante="secundario" icono={<FileSpreadsheet className="h-4 w-4" />} disabled={!filas?.length} cargando={exportando === 'excel'} onClick={() => exportar('excel')}>Excel</Boton>
              <Boton variante="secundario" icono={<FileDown className="h-4 w-4" />} disabled={!filas?.length} cargando={exportando === 'csv'} onClick={() => exportar('csv')}>CSV</Boton>
              <Boton variante="secundario" icono={<FileText className="h-4 w-4" />} disabled={!filas?.length} cargando={exportando === 'pdf'} onClick={() => exportar('pdf')}>PDF</Boton>
            </div>
          </div>

          {/* Vista previa */}
          {!rangoValido ? (
            <Aviso>La fecha «desde» debe ser anterior o igual a la fecha «hasta».</Aviso>
          ) : error ? (
            <Aviso>{error}</Aviso>
          ) : !filas ? (
            <Cargando texto="Preparando el informe…" />
          ) : filas.length === 0 ? (
            <div className="rounded-md border border-dashed border-linea bg-white px-6 py-12 text-center text-suave">No hay datos para estos filtros.</div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-linea bg-white">
              <table className="tabla w-full text-sm">
                <thead>
                  <tr>
                    {columnas.map((c) => (
                      <th key={c.titulo} className={`whitespace-nowrap ${c.tipo === 'numero' || c.tipo === 'porcentaje' ? 'text-right' : ''}`}>{c.titulo}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.slice(0, VISTA_PREVIA).map((f, i) => (
                    <tr key={i}>
                      {columnas.map((c) => {
                        const v = c.valor(f);
                        const numerico = c.tipo === 'numero' || c.tipo === 'porcentaje';
                        return (
                          <td key={c.titulo} className={`${numerico ? 'text-right tabular-nums' : ''} ${c.tipo === 'fecha' || c.tipo === 'fechahora' || numerico ? 'whitespace-nowrap' : ''} ${numerico && Number(v) < 0 ? 'text-peligro' : ''}`}>
                            {formatearCelda(v, c.tipo)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                {hayTotales && (
                  <tfoot>
                    <tr className="bg-acero-claro font-semibold">
                      {columnas.map((c, i) => (
                        <td key={c.titulo} className={`px-4 py-2.5 ${c.tipo === 'numero' ? 'text-right tabular-nums' : ''}`}>
                          {totales[i] !== null ? formatearCelda(totales[i], 'numero') : i === 0 ? 'Total' : ''}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
          {hayTotales && filas && filas.length > VISTA_PREVIA && <p className="mt-2 text-sm text-suave">Los totales incluyen todas las filas, no solo las mostradas.</p>}
        </div>
      </div>
    </>
  );
}
