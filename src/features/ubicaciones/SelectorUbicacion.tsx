import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, QrCode, RotateCcw } from 'lucide-react';
import { EscanerQR } from '@/components/EscanerQR';
import { useNotificar } from '@/components/Notificaciones';
import { Placa } from '@/components/Placa';
import { Boton, Entrada, Selector } from '@/components/ui';
import { formatearCantidad } from '@/lib/cantidad';
import { normalizarCodigo, ordenarPorCodigo, PREFIJO_QR_UBICACION } from '@/lib/codigos';
import { mensajeError } from '@/lib/errores';
import { supabase } from '@/lib/supabase';

export interface HuecoElegido {
  id: string;
  codigo_completo: string;
  capacidad: number | null;
  unidades: number;
  activo: boolean;
}

export interface Sugerencia {
  hueco_id: string;
  codigo_completo: string;
  texto: string;
}

interface Opcion {
  id: string;
  codigo: string;
}
interface OpcionHueco extends Opcion {
  capacidad: number | null;
  activo: boolean;
  unidades: number;
}

interface Props {
  id: string;
  valor: HuecoElegido | null;
  onCambio: (h: HuecoElegido | null) => void;
  /** Cantidad que se va a dejar en el hueco, para avisar si no cabe. */
  cantidad?: number | null;
  sugerencias?: Sugerencia[];
  tituloSugerencias?: string;
}

async function cargarHueco(filtro: { id?: string; codigo?: string }): Promise<HuecoElegido | null> {
  let q = supabase.from('v_huecos').select('id, codigo_completo, capacidad, activo');
  q = filtro.id ? q.eq('id', filtro.id) : q.eq('codigo_completo', filtro.codigo!);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: oc } = await supabase.from('v_ocupacion_huecos').select('unidades').eq('hueco_id', data.id).maybeSingle();
  return { ...(data as Omit<HuecoElegido, 'unidades'>), unidades: Number(oc?.unidades ?? 0) };
}

async function opciones(tabla: string, campo: string, valor: string): Promise<Opcion[]> {
  const { data, error } = await supabase.from(tabla).select('id, codigo').eq(campo, valor);
  if (error) throw error;
  return ordenarPorCodigo(data as Opcion[]);
}

/**
 * Elegir un hueco de tres formas: bajando por Almacén > Pasillo > Estantería > Nivel > Hueco,
 * escaneando la etiqueta QR o escribiendo el código completo.
 */
