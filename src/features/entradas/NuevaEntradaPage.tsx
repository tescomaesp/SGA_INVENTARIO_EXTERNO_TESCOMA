import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ChevronDown, PackagePlus, RotateCcw } from 'lucide-react';
import { CampoFoto } from '@/components/CampoFoto';
import { Combobox } from '@/components/Combobox';
import { Miniatura } from '@/components/Miniatura';
import { Placa } from '@/components/Placa';
import { SeccionFormulario } from '@/components/SeccionFormulario';
import { Aviso, Boton, Campo, Entrada, Selector } from '@/components/ui';
import { useAuth } from '@/features/auth/ProveedorAuth';
import { catalogoApi } from '@/features/catalogo/api';
import { SelectorContacto } from '@/features/catalogo/SelectorContacto';
import { SelectorUbicacion, type HuecoElegido, type Sugerencia } from '@/features/ubicaciones/SelectorUbicacion';
import { formatearCantidad, leerCantidad } from '@/lib/cantidad';
import { mensajeError } from '@/lib/errores';
import { supabase } from '@/lib/supabase';
import type { Coleccion, Contacto, Producto } from '@/types/catalogo';
import { registrarEntrada, type ResultadoEntrada } from './api';

interface Confirmada {
  resultado: ResultadoEntrada;
  nombre: string;
  cantidad: number;
  hueco: string;
}

