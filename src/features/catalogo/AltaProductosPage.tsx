import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Download, FileSpreadsheet, PackagePlus, Plus, Printer, Trash2, Upload } from 'lucide-react';
import { CampoFoto } from '@/components/CampoFoto';
import { useNotificar } from '@/components/Notificaciones';
import { SeccionFormulario } from '@/components/SeccionFormulario';
import { Aviso, Boton, CabeceraPagina, Campo, Entrada, Selector } from '@/components/ui';
import { SelectorUbicacion, type HuecoElegido } from '@/features/ubicaciones/SelectorUbicacion';
import { formatearCantidad, leerCantidad } from '@/lib/cantidad';
import { mensajeError } from '@/lib/errores';
import { supabase } from '@/lib/supabase';
import type { Coleccion, Contacto } from '@/types/catalogo';
import { catalogoApi } from './api';
import { SelectorContacto } from './SelectorContacto';

type Modo = 'uno' | 'hoja';

export function AltaProductosPage() {
  const [params, setParams] = useSearchParams();
  const modo: Modo = params.get('modo') === 'hoja' ? 'hoja' : 'uno';
  return (
    <>
      <Link to="/productos" className="mb-3 inline-flex min-h-[44px] items-center gap-2 font-semibold text-acero hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Productos
      </Link>
      <CabeceraPagina
        titulo="Alta de productos"
        descripcion="Para dar de alta productos en el almacén por primera vez, con las cantidades que ya hay. Las entradas del día a día se registran en Entradas."
      />
      <div role="tablist" aria-label="Forma de dar de alta" className="mb-5 inline-flex rounded-md border border-linea bg-white p-1">
        {([
          ['uno', 'Uno a uno', PackagePlus],
          ['hoja', 'Importar hoja de cálculo', FileSpreadsheet],
        ] as const).map(([m, texto, Icono]) => (
          <button
            key={m}
            role="tab"
            aria-selected={modo === m}
            onClick={() => setParams(m === 'hoja' ? { modo: 'hoja' } : {}, { replace: true })}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded px-4 font-semibold ${modo === m ? 'bg-acero text-white' : 'text-suave hover:bg-fondo'}`}
          >
            <Icono className="h-4 w-4" aria-hidden /> {texto}
          </button>
        ))}
      </div>
      {modo === 'uno' ? <AltaUnoAUno /> : <ImportarHoja />}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Uno a uno                                                           */
/* ------------------------------------------------------------------ */

interface FilaUbicacion {
  clave: number;
  hueco: HuecoElegido | null;
  cantidad: string;
}

function AltaUnoAUno() {
  const notificar = useNotificar();
  const [colecciones, setColecciones] = useState<Coleccion[]>([]);
  const [nombre, setNombre] = useState('');
  const [coleccionId, setColeccionId] = useState('');
  const [foto, setFoto] = useState<File | null>(null);
  const [contacto, setContacto] = useState<Contacto | null>(null);
  const [minimo, setMinimo] = useState('');
  const [notas, setNotas] = useState('');
  const [ubicaciones, setUbicaciones] = useState<FilaUbicacion[]>([{ clave: 1, hueco: null, cantidad: '' }]);
  const siguiente = useRef(2);
  const [intentado, setIntentado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ id: string; sku: string; nombre: string; unidades: number } | null>(null);

  useEffect(() => {
    catalogoApi.colecciones(true).then(setColecciones).catch(() => {});
  }, []);

  const validar = () => {
    const e: Record<string, string> = {};
    if (!nombre.trim()) e.nombre = 'Escribe el nombre del producto.';
    if (!coleccionId) e.coleccion = 'Elige la colección.';
    const m = minimo.trim() ? leerCantidad(minimo) : 0;
    if (m === null || m < 0) e.minimo = 'Escribe un número (0 o más).';
    ubicaciones.forEach((u) => {
      const c = leerCantidad(u.cantidad);
      if (u.hueco && (c === null || c <= 0)) e[`u${u.clave}`] = 'Indica cuántas unidades hay en este hueco.';
      if (!u.hueco && u.cantidad.trim()) e[`u${u.clave}`] = 'Elige el hueco donde están.';
    });
    const huecos = ubicaciones.filter((u) => u.hueco).map((u) => u.hueco!.id);
    if (new Set(huecos).size !== huecos.length) e.repetido = 'Hay un hueco repetido: suma las cantidades en una sola línea.';
    return e;
  };
  const errores = intentado ? validar() : {};
  const total = ubicaciones.reduce((t, u) => t + (u.hueco ? leerCantidad(u.cantidad) ?? 0 : 0), 0);

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    setIntentado(true);
    const err = validar();
    if (Object.keys(err).length) {
      document.getElementById(err.nombre ? 'alta-nombre' : err.coleccion ? 'alta-coleccion' : 'alta-ubicaciones')?.focus();
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const ruta = foto ? await catalogoApi.subirFoto(foto) : null;
      const { data, error: e } = await supabase.rpc('alta_producto', {
        p_nombre: nombre,
        p_coleccion_id: coleccionId,
        p_foto_url: ruta,
        p_contacto_id: contacto?.id ?? null,
        p_stock_minimo: minimo.trim() ? leerCantidad(minimo) : 0,
        p_notas: notas.trim() || null,
        p_ubicaciones: ubicaciones.filter((u) => u.hueco).map((u) => ({ hueco_id: u.hueco!.id, cantidad: leerCantidad(u.cantidad) })),
      });
      if (e) throw e;
      const r = data as { producto_id: string; sku: string; unidades: number };
      setHecho({ id: r.producto_id, sku: r.sku, nombre: nombre.trim(), unidades: Number(r.unidades) });
      notificar(`${r.sku} dado de alta`);
    } catch (e) {
      setError(await mensajeError(e));
    } finally {
      setEnviando(false);
    }
  }

  function otro() {
    setHecho(null);
    setNombre('');
    setFoto(null);
    setMinimo('');
    setNotas('');
    setUbicaciones([{ clave: siguiente.current++, hueco: null, cantidad: '' }]);
    setIntentado(false);
  }

  if (hecho) {
    return (
      <div className="max-w-xl rounded-md border border-ok/40 bg-white p-6 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-ok" aria-hidden />
        <h2 className="mt-3 text-2xl">{hecho.nombre}</h2>
        <p className="mt-1">
          Dado de alta con el código <strong>{hecho.sku}</strong>
          {hecho.unidades > 0 ? ` y ${formatearCantidad(hecho.unidades)} unidades en el almacén.` : ', sin stock por ahora.'}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Boton onClick={otro} icono={<Plus className="h-4 w-4" />}>Dar de alta otro</Boton>
          <Link to={`/productos/etiquetas?producto=${hecho.id}`} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-linea px-4 font-semibold hover:bg-fondo">
            <Printer className="h-4 w-4" aria-hidden /> Imprimir etiqueta
          </Link>
          <Link to={`/productos/${hecho.id}`} className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-linea px-4 font-semibold hover:bg-fondo">Ver ficha</Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} noValidate className="max-w-3xl space-y-5 pb-4">
      <SeccionFormulario numero={1} titulo="Ficha del producto">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Nombre" htmlFor="alta-nombre" obligatorio error={errores.nombre}>
            <Entrada id="alta-nombre" value={nombre} maxLength={160} onChange={(e) => setNombre(e.target.value)} />
          </Campo>
          <Campo etiqueta="Colección" htmlFor="alta-coleccion" obligatorio error={errores.coleccion}>
            <Selector id="alta-coleccion" value={coleccionId} onChange={(e) => setColeccionId(e.target.value)}>
              <option value="">Elegir colección</option>
              {colecciones.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Selector>
          </Campo>
          <Campo etiqueta="Stock mínimo" htmlFor="alta-minimo" error={errores.minimo} ayuda="Avisa cuando quede menos. Déjalo vacío si no hace falta.">
            <Entrada id="alta-minimo" inputMode="decimal" value={minimo} onChange={(e) => setMinimo(e.target.value)} className="max-w-[10rem]" />
          </Campo>
          <Campo etiqueta="Notas" htmlFor="alta-notas">
            <Entrada id="alta-notas" value={notas} maxLength={500} onChange={(e) => setNotas(e.target.value)} />
          </Campo>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Foto" htmlFor="alta-foto" ayuda="Opcional ahora; se puede añadir después desde la ficha.">
            <CampoFoto id="alta-foto" archivo={foto} onCambio={setFoto} />
          </Campo>
          <div>
            <p className="mb-1.5 font-semibold">Contacto habitual <span className="font-normal text-suave">(opcional)</span></p>
            <SelectorContacto id="alta-contacto" valor={contacto} onCambio={setContacto} />
          </div>
        </div>
      </SeccionFormulario>

      <SeccionFormulario numero={2} titulo="Dónde está y cuántas hay">
        <p className="mb-4 text-suave">Una línea por hueco. Si aún no hay unidades, deja la línea vacía: se crea solo la ficha.</p>
        <div id="alta-ubicaciones" tabIndex={-1} className="space-y-4">
          {ubicaciones.map((u, i) => (
            <div key={u.clave} className="rounded-md border border-linea p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-semibold">Ubicación {i + 1}</p>
                {ubicaciones.length > 1 && (
                  <Boton type="button" variante="fantasma" className="px-3 text-peligro" aria-label={`Quitar la ubicación ${i + 1}`} icono={<Trash2 className="h-4 w-4" />} onClick={() => setUbicaciones(ubicaciones.filter((x) => x.clave !== u.clave))} />
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_10rem]">
                <SelectorUbicacion
                  id={`alta-hueco-${u.clave}`}
                  valor={u.hueco}
                  cantidad={leerCantidad(u.cantidad)}
                  onCambio={(h) => setUbicaciones(ubicaciones.map((x) => (x.clave === u.clave ? { ...x, hueco: h } : x)))}
                />
                <Campo etiqueta="Unidades" htmlFor={`alta-cant-${u.clave}`}>
                  <Entrada id={`alta-cant-${u.clave}`} inputMode="decimal" value={u.cantidad} onChange={(e) => setUbicaciones(ubicaciones.map((x) => (x.clave === u.clave ? { ...x, cantidad: e.target.value } : x)))} className="font-rotulo text-xl font-bold" />
                </Campo>
              </div>
              {errores[`u${u.clave}`] && <p className="mt-1 text-sm text-peligro" role="alert">{errores[`u${u.clave}`]}</p>}
            </div>
          ))}
        </div>
        {errores.repetido && <p className="mt-2 text-sm text-peligro" role="alert">{errores.repetido}</p>}
        <Boton type="button" variante="secundario" className="mt-3" icono={<Plus className="h-4 w-4" />} onClick={() => setUbicaciones([...ubicaciones, { clave: siguiente.current++, hueco: null, cantidad: '' }])}>
          Añadir otra ubicación
        </Boton>
      </SeccionFormulario>

      {error && <Aviso>{error}</Aviso>}
      <Boton type="submit" ancho cargando={enviando} icono={<PackagePlus className="h-5 w-5" />}>
        {total > 0 ? `Dar de alta con ${formatearCantidad(total)} unidades` : 'Dar de alta (solo la ficha)'}
      </Boton>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Importar hoja de cálculo                                            */
/* ------------------------------------------------------------------ */

interface FilaHoja {
  fila: number;
  nombre: string;
  coleccion: string;
  ubicacion: string;
  cantidad: string;
  stock_minimo: string;
  notas: string;
}

interface Resultado {
  guardado: boolean;
  productos: number;
  unidades: number;
  colecciones_nuevas: string[];
  errores: { fila: number; producto: string; mensaje: string; filas: number[] }[];
}

const CABECERAS: Record<string, keyof Omit<FilaHoja, 'fila'>> = {
  nombre: 'nombre',
  producto: 'nombre',
  coleccion: 'coleccion',
  ubicacion: 'ubicacion',
  hueco: 'ubicacion',
  codigo: 'ubicacion',
  cantidad: 'cantidad',
  unidades: 'cantidad',
  stock: 'cantidad',
  'stock minimo': 'stock_minimo',
  minimo: 'stock_minimo',
  notas: 'notas',
  observaciones: 'notas',
};

const normalizar = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[*()]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const texto = (v: unknown) => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());

/** CSV con separador «;» o «,» y comillas. */
function leerCsv(contenido: string): string[][] {
  const limpio = contenido.replace(/^\uFEFF/, '');
  const primera = limpio.split(/\r?\n/, 1)[0];
  const sep = (primera.match(/;/g)?.length ?? 0) >= (primera.match(/,/g)?.length ?? 0) ? ';' : ',';
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') { celda += '"'; i++; }
      else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(celda); celda = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpio[i + 1] === '\n') i++;
      fila.push(celda); filas.push(fila); fila = []; celda = '';
    } else celda += c;
  }
  if (celda || fila.length) { fila.push(celda); filas.push(fila); }
  return filas;
}

function interpretar(tabla: unknown[][]): { filas: FilaHoja[]; aviso?: string } {
  const iCab = tabla.findIndex((f) => f.some((c) => ['nombre', 'producto'].includes(normalizar(c))));
  if (iCab < 0) return { filas: [], aviso: 'No se encuentra la fila de títulos: la primera columna debe llamarse «Nombre». Usa la plantilla.' };
  const mapa = tabla[iCab].map((c) => CABECERAS[normalizar(c)] ?? null);
  if (!mapa.includes('coleccion')) return { filas: [], aviso: 'Falta la columna «Colección». Usa la plantilla.' };
  const filas: FilaHoja[] = [];
  tabla.slice(iCab + 1).forEach((f, i) => {
    const r: FilaHoja = { fila: iCab + i + 2, nombre: '', coleccion: '', ubicacion: '', cantidad: '', stock_minimo: '', notas: '' };
    mapa.forEach((campo, j) => {
      if (campo && !r[campo]) r[campo] = texto(f[j]);
    });
    if (Object.entries(r).some(([k, v]) => k !== 'fila' && v)) filas.push(r);
  });
  return { filas };
}

async function descargarPlantilla() {
  const { default: writeXlsxFile } = await import('write-excel-file');
  const titulo = (v: string) => ({ value: v, fontWeight: 'bold' as const, backgroundColor: '#DCE6F2' });
  const t = (v: string) => ({ value: v });
  const n = (v: number) => ({ value: v, type: Number });
  const productos = [
    ['Nombre', 'Colección', 'Ubicación', 'Cantidad', 'Stock mínimo', 'Notas'].map(titulo),
    [t('Mesa plegable 180'), t('Mobiliario'), t('ALM1-P01-E01-N1-H01'), n(20), n(5), t('')],
    [t('Mesa plegable 180'), t('Mobiliario'), t('ALM1-P01-E01-N1-H02'), n(10), t(''), t('')],
    [t('Foco LED 50W'), t('Iluminación'), t('ALM1-P01-E02-N1-H01'), n(12), n(2), t('Con cable de 5 m')],
    [t('Atril'), t('Mobiliario'), t(''), t(''), t(''), t('Solo la ficha, sin stock todavía')],
  ];
  const instrucciones = [
    [titulo('Cómo rellenar la hoja «Productos»')],
    [t('1. Borra las filas de ejemplo y escribe una fila por producto y hueco.')],
    [t('2. Nombre y Colección son obligatorios. Las demás columnas son opcionales.')],
    [t('3. Si un producto está en varios huecos, repite el nombre y la colección en otra fila: se crea un solo producto.')],
    [t('4. Ubicación es el código completo del hueco, tal como aparece en su etiqueta (por ejemplo ALM1-P01-E01-N1-H01).')],
    [t('5. Si dejas Ubicación y Cantidad vacías, se crea solo la ficha del producto.')],
    [t('6. El código (SKU) lo asigna la aplicación. La foto se añade después desde la ficha de cada producto.')],
    [t('7. Al subir el archivo, primero se revisa todo sin guardar nada. Solo se guarda cuando no hay errores.')],
  ];
  await writeXlsxFile([productos, instrucciones], {
    sheets: ['Productos', 'Instrucciones'],
    columns: [[{ width: 28 }, { width: 18 }, { width: 24 }, { width: 10 }, { width: 13 }, { width: 34 }], [{ width: 110 }]],
    fileName: 'Plantilla alta de productos.xlsx',
  });
}

function ImportarHoja() {
  const [archivo, setArchivo] = useState<string | null>(null);
  const [filas, setFilas] = useState<FilaHoja[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [crearColecciones, setCrearColecciones] = useState(false);
  const [revision, setRevision] = useState<Resultado | null>(null);
  const [final, setFinal] = useState<Resultado | null>(null);
  const [trabajando, setTrabajando] = useState<'leer' | 'revisar' | 'importar' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const conError = useMemo(() => new Set((revision?.errores ?? []).flatMap((e) => e.filas ?? [e.fila])), [revision]);
  const faltanColecciones = (revision?.errores ?? []).some((e) => /colección .* no existe/i.test(e.mensaje));

  async function llamar(simular: boolean, lista = filas, crear = crearColecciones): Promise<Resultado | null> {
    const { data, error: e } = await supabase.rpc('cargar_productos', { p_filas: lista, p_simular: simular, p_crear_colecciones: crear });
    if (e) {
      setError(await mensajeError(e));
      return null;
    }
    return data as Resultado;
  }

  async function leer(f: File) {
    setTrabajando('leer');
    setError(null);
    setAviso(null);
    setRevision(null);
    setFinal(null);
    setArchivo(f.name);
    try {
      let tabla: unknown[][];
      if (/\.csv$/i.test(f.name)) tabla = leerCsv(await f.text());
      else {
        const { default: leerExcel } = await import('read-excel-file');
        tabla = (await leerExcel(f)) as unknown[][];
      }
      const r = interpretar(tabla);
      setFilas(r.filas);
      if (r.aviso) setAviso(r.aviso);
      else if (r.filas.length === 0) setAviso('El archivo no tiene filas con productos.');
      else {
        setTrabajando('revisar');
        setRevision(await llamar(true, r.filas));
      }
    } catch {
      setError('No se ha podido leer el archivo. Usa la plantilla en formato Excel (.xlsx) o CSV.');
    } finally {
      setTrabajando(null);
    }
  }

  async function revisarDeNuevo(crear: boolean) {
    setCrearColecciones(crear);
    setTrabajando('revisar');
    setRevision(await llamar(true, filas, crear));
    setTrabajando(null);
  }

  async function importar() {
    setTrabajando('importar');
    const r = await llamar(false);
    if (r?.guardado) setFinal(r);
    else if (r) setRevision(r);
    setTrabajando(null);
  }

  if (final) {
    return (
      <div className="max-w-xl rounded-md border border-ok/40 bg-white p-6 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-ok" aria-hidden />
        <h2 className="mt-3 text-2xl">Importación terminada</h2>
        <p className="mt-1">
          {final.productos} {final.productos === 1 ? 'producto dado de alta' : 'productos dados de alta'} con {formatearCantidad(final.unidades)} unidades.
          {final.colecciones_nuevas.length > 0 && ` Colecciones creadas: ${final.colecciones_nuevas.join(', ')}.`}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link to="/productos" className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-acero px-4 font-semibold text-white hover:bg-acero-oscuro">Ver productos</Link>
          <Link to="/productos?pestana=colecciones" className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-linea px-4 font-semibold hover:bg-fondo">
            <Printer className="h-4 w-4" aria-hidden /> Imprimir etiquetas por colección
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-5">
      <SeccionFormulario numero={1} titulo="Prepara la hoja">
        <p className="mb-4">
          Descarga la plantilla, rellena una fila por producto y hueco, y guárdala. Si un producto está en varios huecos, repite su nombre y colección en varias filas.
          La hoja «Instrucciones» lo explica con detalle.
        </p>
        <Boton type="button" variante="secundario" icono={<Download className="h-4 w-4" />} onClick={descargarPlantilla}>Descargar plantilla Excel</Boton>
      </SeccionFormulario>

      <SeccionFormulario numero={2} titulo="Sube el archivo">
        <input
          ref={entrada}
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="sr-only"
          id="archivo-hoja"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) leer(f);
            e.target.value = '';
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Boton type="button" icono={<Upload className="h-4 w-4" />} cargando={trabajando === 'leer'} onClick={() => entrada.current?.click()}>
            {archivo ? 'Elegir otro archivo' : 'Elegir archivo (.xlsx o .csv)'}
          </Boton>
          {archivo && <span className="text-suave">{archivo}{filas ? `: ${filas.length} ${filas.length === 1 ? 'fila' : 'filas'}` : ''}</span>}
        </div>
        {aviso && <div className="mt-4"><Aviso>{aviso}</Aviso></div>}
        {error && <div className="mt-4"><Aviso>{error}</Aviso></div>}
      </SeccionFormulario>

      {filas && filas.length > 0 && (
        <SeccionFormulario numero={3} titulo="Revisa y confirma">
          {trabajando === 'revisar' ? (
            <p className="text-suave" role="status">Revisando el archivo sin guardar nada…</p>
          ) : revision ? (
            <div className="space-y-4">
              {revision.errores.length === 0 ? (
                <Aviso tipo="ok">
                  Todo correcto: se darán de alta {revision.productos} {revision.productos === 1 ? 'producto' : 'productos'} con {formatearCantidad(revision.unidades)} unidades
                  {revision.colecciones_nuevas.length > 0 && ` y se crearán las colecciones ${revision.colecciones_nuevas.join(', ')}`}. Todavía no se ha guardado nada.
                </Aviso>
              ) : (
                <Aviso>
                  {revision.errores.length === 1 ? 'Hay 1 error' : `Hay ${revision.errores.length} errores`}. No se guardará nada hasta que el archivo esté correcto:
                  corrígelo y vuelve a subirlo.
                </Aviso>
              )}
              {faltanColecciones && (
                <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border border-linea bg-fondo/60 px-3">
                  <input type="checkbox" className="h-5 w-5 accent-acero" checked={crearColecciones} onChange={(e) => revisarDeNuevo(e.target.checked)} />
                  Crear las colecciones que no existen
                </label>
              )}
              {revision.errores.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-left text-sm">
                    <thead className="border-b border-linea text-suave">
                      <tr><th className="p-2">Fila</th><th className="p-2">Producto</th><th className="p-2">Qué hay que corregir</th></tr>
                    </thead>
                    <tbody>
                      {revision.errores.map((e) => (
                        <tr key={`${e.fila}-${e.producto}`} className="border-b border-linea/60 last:border-0">
                          <td className="p-2 font-rotulo font-bold tabular-nums">{e.fila}</td>
                          <td className="p-2">{e.producto}</td>
                          <td className="p-2 text-peligro">{e.mensaje}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <details>
                <summary className="min-h-[44px] cursor-pointer py-2 font-semibold text-acero">Ver las filas leídas ({filas.length})</summary>
                <div className="mt-2 max-h-80 overflow-auto">
                  <table className="w-full min-w-[40rem] text-left text-sm">
                    <thead className="sticky top-0 border-b border-linea bg-white text-suave">
                      <tr><th className="p-2">Fila</th><th className="p-2">Nombre</th><th className="p-2">Colección</th><th className="p-2">Ubicación</th><th className="p-2 text-right">Cantidad</th></tr>
                    </thead>
                    <tbody>
                      {filas.map((f) => (
                        <tr key={f.fila} className={`border-b border-linea/60 ${conError.has(f.fila) ? 'bg-peligro-claro' : ''}`}>
                          <td className="p-2 tabular-nums">{f.fila}</td>
                          <td className="p-2">{f.nombre}</td>
                          <td className="p-2">{f.coleccion}</td>
                          <td className="p-2 font-mono text-xs">{f.ubicacion}</td>
                          <td className="p-2 text-right tabular-nums">{f.cantidad}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <Boton type="button" ancho cargando={trabajando === 'importar'} disabled={revision.errores.length > 0} icono={<PackagePlus className="h-5 w-5" />} onClick={importar}>
                {revision.errores.length > 0 ? 'Corrige los errores para importar' : `Importar ${revision.productos} ${revision.productos === 1 ? 'producto' : 'productos'}`}
              </Boton>
            </div>
          ) : null}
        </SeccionFormulario>
      )}
    </div>
  );
}
