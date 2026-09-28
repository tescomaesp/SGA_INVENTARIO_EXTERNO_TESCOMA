import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, PackageMinus } from 'lucide-react';
import { Placa } from '@/components/Placa';
import { SeccionFormulario } from '@/components/SeccionFormulario';
import { Aviso, Boton, Campo, Entrada, Selector } from '@/components/ui';
import { formatearCantidad, leerCantidad } from '@/lib/cantidad';
import { mensajeError } from '@/lib/errores';
import { MOTIVOS_SALIDA, type MotivoSalida } from '@/lib/motivos';
import type { FilaStock } from '@/types/catalogo';
import { movimientosApi } from './api';
import { CampoCantidad } from './CampoCantidad';
import { Confirmacion } from './Confirmacion';
import { SelectorOrigen } from './SelectorOrigen';

export function NuevaSalidaPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [origen, setOrigen] = useState<FilaStock | null>(null);
  const [cantidadTexto, setCantidadTexto] = useState('');
  const [motivo, setMotivo] = useState<MotivoSalida | ''>('');
  const [destino, setDestino] = useState('');
  const [documento, setDocumento] = useState('');
  const [notas, setNotas] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [hecha, setHecha] = useState<{ fila: FilaStock; cantidad: number; restante: number } | null>(null);
  const [clave, setClave] = useState(0); // reinicia el selector de origen al registrar otra

  const cantidad = leerCantidad(cantidadTexto);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!origen) err.origen = 'Elige qué mercancía sale y de dónde.';
    if (cantidad === null || cantidad <= 0) err.cantidad = 'Indica una cantidad mayor que cero.';
    else if (origen && cantidad > origen.cantidad) err.cantidad = `Solo hay ${formatearCantidad(origen.cantidad)} disponibles.`;
    if (!motivo) err.motivo = 'Elige el motivo.';
    if (motivo === 'otro' && !notas.trim()) err.notas = 'Explica qué ha pasado.';
    setErrores(err);
    setErrorGeneral(null);
    if (Object.keys(err).length) return;

    setEnviando(true);
    try {
      const r = await movimientosApi.salida({
        productoId: origen!.producto_id,
        huecoId: origen!.hueco_id,
        loteId: origen!.lote_id,
        cantidad: cantidad!,
        motivo: motivo as MotivoSalida,
        destino,
        documento,
        notas,
      });
      setHecha({ fila: origen!, cantidad: cantidad!, restante: Number(r.restante) });
      window.scrollTo({ top: 0 });
    } catch (error) {
      setErrorGeneral(await mensajeError(error));
    } finally {
      setEnviando(false);
    }
  }

  if (hecha) {
    return (
      <Confirmacion
        titulo="Salida registrada"
        acciones={
          <>
            <Boton
              icono={<PackageMinus className="h-4 w-4" />}
              onClick={() => {
                // Se mantienen motivo, destino y documento: suelen repetirse en un mismo pedido
                setHecha(null);
                setOrigen(null);
                setCantidadTexto('');
                setNotas('');
                setClave((c) => c + 1);
              }}
            >
              Registrar otra salida
            </Boton>
            <Boton variante="secundario" onClick={() => navigate(`/productos/${hecha.fila.producto_id}`)}>Ver producto</Boton>
          </>
        }
      >
        <p>
          <strong>{formatearCantidad(hecha.cantidad)}</strong> de <strong>{hecha.fila.producto_nombre}</strong> desde
        </p>
        <Placa className="text-2xl">{hecha.fila.codigo_completo}</Placa>
        <p className="text-suave">
          {hecha.restante > 0 ? `Quedan ${formatearCantidad(hecha.restante)} en esa ubicación.` : 'La ubicación ha quedado vacía para este producto.'}
        </p>
      </Confirmacion>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/salidas" className="mb-3 inline-flex min-h-[44px] items-center gap-2 font-semibold text-acero hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Salidas
      </Link>
      <h1 className="mb-6 text-4xl">Registrar salida</h1>

      <form onSubmit={enviar} noValidate className="space-y-5">
        <SeccionFormulario numero={1} titulo="Qué sale y de dónde">
          <SelectorOrigen key={clave} valor={origen} onCambio={setOrigen} productoInicial={clave === 0 ? params.get('producto') : null} huecoInicial={clave === 0 ? params.get('hueco') : null} />
          {errores.origen && <p className="text-sm text-peligro" role="alert">{errores.origen}</p>}
        </SeccionFormulario>

        <SeccionFormulario numero={2} titulo="Cantidad y motivo">
          <CampoCantidad id="cantidad" valor={cantidadTexto} onCambio={setCantidadTexto} maximo={origen?.cantidad} error={errores.cantidad} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Motivo" htmlFor="motivo" obligatorio error={errores.motivo}>
              <Selector id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoSalida)}>
                <option value="">Elegir motivo</option>
                {(Object.keys(MOTIVOS_SALIDA) as MotivoSalida[]).map((m) => (
                  <option key={m} value={m}>{MOTIVOS_SALIDA[m]}</option>
                ))}
              </Selector>
            </Campo>
            <Campo etiqueta="Destino" htmlFor="destino" ayuda="Cliente, tienda, proveedor…">
              <Entrada id="destino" value={destino} maxLength={200} onChange={(e) => setDestino(e.target.value)} />
            </Campo>
            <Campo etiqueta="Nº de pedido o albarán" htmlFor="documento">
              <Entrada id="documento" value={documento} maxLength={60} onChange={(e) => setDocumento(e.target.value)} />
            </Campo>
            <Campo etiqueta="Notas" htmlFor="notas" obligatorio={motivo === 'otro'} error={errores.notas}>
              <Entrada id="notas" value={notas} maxLength={500} onChange={(e) => setNotas(e.target.value)} />
            </Campo>
          </div>
        </SeccionFormulario>

        {errorGeneral && <Aviso>{errorGeneral}</Aviso>}

        <div className="sticky bottom-0 -mx-4 border-t border-linea bg-fondo/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}>
          <Boton type="submit" ancho cargando={enviando} className="min-h-[52px] text-lg">
            {origen && cantidad ? `Registrar salida de ${formatearCantidad(cantidad)} desde ${origen.codigo_completo}` : 'Registrar salida'}
          </Boton>
        </div>
      </form>
    </div>
  );
}
