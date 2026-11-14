import { useCallback, useEffect, useState } from 'react';
import { FileSpreadsheet, Pencil, Search, Trash2 } from 'lucide-react';
import { useNotificar } from '@/components/Notificaciones';
import { Aviso, Boton, CabeceraPagina, Cargando, Entrada, Selector } from '@/components/ui';
import { trazabilidadApi } from '@/features/trazabilidad/api';
import { formatearCantidad } from '@/lib/cantidad';
import { mensajeError } from '@/lib/errores';
import { exportarExcel } from '@/lib/exportar';
import { formatearFechaHora } from '@/lib/formato';
import { modificacionesApi, NOMBRE_TIPO, type EntradaRegistro, type FiltroRegistro, type TipoElemento } from './api';

const POR_PAGINA = 50;

/** Nombre legible de cada campo que puede aparecer en una edición. */
const CAMPOS: Record<string, string> = {
  codigo: 'Código',
  nombre: 'Nombre',
  descripcion: 'Descripción',
  direccion: 'Dirección',
  capacidad: 'Capacidad',
  activo: 'Activo',
  activa: 'Activa',
  notas: 'Notas',
  orden: 'Orden',
  foto_url: 'Foto',
  coleccion_id: 'Colección',
  contacto_id: 'Contacto habitual',
  stock_minimo: 'Stock mínimo',
  empresa: 'Empresa',
  telefono: 'Teléfono',
  email: 'Email',
};

function valor(v: unknown, campo: string): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (campo === 'foto_url') return 'foto nueva';
  if (campo.endsWith('_id')) return 'cambiado';
  if (typeof v === 'number') return formatearCantidad(v);
  return String(v);
}

