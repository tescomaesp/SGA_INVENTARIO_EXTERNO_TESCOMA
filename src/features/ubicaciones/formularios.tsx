import { useState, type FormEvent, type ReactNode } from 'react';
import { Aviso, Boton, Campo, Entrada } from '@/components/ui';
import { CODIGO_VALIDO, normalizarCodigo } from '@/lib/codigos';
import { mensajeError } from '@/lib/errores';
import type { Almacen, Hueco } from '@/types/ubicaciones';

/* ------------------------------------------------------------------ */
/* Base común: envío, errores y botones                                */
/* ------------------------------------------------------------------ */
function Formulario({ children, textoGuardar, onGuardar, onCancelar, validar }: {
  children: ReactNode;
  textoGuardar: string;
  onGuardar: () => Promise<void>;
  onCancelar: () => void;
  validar?: () => string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const fallo = validar?.() ?? null;
    if (fallo) return setError(fallo);
    setError(null);
    setEnviando(true);
    try {
      await onGuardar();
    } catch (err) {
      setError(await mensajeError(err));
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-5" noValidate>
      {children}
      {error && <Aviso>{error}</Aviso>}
      <div className="flex flex-col-reverse gap-2 border-t border-linea pt-5 sm:flex-row sm:justify-end">
        <Boton type="button" variante="secundario" onClick={onCancelar}>Cancelar</Boton>
        <Boton type="submit" cargando={enviando}>{textoGuardar}</Boton>
      </div>
    </form>
  );
}

const entero = (v: string) => (v.trim() === '' ? null : Number.parseInt(v, 10));

function validarCodigo(codigo: string) {
  if (!codigo) return 'El código es obligatorio.';
  if (!CODIGO_VALIDO.test(codigo)) return 'El código solo admite letras y números, sin espacios ni guiones (máximo 12).';
  return null;
}

function validarNumero(v: string, nombre: string, min: number, max: number, opcional = false) {
  const n = entero(v);
  if (n === null) return opcional ? null : `Indica el número de ${nombre}.`;
  if (!Number.isInteger(n) || n < min || n > max) return `El número de ${nombre} debe estar entre ${min} y ${max}.`;
  return null;
}

function CampoCodigo({ id, valor, onCambio, ayuda }: { id: string; valor: string; onCambio: (v: string) => void; ayuda: string }) {
  return (
    <Campo etiqueta="Código" htmlFor={id} obligatorio ayuda={ayuda}>
      <Entrada id={id} value={valor} maxLength={12} autoCapitalize="characters" autoComplete="off" onChange={(e) => onCambio(normalizarCodigo(e.target.value))} className="font-rotulo text-lg font-bold tracking-wide" />
    </Campo>
  );
}

function CampoNumero({ id, etiqueta, valor, onCambio, ayuda, obligatorio }: { id: string; etiqueta: string; valor: string; onCambio: (v: string) => void; ayuda?: string; obligatorio?: boolean }) {
  return (
    <Campo etiqueta={etiqueta} htmlFor={id} ayuda={ayuda} obligatorio={obligatorio}>
      <Entrada id={id} type="number" inputMode="numeric" min={0} value={valor} onChange={(e) => onCambio(e.target.value.replace(/\D/g, ''))} />
    </Campo>
  );
}

/* ------------------------------------------------------------------ */
/* Almacén                                                             */
/* ------------------------------------------------------------------ */
export function FormAlmacen({ inicial, sugerido, onGuardar, onCancelar }: {
  inicial?: Almacen;
  sugerido?: string;
  onGuardar: (v: { codigo: string; nombre: string; direccion: string | null }) => Promise<void>;
  onCancelar: () => void;
}) {
  const [codigo, setCodigo] = useState(inicial?.codigo ?? sugerido ?? 'ALM1');
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [direccion, setDireccion] = useState(inicial?.direccion ?? '');
  return (
    <Formulario
      textoGuardar={inicial ? 'Guardar cambios' : 'Crear almacén'}
      onCancelar={onCancelar}
      validar={() => validarCodigo(codigo) ?? (nombre.trim() ? null : 'El nombre es obligatorio.')}
      onGuardar={() => onGuardar({ codigo, nombre: nombre.trim(), direccion: direccion.trim() || null })}
    >
      <CampoCodigo id="a-codigo" valor={codigo} onCambio={setCodigo} ayuda="Encabeza el código de todas sus ubicaciones, p. ej. ALM1-P01-E01-N1-H01." />
      <Campo etiqueta="Nombre" htmlFor="a-nombre" obligatorio>
        <Entrada id="a-nombre" value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Almacén central" />
      </Campo>
      <Campo etiqueta="Dirección" htmlFor="a-direccion">
        <Entrada id="a-direccion" value={direccion} maxLength={200} onChange={(e) => setDireccion(e.target.value)} />
      </Campo>
    </Formulario>
  );
}

/* ------------------------------------------------------------------ */
/* Generador de pasillo o estantería                                   */
/* ------------------------------------------------------------------ */
export interface ValoresGenerador {
  codigo: string;
  descripcion: string;
  estanterias: number;
  niveles: number;
  huecos: number;
  capacidad: number | null;
}

export function FormGenerador({ tipo, sugerido, onGuardar, onCancelar }: {
  tipo: 'pasillo' | 'estanteria';
  sugerido: string;
  onGuardar: (v: ValoresGenerador) => Promise<void>;
  onCancelar: () => void;
}) {
  const esPasillo = tipo === 'pasillo';
  const [codigo, setCodigo] = useState(sugerido);
  const [descripcion, setDescripcion] = useState('');
  const [estanterias, setEstanterias] = useState(esPasillo ? '4' : '1');
  const [niveles, setNiveles] = useState('4');
  const [huecos, setHuecos] = useState('3');
  const [capacidad, setCapacidad] = useState('');

  const nE = esPasillo ? entero(estanterias) ?? 0 : 1;
  const nN = entero(niveles) ?? 0;
  const nH = entero(huecos) ?? 0;
  const total = nE * nN * nH;

  const resumen = esPasillo
    ? nE === 0
      ? 'Se creará el pasillo vacío. Podrás añadir estanterías después.'
      : `Se crearán ${nE} estanterías (E01 a E${String(nE).padStart(2, '0')}) de ${nN} niveles con ${nH} huecos cada uno: ${total.toLocaleString('es-ES')} huecos en total.`
    : `Se creará una estantería de ${nN} niveles con ${nH} huecos cada uno: ${total.toLocaleString('es-ES')} huecos.`;

  const generaEstructura = !esPasillo || nE > 0;

  return (
    <Formulario
      textoGuardar={esPasillo ? 'Crear pasillo' : 'Crear estantería'}
      onCancelar={onCancelar}
      validar={() =>
        validarCodigo(codigo) ??
        (esPasillo ? validarNumero(estanterias, 'estanterías', 0, 100) : null) ??
        (generaEstructura ? validarNumero(niveles, 'niveles', 1, 20) ?? validarNumero(huecos, 'huecos por nivel', 1, 50) : null) ??
        validarNumero(capacidad, 'unidades de capacidad', 1, 1_000_000, true)
      }
      onGuardar={() =>
        onGuardar({ codigo, descripcion: descripcion.trim(), estanterias: nE, niveles: nN || 1, huecos: nH || 1, capacidad: entero(capacidad) })
      }
    >
      <div className="grid gap-5 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <CampoCodigo id="g-codigo" valor={codigo} onCambio={setCodigo} ayuda={esPasillo ? 'Ej.: P01' : 'Ej.: E01'} />
        <Campo etiqueta="Descripción" htmlFor="g-desc">
          <Entrada id="g-desc" value={descripcion} maxLength={120} onChange={(e) => setDescripcion(e.target.value)} placeholder={esPasillo ? 'Ej.: Zona de textil' : 'Ej.: Estantería de carga pesada'} />
        </Campo>
      </div>

      <fieldset className="rounded-md border border-linea p-4">
        <legend className="px-1 font-semibold">{esPasillo ? 'Estanterías del pasillo' : 'División de la estantería'}</legend>
        <div className={`grid gap-4 ${esPasillo ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
          {esPasillo && <CampoNumero id="g-est" etiqueta="Estanterías" valor={estanterias} onCambio={setEstanterias} ayuda="0 para dejarlo vacío" />}
          <CampoNumero id="g-niv" etiqueta="Niveles" valor={niveles} onCambio={setNiveles} ayuda="Baldas en altura" />
          <CampoNumero id="g-hue" etiqueta="Huecos por nivel" valor={huecos} onCambio={setHuecos} ayuda="Posiciones por balda" />
        </div>
        {generaEstructura && (
          <div className="mt-4">
            <CampoNumero id="g-cap" etiqueta="Capacidad por hueco (unidades)" valor={capacidad} onCambio={setCapacidad} ayuda="Opcional. Sirve para saber cuándo un hueco está lleno." />
          </div>
        )}
        <p className="mt-4 rounded bg-fondo px-3 py-2 text-sm" aria-live="polite">{resumen}</p>
      </fieldset>
    </Formulario>
  );
}

/* ------------------------------------------------------------------ */
/* Nivel nuevo                                                         */
/* ------------------------------------------------------------------ */
export function FormNivel({ codigoNuevo, onGuardar, onCancelar }: {
  codigoNuevo: string;
  onGuardar: (v: { huecos: number; capacidad: number | null }) => Promise<void>;
  onCancelar: () => void;
}) {
  const [huecos, setHuecos] = useState('3');
  const [capacidad, setCapacidad] = useState('');
  return (
    <Formulario
      textoGuardar="Añadir nivel"
      onCancelar={onCancelar}
      validar={() => validarNumero(huecos, 'huecos', 1, 50) ?? validarNumero(capacidad, 'unidades de capacidad', 1, 1_000_000, true)}
      onGuardar={() => onGuardar({ huecos: entero(huecos)!, capacidad: entero(capacidad) })}
    >
      <p>
        El nuevo nivel <strong>{codigoNuevo}</strong> se añadirá encima de los actuales.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoNumero id="n-hue" etiqueta="Huecos" valor={huecos} onCambio={setHuecos} obligatorio />
        <CampoNumero id="n-cap" etiqueta="Capacidad por hueco" valor={capacidad} onCambio={setCapacidad} ayuda="Opcional" />
      </div>
    </Formulario>
  );
}

/* ------------------------------------------------------------------ */
/* Editar código y descripción (pasillo o estantería)                  */
/* ------------------------------------------------------------------ */
export function FormCodigo({ inicial, onGuardar, onCancelar }: {
  inicial: { codigo: string; descripcion: string | null };
  onGuardar: (v: { codigo: string; descripcion: string | null }) => Promise<void>;
  onCancelar: () => void;
}) {
  const [codigo, setCodigo] = useState(inicial.codigo);
  const [descripcion, setDescripcion] = useState(inicial.descripcion ?? '');
  return (
    <Formulario
      textoGuardar="Guardar cambios"
      onCancelar={onCancelar}
      validar={() => validarCodigo(codigo)}
      onGuardar={() => onGuardar({ codigo, descripcion: descripcion.trim() || null })}
    >
      <CampoCodigo id="c-codigo" valor={codigo} onCambio={setCodigo} ayuda="Si cambias el código, tendrás que reimprimir las etiquetas QR." />
      <Campo etiqueta="Descripción" htmlFor="c-desc">
        <Entrada id="c-desc" value={descripcion} maxLength={120} onChange={(e) => setDescripcion(e.target.value)} />
      </Campo>
    </Formulario>
  );
}

/* ------------------------------------------------------------------ */
/* Editar hueco                                                        */
/* ------------------------------------------------------------------ */
export function FormHueco({ hueco, onGuardar, onCancelar }: {
  hueco: Hueco;
  onGuardar: (v: { capacidad: number | null; notas: string | null; activo: boolean }) => Promise<void>;
  onCancelar: () => void;
}) {
  const [capacidad, setCapacidad] = useState(hueco.capacidad?.toString() ?? '');
  const [notas, setNotas] = useState(hueco.notas ?? '');
  const [activo, setActivo] = useState(hueco.activo);
  return (
    <Formulario
      textoGuardar="Guardar cambios"
      onCancelar={onCancelar}
      validar={() => validarNumero(capacidad, 'unidades de capacidad', 1, 1_000_000, true)}
      onGuardar={() => onGuardar({ capacidad: entero(capacidad), notas: notas.trim() || null, activo })}
    >
      <CampoNumero id="h-cap" etiqueta="Capacidad (unidades)" valor={capacidad} onCambio={setCapacidad} ayuda="Déjalo vacío si no quieres controlar la capacidad." />
      <Campo etiqueta="Notas" htmlFor="h-notas">
        <Entrada id="h-notas" value={notas} maxLength={200} onChange={(e) => setNotas(e.target.value)} placeholder="Ej.: Solo cajas pequeñas" />
      </Campo>
      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-linea p-3">
        <input type="checkbox" checked={!activo} onChange={(e) => setActivo(!e.target.checked)} className="mt-1 h-5 w-5 accent-acero" />
        <span>
          <span className="block font-semibold">Bloquear hueco</span>
          <span className="text-sm text-suave">No se podrá ubicar mercancía nueva aquí (por avería, reserva o mantenimiento).</span>
        </span>
      </label>
    </Formulario>
  );
}
