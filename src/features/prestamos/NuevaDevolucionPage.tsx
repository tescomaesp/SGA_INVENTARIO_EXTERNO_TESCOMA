import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, QrCode, Search, Undo2 } from 'lucide-react';
import { EscanerQR } from '@/components/EscanerQR';
import { Miniatura } from '@/components/Miniatura';
import { useNotificar } from '@/components/Notificaciones';
import { SeccionFormulario } from '@/components/SeccionFormulario';
import { Aviso, Boton, CabeceraPagina, Campo, Cargando, Entrada } from '@/components/ui';
import { SelectorContacto } from '@/features/catalogo/SelectorContacto';
import { CampoCantidad } from '@/features/movimientos/CampoCantidad';
import { SelectorUbicacion, type HuecoElegido, type Sugerencia } from '@/features/ubicaciones/SelectorUbicacion';
import { formatearCantidad, leerCantidad } from '@/lib/cantidad';
import { interpretarCodigo } from '@/lib/codigos';
import { mensajeError } from '@/lib/errores';
import { formatearFecha } from '@/lib/formato';
import { supabase } from '@/lib/supabase';
import type { Contacto } from '@/types/catalogo';
import { diasFuera, nombreEvento, prestamosApi, type Pendiente } from './api';

const clave = (p: Pick<Pendiente, 'producto_id' | 'clave_evento'>) => `${p.producto_id}|${p.clave_evento}`;