function Detalle({ e }: { e: EntradaRegistro }) {
  const d = e.detalle as Record<string, unknown>;
  if (e.accion === 'edicion') {
    const cambios = (d.cambios ?? {}) as Record<string, { antes: unknown; despues: unknown }>;
    return (
      <ul className="mt-2 space-y-1 text-sm">
        {Object.entries(cambios).map(([campo, c]) => (
          <li key={campo}>
            <span className="font-semibold">{CAMPOS[campo] ?? campo}:</span>{' '}
            <span className="text-suave line-through">{valor(c.antes, campo)}</span> → <span>{valor(c.despues, campo)}</span>
          </li>
        ))}
      </ul>
    );
  }
  const retirado = (d.stock_retirado ?? []) as { ubicacion: string; lote: string | null; cantidad: number }[];
  const partes: string[] = [];
  if (typeof d.huecos_eliminados === 'number' && e.entidad !== 'hueco') partes.push(`Incluía ${d.huecos_eliminados} ${d.huecos_eliminados === 1 ? 'hueco' : 'huecos'}`);
  if (d.coleccion) partes.push(`Colección ${String(d.coleccion)}`);
  if (e.entidad === 'contacto') partes.push([d.empresa, d.telefono, d.email].filter(Boolean).join(', '));
  return (
    <div className="mt-2 space-y-1 text-sm">
      {partes.filter(Boolean).length > 0 && <p className="text-suave">{partes.filter(Boolean).join('. ')}</p>}
      {retirado.length > 0 && (
        <div>
          <p className="font-semibold">Stock retirado:</p>
          <ul className="ml-4 list-disc">
            {retirado.map((r, i) => (
              <li key={i}>
                {formatearCantidad(r.cantidad)} uds en {r.ubicacion}
                {r.lote && `, lote ${r.lote}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ModificacionesPage() {
  const notificar = useNotificar();
  const [filtro, setFiltro] = useState<FiltroRegistro>({});
  const [texto, setTexto] = useState('');
  const [filas, setFilas] = useState<EntradaRegistro[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [usuarios, setUsuarios] = useState<{ id: string; nombre_completo: string; email: string }[]>([]);

  useEffect(() => {
    trazabilidadApi.usuarios().then(setUsuarios).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setFiltro((f) => (f.texto === texto ? f : { ...f, texto })), 350);
    return () => clearTimeout(t);
  }, [texto]);

  const cargar = useCallback(async (f: FiltroRegistro) => {
    setFilas(null);
    try {
      const r = await modificacionesApi.registro(f, 0, POR_PAGINA);
      setFilas(r.filas);
      setTotal(r.total);
      setError(null);
    } catch (e) {
      setError(await mensajeError(e));
    }
  }, []);

  useEffect(() => {
    cargar(filtro);
  }, [filtro, cargar]);

  const set = (c: Partial<FiltroRegistro>) => setFiltro((f) => ({ ...f, ...c }));

  async function exportar() {
    setExportando(true);
    try {
      const todas: EntradaRegistro[] = [];
      for (let desde = 0; desde < 5000; desde += 1000) {
        const r = await modificacionesApi.registro(filtro, desde, 1000);
        todas.push(...r.filas);
        if (r.filas.length < 1000) break;
      }
      await exportarExcel({
        archivo: `Modificaciones ${new Date().toISOString().slice(0, 10)}`,
        titulo: 'Modificaciones',
        columnas: [
          { titulo: 'Fecha', valor: (e: EntradaRegistro) => e.fecha, tipo: 'fechahora', ancho: 16 },
          { titulo: 'Usuario', valor: (e) => e.usuario_nombre, ancho: 20 },
          { titulo: 'Acción', valor: (e) => (e.accion === 'eliminacion' ? 'Eliminación' : 'Edición'), ancho: 12 },
          { titulo: 'Elemento', valor: (e) => NOMBRE_TIPO[e.entidad][0], ancho: 12 },
          { titulo: 'Descripción', valor: (e) => e.descripcion, ancho: 34 },
          { titulo: 'Motivo', valor: (e) => e.motivo, ancho: 30 },
          { titulo: 'Detalle', valor: (e) => JSON.stringify(e.detalle), ancho: 60 },
        ],
        filas: todas,
      });
    } catch (e) {
      notificar(await mensajeError(e), 'error');
    } finally {
      setExportando(false);
    }
  }

  return (
    <>
      <CabeceraPagina
        titulo="Modificaciones"
        descripcion="Qué se ha eliminado o editado, quién lo hizo y cuándo. Este registro no se puede modificar."
        acciones={<Boton variante="secundario" icono={<FileSpreadsheet className="h-4 w-4" />} cargando={exportando} disabled={!filas?.length} onClick={exportar}>Excel</Boton>}
      />

      <div className="mb-5 grid gap-3 rounded-md border border-linea bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" aria-hidden />
          <Entrada type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar código, nombre o motivo" className="pl-9" aria-label="Buscar" />
        </div>
        <Selector value={filtro.accion ?? ''} onChange={(e) => set({ accion: e.target.value || undefined })} aria-label="Acción">
          <option value="">Todas las acciones</option>
          <option value="eliminacion">Eliminaciones</option>
          <option value="edicion">Ediciones</option>
        </Selector>
        <Selector value={filtro.entidad ?? ''} onChange={(e) => set({ entidad: e.target.value || undefined })} aria-label="Tipo de elemento">
          <option value="">Todos los elementos</option>
          {(Object.keys(NOMBRE_TIPO) as TipoElemento[]).map((t) => (
            <option key={t} value={t}>{NOMBRE_TIPO[t][1].charAt(0).toUpperCase() + NOMBRE_TIPO[t][1].slice(1)}</option>
          ))}
        </Selector>
        <Selector value={filtro.usuario ?? ''} onChange={(e) => set({ usuario: e.target.value || undefined })} aria-label="Usuario">
          <option value="">Todos los usuarios</option>
          {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre_completo || u.email}</option>)}
        </Selector>
        <label className="flex items-center gap-2 text-sm font-semibold text-suave">Desde<Entrada type="date" value={filtro.desde ?? ''} max={filtro.hasta} onChange={(e) => set({ desde: e.target.value || undefined })} /></label>
        <label className="flex items-center gap-2 text-sm font-semibold text-suave">Hasta<Entrada type="date" value={filtro.hasta ?? ''} min={filtro.desde} onChange={(e) => set({ hasta: e.target.value || undefined })} /></label>
      </div>

      {error ? (
        <Aviso>{error}</Aviso>
      ) : !filas ? (
        <Cargando />
      ) : filas.length === 0 ? (
        <div className="rounded-md border border-dashed border-linea bg-white px-6 py-12 text-center text-suave">
          {Object.values(filtro).some(Boolean) ? 'Ninguna modificación coincide con los filtros.' : 'Todavía no se ha eliminado ni editado nada.'}
        </div>
      ) : (
        <>
          <p className="mb-3 text-suave">{total.toLocaleString('es-ES')} {total === 1 ? 'modificación' : 'modificaciones'}</p>
          <ul className="space-y-3">
            {filas.map((e) => {
              const elimina = e.accion === 'eliminacion';
              const Icono = elimina ? Trash2 : Pencil;
              return (
                <li key={e.id} className={`rounded-md border bg-white p-4 ${elimina ? 'border-peligro/30' : 'border-linea'}`}>
                  <div className="flex flex-wrap items-start gap-3">
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${elimina ? 'bg-peligro-claro text-peligro' : 'bg-acero-claro text-acero'}`} aria-hidden>
                      <Icono className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        <span className={elimina ? 'text-peligro' : 'text-acero'}>{elimina ? 'Eliminación' : 'Edición'}</span>
                        <span className="font-normal text-suave"> de {NOMBRE_TIPO[e.entidad][0]}</span> {e.descripcion}
                      </p>
                      <p className="text-sm text-suave">{formatearFechaHora(e.fecha)}, {e.usuario_nombre}</p>
                      {e.motivo && <p className="mt-1 text-sm"><span className="font-semibold">Motivo:</span> {e.motivo}</p>}
                      <Detalle e={e} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {filas.length < total && (
            <div className="mt-5 text-center">
              <Boton
                variante="secundario"
                cargando={cargandoMas}
                onClick={async () => {
                  setCargandoMas(true);
                  try {
                    const r = await modificacionesApi.registro(filtro, filas.length, POR_PAGINA);
                    setFilas([...filas, ...r.filas]);
                  } finally {
                    setCargandoMas(false);
                  }
                }}
              >
                Ver más antiguas
              </Boton>
            </div>
          )}
        </>
      )}
    </>
  );
}