export function SelectorUbicacion({ id, valor, onCambio, cantidad, sugerencias = [], tituloSugerencias }: Props) {
  const notificar = useNotificar();
  const [almacenes, setAlmacenes] = useState<Opcion[]>([]);
  const [pasillos, setPasillos] = useState<Opcion[]>([]);
  const [estanterias, setEstanterias] = useState<Opcion[]>([]);
  const [niveles, setNiveles] = useState<Opcion[]>([]);
  const [huecos, setHuecos] = useState<OpcionHueco[]>([]);
  const [sel, setSel] = useState({ almacen: '', pasillo: '', estanteria: '', nivel: '' });
  const [codigo, setCodigo] = useState('');
  const [escaneando, setEscaneando] = useState(false);

  const elegirPorId = useCallback(
    async (huecoId: string) => {
      try {
        onCambio(await cargarHueco({ id: huecoId }));
      } catch (e) {
        notificar(await mensajeError(e), 'error');
      }
    },
    [onCambio, notificar],
  );

  const elegirPorCodigo = useCallback(
    async (texto: string) => {
      const c = normalizarCodigo(texto.replace(PREFIJO_QR_UBICACION, ''));
      if (!c) return;
      try {
        const h = await cargarHueco({ codigo: c });
        if (!h) return notificar(`No existe ninguna ubicación con el código ${c}`, 'error');
        if (!h.activo) return notificar(`El hueco ${c} está bloqueado`, 'error');
        onCambio(h);
        setCodigo('');
      } catch (e) {
        notificar(await mensajeError(e), 'error');
      }
    },
    [onCambio, notificar],
  );

  // Cascada: cada nivel carga el siguiente y se autoselecciona si solo hay una opción
  useEffect(() => {
    supabase.from('almacenes').select('id, codigo').then(({ data }) => {
      const lista = ordenarPorCodigo((data ?? []) as Opcion[]);
      setAlmacenes(lista);
      if (lista.length === 1) setSel((s) => ({ ...s, almacen: lista[0].id }));
    });
  }, []);

  useEffect(() => {
    setPasillos([]);
    if (sel.almacen) opciones('pasillos', 'almacen_id', sel.almacen).then((l) => {
      setPasillos(l);
      if (l.length === 1) setSel((s) => ({ ...s, pasillo: l[0].id }));
    });
  }, [sel.almacen]);

  useEffect(() => {
    setEstanterias([]);
    if (sel.pasillo) opciones('estanterias', 'pasillo_id', sel.pasillo).then((l) => {
      setEstanterias(l);
      if (l.length === 1) setSel((s) => ({ ...s, estanteria: l[0].id }));
    });
  }, [sel.pasillo]);

  useEffect(() => {
    setNiveles([]);
    if (sel.estanteria) opciones('niveles', 'estanteria_id', sel.estanteria).then((l) => {
      setNiveles(l);
      if (l.length === 1) setSel((s) => ({ ...s, nivel: l[0].id }));
    });
  }, [sel.estanteria]);

  useEffect(() => {
    setHuecos([]);
    if (!sel.nivel) return;
    (async () => {
      const { data } = await supabase.from('huecos').select('id, codigo, capacidad, activo').eq('nivel_id', sel.nivel);
      const lista = ordenarPorCodigo((data ?? []) as Omit<OpcionHueco, 'unidades'>[]);
      const { data: oc } = await supabase.from('v_ocupacion_huecos').select('hueco_id, unidades').in('hueco_id', lista.map((h) => h.id));
      const unidades = new Map((oc ?? []).map((o) => [o.hueco_id as string, Number(o.unidades)]));
      setHuecos(lista.map((h) => ({ ...h, unidades: unidades.get(h.id) ?? 0 })));
    })();
  }, [sel.nivel]);

  const cambiar = (campo: keyof typeof sel, v: string) => {
    const orden: (keyof typeof sel)[] = ['almacen', 'pasillo', 'estanteria', 'nivel'];
    const siguiente = { ...sel, [campo]: v };
    for (const c of orden.slice(orden.indexOf(campo) + 1)) siguiente[c] = '';
    setSel(siguiente);
  };

  // --- Hueco ya elegido ---------------------------------------------------
  if (valor) {
    const libre = valor.capacidad !== null ? valor.capacidad - valor.unidades : null;
    const noCabe = libre !== null && !!cantidad && cantidad > libre;
    return (
      <div className={`rounded-md border-2 p-4 ${noCabe ? 'border-peligro bg-peligro-claro' : 'border-acero bg-acero-claro/40'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Placa className="text-xl">{valor.codigo_completo}</Placa>
          <Boton type="button" variante="fantasma" icono={<RotateCcw className="h-4 w-4" />} onClick={() => onCambio(null)}>
            Cambiar
          </Boton>
        </div>
        <p className="mt-2 text-sm">
          {valor.capacidad !== null ? (
            <>
              Ocupado {formatearCantidad(valor.unidades)} de {formatearCantidad(valor.capacidad)}.{' '}
              <strong>Caben {formatearCantidad(Math.max(libre ?? 0, 0))} más.</strong>
            </>
          ) : (
            <>Contiene {formatearCantidad(valor.unidades)} unidades. Sin capacidad máxima definida.</>
          )}
        </p>
        {noCabe && (
          <p className="mt-2 flex items-center gap-2 font-semibold text-peligro" role="alert">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            La cantidad no cabe en este hueco. Elige otro o reparte la mercancía en varias entradas.
          </p>
        )}
      </div>
    );
  }

  // --- Elegir hueco ---------------------------------------------------------
  const niveles5 = [
    { campo: 'almacen' as const, etiqueta: 'Almacén', lista: almacenes, visible: almacenes.length > 1 },
    { campo: 'pasillo' as const, etiqueta: 'Pasillo', lista: pasillos, visible: true },
    { campo: 'estanteria' as const, etiqueta: 'Estantería', lista: estanterias, visible: true },
    { campo: 'nivel' as const, etiqueta: 'Nivel', lista: niveles, visible: true },
  ];

  return (
    <div className="space-y-4">
      {sugerencias.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-suave">{tituloSugerencias ?? 'Sugerencias'}</p>
          <div className="flex flex-wrap gap-2">
            {sugerencias.map((s) => (
              <button
                key={s.hueco_id}
                type="button"
                onClick={() => elegirPorId(s.hueco_id)}
                className="rounded border border-linea bg-white px-3 py-2 text-left hover:border-acero"
              >
                <span className="block font-rotulo font-bold">{s.codigo_completo}</span>
                <span className="block text-sm text-suave">{s.texto}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Boton type="button" variante="secundario" icono={<QrCode className="h-4 w-4" />} onClick={() => setEscaneando(true)}>
          Escanear etiqueta
        </Boton>
        <div className="flex min-w-[14rem] flex-1 gap-2">
          <Entrada
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="o escribe el código completo"
            aria-label="Código completo del hueco"
            className="uppercase placeholder:normal-case"
            onKeyDown={(e) => {
              // Evita enviar el formulario principal al pulsar Intro aquí
              if (e.key === 'Enter') {
                e.preventDefault();
                elegirPorCodigo(codigo);
              }
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {niveles5.filter((n) => n.visible).map((n) => (
          <div key={n.campo}>
            <label htmlFor={`${id}-${n.campo}`} className="mb-1 block text-sm font-semibold">{n.etiqueta}</label>
            <Selector id={`${id}-${n.campo}`} value={sel[n.campo]} onChange={(e) => cambiar(n.campo, e.target.value)} disabled={!n.lista.length}>
              <option value="">{n.lista.length ? 'Elegir' : '—'}</option>
              {n.lista.map((o) => (
                <option key={o.id} value={o.id}>{o.codigo}</option>
              ))}
            </Selector>
          </div>
        ))}
      </div>

      {huecos.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Hueco</legend>
          <div className="flex flex-wrap gap-2">
            {huecos.map((h) => {
              const lleno = h.capacidad !== null && h.unidades >= h.capacidad;
              const estado = !h.activo ? 'Bloqueado' : h.capacidad !== null ? `${formatearCantidad(h.unidades)}/${formatearCantidad(h.capacidad)}` : h.unidades > 0 ? formatearCantidad(h.unidades) : 'Vacío';
              return (
                <button
                  key={h.id}
                  type="button"
                  disabled={!h.activo}
                  onClick={() => elegirPorId(h.id)}
                  className={`min-h-[52px] min-w-[4.5rem] rounded-[3px] border-2 px-2 py-1 text-center ${
                    !h.activo ? 'celda-bloqueada cursor-not-allowed text-suave' : lleno ? 'border-acero bg-acero text-white' : 'border-linea bg-white hover:border-acero'
                  }`}
                  aria-label={`Hueco ${h.codigo}, ${estado}`}
                >
                  <span className="block font-rotulo text-lg font-bold leading-none">{h.codigo}</span>
                  <span className="block text-xs">{estado}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <EscanerQR
        abierto={escaneando}
        titulo="Escanear ubicación"
        instrucciones="Apunta a la etiqueta QR del hueco."
        onCerrar={() => setEscaneando(false)}
        onLeer={(t) => {
          setEscaneando(false);
          if (!t.startsWith(PREFIJO_QR_UBICACION)) return notificar('Ese QR no es de una ubicación del almacén', 'error');
          elegirPorCodigo(t);
        }}
      />
    </div>
  );
}