export function NuevaDevolucionPage() {
  const notificar = useNotificar();
  const [params] = useSearchParams();
  const [pendientes, setPendientes] = useState<Pendiente[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [escaneando, setEscaneando] = useState(false);

  const [elegido, setElegido] = useState<Pendiente | null>(null);
  const [cantidadTexto, setCantidadTexto] = useState('');
  const [hueco, setHueco] = useState<HuecoElegido | null>(null);
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [contacto, setContacto] = useState<Contacto | null>(null);
  const [notas, setNotas] = useState('');
  const [lote, setLote] = useState('');

  const [intentado, setIntentado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ nombre: string; evento: string; cantidad: number; pendiente: number; hueco: string } | null>(null);

  async function cargar() {
    try {
      const lista = await prestamosApi.pendientes();
      setPendientes(lista);
      return lista;
    } catch (e) {
      setErrorCarga(await mensajeError(e));
      return [];
    }
  }

  useEffect(() => {
    cargar().then((lista) => {
      const p = params.get('producto');
      const ev = params.get('evento');
      if (p) {
        const encontrado = lista.find((x) => x.producto_id === p && (ev === null || x.clave_evento === ev.toLowerCase()));
        if (encontrado) elegir(encontrado);
        else if (lista.some((x) => x.producto_id === p)) setBusqueda(lista.find((x) => x.producto_id === p)!.sku);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function elegir(p: Pendiente) {
    setElegido(p);
    setCantidadTexto(String(p.pendiente).replace('.', ','));
    setHueco(null);
    setSugerencias([]);
    if (p.hueco_ultima_salida) {
      supabase
        .from('v_huecos')
        .select('id, codigo_completo')
        .eq('id', p.hueco_ultima_salida)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setSugerencias([{ hueco_id: data.id, codigo_completo: data.codigo_completo, texto: 'De aquí salió' }]);
        });
    }
  }

  const filtrados = useMemo(() => {
    if (!pendientes) return [];
    const t = busqueda.trim().toLowerCase();
    if (!t) return pendientes;
    return pendientes.filter((p) => `${p.sku} ${p.nombre} ${nombreEvento(p.evento)}`.toLowerCase().includes(t));
  }, [pendientes, busqueda]);

  const cantidad = leerCantidad(cantidadTexto);
  const validar = () => {
    const e: Record<string, string> = {};
    if (!elegido) e.elegido = 'Elige qué se devuelve.';
    if (cantidad === null || cantidad <= 0) e.cantidad = 'Indica cuántas unidades vuelven.';
    else if (elegido && cantidad > elegido.pendiente) e.cantidad = `De este evento solo quedan ${formatearCantidad(elegido.pendiente)} pendientes.`;
    if (!hueco) e.hueco = 'Elige dónde se guarda.';
    return e;
  };
  const errores = intentado ? validar() : {};

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    setIntentado(true);
    const err = validar();
    if (Object.keys(err).length) {
      document.getElementById(err.elegido ? 'que-vuelve' : err.cantidad ? 'cantidad' : 'hueco')?.focus();
      return;
    }
    setEnviando(true);
    setErrorGeneral(null);
    try {
      const r = await prestamosApi.registrarDevolucion({
        producto_id: elegido!.producto_id,
        evento: elegido!.evento,
        cantidad: cantidad!,
        hueco_id: hueco!.id,
        contacto_id: contacto?.id,
        notas,
        lote,
      });
      setHecho({ nombre: elegido!.nombre, evento: nombreEvento(elegido!.evento), cantidad: cantidad!, pendiente: Number(r.pendiente), hueco: hueco!.codigo_completo });
      notificar('Devolución registrada');
    } catch (e) {
      setErrorGeneral(await mensajeError(e));
    } finally {
      setEnviando(false);
    }
  }

  function otra() {
    setHecho(null);
    setElegido(null);
    setCantidadTexto('');
    setHueco(null);
    setNotas('');
    setLote('');
    setIntentado(false);
    setPendientes(null);
    cargar();
  }

  if (hecho) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="rounded-md border border-ok/40 bg-white p-6 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-ok" aria-hidden />
          <h1 className="mt-3 text-2xl">Devolución registrada</h1>
          <p className="mt-2">
            {formatearCantidad(hecho.cantidad)} uds de <strong>{hecho.nombre}</strong> vuelven de «{hecho.evento}» a {hecho.hueco}.
          </p>
          <p className={`mt-2 font-semibold ${hecho.pendiente > 0 ? 'text-peligro' : 'text-ok'}`}>
            {hecho.pendiente > 0 ? `Quedan ${formatearCantidad(hecho.pendiente)} pendientes de ese evento.` : 'Ese evento ya no tiene nada pendiente de este producto.'}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Boton onClick={otra} icono={<Undo2 className="h-4 w-4" />}>Registrar otra devolución</Boton>
            <Link to="/prestamos" className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-linea px-4 font-semibold hover:bg-fondo">Ver préstamos</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Link to="/prestamos" className="mb-3 inline-flex min-h-[44px] items-center gap-2 font-semibold text-acero hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Préstamos
      </Link>
      <CabeceraPagina titulo="Registrar devolución" descripcion="Mercancía que vuelve de un evento. Solo se puede devolver lo que está pendiente." />

      <form onSubmit={enviar} noValidate className="space-y-5 pb-4">
        <SeccionFormulario numero={1} titulo="Qué vuelve">
          {elegido ? (
            <div className="flex items-center gap-4 rounded-md border-2 border-acero bg-acero-claro/40 p-3">
              <Miniatura ruta={elegido.foto_url} tamano={56} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{elegido.nombre} <span className="font-normal text-suave">{elegido.sku}</span></p>
                <p>Evento: <strong>{nombreEvento(elegido.evento)}</strong></p>
                <p className="text-sm text-suave">Pendientes: {formatearCantidad(elegido.pendiente)} de {formatearCantidad(elegido.salido)} · fuera desde el {formatearFecha(elegido.primera_salida)}</p>
              </div>
              <Boton type="button" variante="secundario" onClick={() => setElegido(null)}>Cambiar</Boton>
            </div>
          ) : errorCarga ? (
            <Aviso>{errorCarga}</Aviso>
          ) : !pendientes ? (
            <Cargando />
          ) : pendientes.length === 0 ? (
            <Aviso tipo="ok">No hay nada pendiente de devolver: todo lo que salió ha vuelto.</Aviso>
          ) : (
            <div id="que-vuelve" tabIndex={-1}>
              <div className="mb-3 flex gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" aria-hidden />
                  <Entrada type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto, SKU o evento" className="pl-9" aria-label="Buscar en lo pendiente" />
                </div>
                <Boton type="button" variante="secundario" icono={<QrCode className="h-4 w-4" />} onClick={() => setEscaneando(true)}>Escanear</Boton>
              </div>
              <ul className="max-h-[26rem] divide-y divide-linea/70 overflow-auto rounded-md border border-linea">
                {filtrados.length === 0 && <li className="px-4 py-6 text-center text-suave">Nada pendiente coincide con la búsqueda.</li>}
                {filtrados.map((p) => (
                  <li key={clave(p)}>
                    <button type="button" onClick={() => elegir(p)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-fondo/60">
                      <Miniatura ruta={p.foto_url} tamano={44} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{p.nombre} <span className="font-normal text-suave">{p.sku}</span></span>
                        <span className="block truncate text-sm text-suave">{nombreEvento(p.evento)} · fuera hace {diasFuera(p.primera_salida)} días</span>
                      </span>
                      <span className="font-rotulo text-xl font-bold tabular-nums text-peligro">{formatearCantidad(p.pendiente)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {errores.elegido && <p className="mt-2 text-sm text-peligro" role="alert">{errores.elegido}</p>}
        </SeccionFormulario>

        {elegido && (
          <>
            <SeccionFormulario numero={2} titulo="Cuántas unidades vuelven">
              <CampoCantidad
                id="cantidad"
                valor={cantidadTexto}
                onCambio={setCantidadTexto}
                maximo={elegido.pendiente}
                error={errores.cantidad}
                textoExceso={(n) => `De este evento solo quedan ${formatearCantidad(n)} pendientes.`}
              />
            </SeccionFormulario>

            <SeccionFormulario numero={3} titulo="Dónde se guarda">
              <div id="hueco" tabIndex={-1}>
                <SelectorUbicacion id="hueco-devolucion" valor={hueco} onCambio={setHueco} cantidad={cantidad} sugerencias={sugerencias} tituloSugerencias="Sugerencia" />
              </div>
              {errores.hueco && <p className="mt-2 text-sm text-peligro" role="alert">{errores.hueco}</p>}
            </SeccionFormulario>

            <SeccionFormulario numero={4} titulo="Quién lo devuelve (opcional)">
              <SelectorContacto id="contacto-devolucion" valor={contacto} onCambio={setContacto} />
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="Notas" htmlFor="notas" ayuda="Por ejemplo, si falta algo o vuelve dañado.">
                  <Entrada id="notas" value={notas} maxLength={500} onChange={(e) => setNotas(e.target.value)} />
                </Campo>
                <Campo etiqueta="Lote" htmlFor="lote" ayuda="Solo si el producto se controla por lotes.">
                  <Entrada id="lote" value={lote} maxLength={60} onChange={(e) => setLote(e.target.value)} />
                </Campo>
              </div>
            </SeccionFormulario>

            {errorGeneral && <Aviso>{errorGeneral}</Aviso>}
            <div className="sticky bottom-0 -mx-4 border-t border-linea bg-fondo/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
              <Boton type="submit" ancho cargando={enviando} icono={<Undo2 className="h-5 w-5" />}>
                Registrar devolución{cantidad ? ` de ${formatearCantidad(cantidad)}` : ''}
              </Boton>
            </div>
          </>
        )}
      </form>

      <EscanerQR
        abierto={escaneando}
        titulo="Escanear producto"
        instrucciones="Apunta a la etiqueta del producto que vuelve."
        onCerrar={() => setEscaneando(false)}
        onLeer={(t) => {
          setEscaneando(false);
          const l = interpretarCodigo(t);
          if (l.tipo !== 'producto') return notificar('Ese código no es la etiqueta de un producto', 'error');
          const deEse = (pendientes ?? []).filter((p) => p.sku === l.sku);
          if (deEse.length === 0) return notificar(`${l.sku} no tiene nada pendiente de devolver`, 'error');
          if (deEse.length === 1) elegir(deEse[0]);
          else setBusqueda(l.sku);
        }}
      />
    </>
  );
}