export function NuevaEntradaPage() {
  const { puede } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // 1. Producto
  const [producto, setProducto] = useState<Producto | null>(null);
  const [texto, setTexto] = useState('');
  const [esNuevo, setEsNuevo] = useState(false);
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoSubida, setFotoSubida] = useState<{ archivo: File; ruta: string } | null>(null);
  const [coleccionId, setColeccionId] = useState('');
  const [colecciones, setColecciones] = useState<Coleccion[] | null>(null);
  const [coincidencia, setCoincidencia] = useState<Producto | null>(null);

  // 2. Cantidad y ubicación
  const [cantidadTexto, setCantidadTexto] = useState('');
  const [hueco, setHueco] = useState<HuecoElegido | null>(null);
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);

  // 3. Contacto y datos opcionales
  const [contacto, setContacto] = useState<Contacto | null>(null);
  const [masDatos, setMasDatos] = useState(false);
  const [lote, setLote] = useState('');
  const [caducidad, setCaducidad] = useState('');
  const [documento, setDocumento] = useState('');
  const [notas, setNotas] = useState('');

  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [confirmada, setConfirmada] = useState<Confirmada | null>(null);

  const cantidad = leerCantidad(cantidadTexto);
  const buscar = useCallback((t: string) => catalogoApi.buscarProductos(t), []);

  useEffect(() => {
    catalogoApi.colecciones(true).then(setColecciones).catch(() => setColecciones([]));
  }, []);

  const elegirProducto = useCallback(async (p: Producto) => {
    setProducto(p);
    setEsNuevo(false);
    setTexto('');
    setCoincidencia(null);
    // Contacto habitual del producto como punto de partida
    if (p.contacto_id) catalogoApi.contacto(p.contacto_id).then((c) => c && setContacto((actual) => actual ?? c));
  }, []);

  // Datos precargados desde otras pantallas (?producto=… &hueco=…)
  useEffect(() => {
    const pid = params.get('producto');
    if (pid) catalogoApi.producto(pid).then((p) => p && elegirProducto(p));
  }, [params, elegirProducto]);

  const huecoInicial = params.get('hueco');
  useEffect(() => {
    if (!huecoInicial) return;
    (async () => {
      const { data } = await supabase.from('v_huecos').select('id, codigo_completo, capacidad, activo').eq('id', huecoInicial).maybeSingle();
      if (!data?.activo) return;
      const { data: oc } = await supabase.from('v_ocupacion_huecos').select('unidades').eq('hueco_id', huecoInicial).maybeSingle();
      setHueco({ ...(data as Omit<HuecoElegido, 'unidades'>), unidades: Number(oc?.unidades ?? 0) });
    })();
  }, [huecoInicial]);

  // Dónde está ya este producto: se ofrece como sugerencia de ubicación
  useEffect(() => {
    setSugerencias([]);
    if (!producto) return;
    catalogoApi.stock({ producto_id: producto.id }).then((filas) => {
      const porHueco = new Map<string, Sugerencia & { total: number }>();
      for (const f of filas) {
        const s = porHueco.get(f.hueco_id) ?? { hueco_id: f.hueco_id, codigo_completo: f.codigo_completo, texto: '', total: 0 };
        s.total += f.cantidad;
        porHueco.set(f.hueco_id, s);
      }
      setSugerencias([...porHueco.values()].slice(0, 6).map((s) => ({ ...s, texto: `Ya hay ${formatearCantidad(s.total)}` })));
    });
  }, [producto]);

  // Aviso si el nombre de un producto "nuevo" coincide con uno existente
  useEffect(() => {
    if (!esNuevo || texto.trim().length < 3) return setCoincidencia(null);
    const t = setTimeout(async () => {
      const r = await catalogoApi.buscarProductos(texto.trim());
      setCoincidencia(r.find((p) => p.nombre.trim().toLowerCase() === texto.trim().toLowerCase()) ?? null);
    }, 300);
    return () => clearTimeout(t);
  }, [esNuevo, texto]);

  const libre = hueco && hueco.capacidad !== null ? hueco.capacidad - hueco.unidades : null;
  const necesitaFoto = esNuevo || (producto !== null && !producto.foto_url);

  const validar = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!producto && !esNuevo) e.producto = 'Busca el producto o crea uno nuevo.';
    if (esNuevo && !texto.trim()) e.producto = 'Escribe el nombre del producto.';
    if (necesitaFoto && !foto) e.foto = 'La foto es obligatoria.';
    if (esNuevo && !coleccionId) e.coleccion = 'Elige la colección.';
    if (cantidad === null || cantidad <= 0) e.cantidad = 'Indica una cantidad mayor que cero.';
    if (!hueco) e.hueco = 'Elige dónde se guarda la mercancía.';
    else if (libre !== null && cantidad && cantidad > libre) e.hueco = 'La cantidad no cabe en este hueco.';
    if (!contacto) e.contacto = 'Indica la persona de contacto.';
    if (caducidad && !lote.trim()) e.lote = 'Para indicar la caducidad hay que indicar el lote.';
    return e;
  };

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    const e = validar();
    setErrores(e);
    setErrorGeneral(null);
    if (Object.keys(e).length) {
      document.getElementById(`campo-${Object.keys(e)[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setEnviando(true);
    try {
      let fotoUrl: string | null = null;
      if (foto && necesitaFoto) {
        // Si un intento anterior falló después de subir la foto, se reutiliza
        fotoUrl = fotoSubida?.archivo === foto ? fotoSubida.ruta : await catalogoApi.subirFoto(foto);
        setFotoSubida({ archivo: foto, ruta: fotoUrl });
      }
      const resultado = await registrarEntrada({
        huecoId: hueco!.id,
        cantidad: cantidad!,
        contactoId: contacto!.id,
        productoId: producto?.id ?? null,
        nombre: esNuevo ? texto.trim() : undefined,
        fotoUrl,
        coleccionId: esNuevo ? coleccionId : null,
        lote,
        fechaCaducidad: caducidad || null,
        documento,
        notas,
      });
      setConfirmada({ resultado, nombre: producto?.nombre ?? texto.trim(), cantidad: cantidad!, hueco: hueco!.codigo_completo });
      window.scrollTo({ top: 0 });
    } catch (err) {
      setErrorGeneral(await mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  /** Nueva entrada: conserva contacto y albarán, que suelen repetirse en la misma descarga. */
  function otraEntrada() {
    setConfirmada(null);
    setProducto(null);
    setTexto('');
    setEsNuevo(false);
    setFoto(null);
    setColeccionId('');
    setCantidadTexto('');
    setHueco(null);
    setLote('');
    setCaducidad('');
    setNotas('');
    setErrores({});
  }

  const coleccionesActivas = useMemo(() => colecciones ?? [], [colecciones]);

  if (!puede('registrar_movimientos')) {
    return <Aviso>Tu rol no permite registrar entradas.</Aviso>;
  }

  // ---------------- Confirmación ----------------
  if (confirmada) {
    const r = confirmada.resultado;
    return (
      <div className="mx-auto max-w-xl py-6 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-ok" aria-hidden />
        <h1 className="mt-3 text-4xl">Entrada registrada</h1>
        <p className="mt-3 text-lg">
          <strong>{formatearCantidad(confirmada.cantidad)}</strong> de <strong>{confirmada.nombre}</strong>
          <span className="text-suave"> ({r.sku}{r.nuevo ? ', producto nuevo' : ''})</span>
        </p>
        <p className="mt-3">Guardado en</p>
        <Placa className="mt-1 text-2xl">{confirmada.hueco}</Placa>
        {r.espacio_libre !== null && (
          <p className="mt-3 text-suave">Quedan {formatearCantidad(r.espacio_libre)} unidades libres en ese hueco.</p>
        )}
        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Boton icono={<PackagePlus className="h-4 w-4" />} onClick={otraEntrada}>Registrar otra entrada</Boton>
          <Boton variante="secundario" onClick={() => navigate(`/productos/${r.producto_id}`)}>Ver producto</Boton>
        </div>
        {contacto && <p className="mt-4 text-sm text-suave">La siguiente entrada mantendrá el contacto {contacto.nombre}{documento ? ` y el albarán ${documento}` : ''}.</p>}
      </div>
    );
  }

  // ---------------- Formulario ----------------
  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/entradas" className="mb-3 inline-flex min-h-[44px] items-center gap-2 font-semibold text-acero hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Entradas
      </Link>
      <h1 className="mb-6 text-4xl">Registrar entrada</h1>

      <form onSubmit={enviar} noValidate className="space-y-5">
        <SeccionFormulario numero={1} titulo="Producto">
          <div id="campo-producto">
            {producto ? (
              <div className="flex items-center gap-4 rounded-md border-2 border-acero bg-acero-claro/40 p-3">
                <Miniatura ruta={producto.foto_url} tamano={64} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{producto.nombre}</p>
                  <p className="text-sm text-suave">{producto.sku}, {producto.coleccion_nombre}</p>
                  <p className="text-sm">Stock actual: {formatearCantidad(producto.stock_total)}</p>
                </div>
                <Boton type="button" variante="fantasma" icono={<RotateCcw className="h-4 w-4" />} onClick={() => setProducto(null)}>Cambiar</Boton>
              </div>
            ) : esNuevo ? (
              <Campo etiqueta="Nombre del producto nuevo" htmlFor="nombre" obligatorio error={errores.producto}>
                <div className="flex gap-2">
                  <Entrada id="nombre" value={texto} maxLength={150} onChange={(e) => setTexto(e.target.value)} autoFocus />
                  <Boton type="button" variante="secundario" onClick={() => setEsNuevo(false)}>Buscar</Boton>
                </div>
              </Campo>
            ) : (
              <Campo etiqueta="Nombre o SKU" htmlFor="buscar-producto" obligatorio error={errores.producto} ayuda="Si el producto ya existe, elígelo de la lista. Si no, créalo.">
                <Combobox<Producto>
                  id="buscar-producto"
                  valor={texto}
                  onCambio={setTexto}
                  buscar={buscar}
                  clave={(p) => p.id}
                  onElegir={elegirProducto}
                  placeholder="Empieza a escribir…"
                  autoFocus
                  renderOpcion={(p) => (
                    <span className="flex items-center gap-3">
                      <Miniatura ruta={p.foto_url} tamano={40} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{p.nombre}</span>
                        <span className="block text-sm text-suave">{p.sku}, {p.coleccion_nombre}, stock {formatearCantidad(p.stock_total)}</span>
                      </span>
                    </span>
                  )}
                  extra={texto.trim().length >= 2 ? { contenido: <>Crear producto nuevo «{texto.trim()}»</>, onElegir: () => setEsNuevo(true) } : null}
                />
              </Campo>
            )}
          </div>

          {esNuevo && coincidencia && (
            <Aviso tipo="info">
              Ya existe <strong>{coincidencia.nombre}</strong> ({coincidencia.sku}, {coincidencia.coleccion_nombre}).{' '}
              <button type="button" className="font-semibold underline" onClick={() => elegirProducto(coincidencia)}>Usar ese producto</button>
            </Aviso>
          )}

          {necesitaFoto && (
            <div id="campo-foto">
              <Campo etiqueta="Foto" htmlFor="foto" obligatorio error={errores.foto} ayuda={producto ? 'Este producto aún no tiene foto.' : undefined}>
                <CampoFoto id="foto" archivo={foto} onCambio={setFoto} />
              </Campo>
            </div>
          )}

          {esNuevo && (
            <div id="campo-coleccion">
              <Campo etiqueta="Colección" htmlFor="coleccion" obligatorio error={errores.coleccion}>
                {colecciones && colecciones.length === 0 ? (
                  <Aviso tipo="info">
                    No hay colecciones creadas.{' '}
                    {puede('gestionar_ubicaciones') ? (
                      <Link to="/productos?pestana=colecciones" className="font-semibold underline">Crear colecciones</Link>
                    ) : (
                      'Pide a un administrador que las cree.'
                    )}
                  </Aviso>
                ) : (
                  <Selector id="coleccion" value={coleccionId} onChange={(e) => setColeccionId(e.target.value)}>
                    <option value="">Elegir colección</option>
                    {coleccionesActivas.map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </Selector>
                )}
              </Campo>
            </div>
          )}
        </SeccionFormulario>

        <SeccionFormulario numero={2} titulo="Cantidad y ubicación">
          <div id="campo-cantidad" className="max-w-[12rem]">
            <Campo etiqueta="Cantidad" htmlFor="cantidad" obligatorio error={errores.cantidad}>
              <Entrada id="cantidad" inputMode="decimal" value={cantidadTexto} onChange={(e) => setCantidadTexto(e.target.value)} className="font-rotulo text-2xl font-bold" />
            </Campo>
          </div>
          <div id="campo-hueco">
            <p className="mb-1.5 font-semibold">Ubicación<span className="text-peligro" aria-hidden> *</span></p>
            <SelectorUbicacion
              id="ubicacion"
              valor={hueco}
              onCambio={setHueco}
              cantidad={cantidad}
              sugerencias={sugerencias}
              tituloSugerencias="Este producto ya está en"
            />
            {errores.hueco && <p className="mt-1.5 text-sm text-peligro" role="alert">{errores.hueco}</p>}
          </div>
        </SeccionFormulario>

        <SeccionFormulario numero={3} titulo="Persona de contacto">
          <div id="campo-contacto">
            <SelectorContacto id="contacto" valor={contacto} onCambio={setContacto} />
            {errores.contacto && <p className="mt-1.5 text-sm text-peligro" role="alert">{errores.contacto}</p>}
          </div>

          <div className="border-t border-linea pt-4">
            <button type="button" onClick={() => setMasDatos((m) => !m)} aria-expanded={masDatos} className="inline-flex min-h-[44px] items-center gap-2 font-semibold text-acero">
              <ChevronDown className={`h-4 w-4 transition-transform ${masDatos ? 'rotate-180' : ''}`} aria-hidden />
              Lote, caducidad, albarán y notas
            </button>
            {masDatos && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div id="campo-lote">
                  <Campo etiqueta="Lote" htmlFor="lote" error={errores.lote}>
                    <Entrada id="lote" value={lote} maxLength={60} onChange={(e) => setLote(e.target.value)} />
                  </Campo>
                </div>
                <Campo etiqueta="Fecha de caducidad" htmlFor="caducidad">
                  <Entrada id="caducidad" type="date" value={caducidad} onChange={(e) => setCaducidad(e.target.value)} />
                </Campo>
                <Campo etiqueta="Nº de albarán o documento" htmlFor="documento">
                  <Entrada id="documento" value={documento} maxLength={60} onChange={(e) => setDocumento(e.target.value)} />
                </Campo>
                <Campo etiqueta="Notas" htmlFor="notas">
                  <Entrada id="notas" value={notas} maxLength={500} onChange={(e) => setNotas(e.target.value)} />
                </Campo>
              </div>
            )}
          </div>
        </SeccionFormulario>

        {errorGeneral && <Aviso>{errorGeneral}</Aviso>}

        <div className="sticky bottom-0 -mx-4 border-t border-linea bg-fondo/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}>
          <Boton type="submit" ancho cargando={enviando} className="min-h-[52px] text-lg">
            {cantidad && hueco ? `Registrar entrada de ${formatearCantidad(cantidad)} en ${hueco.codigo_completo}` : 'Registrar entrada'}
          </Boton>
        </div>
      </form>
    </div>
  );
}
