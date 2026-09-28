import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowLeftRight } from 'lucide-react';
import { Placa } from '@/components/Placa';
import { SeccionFormulario } from '@/components/SeccionFormulario';
import { Aviso, Boton, Campo, Entrada } from '@/components/ui';
import { SelectorUbicacion, type HuecoElegido } from '@/features/ubicaciones/SelectorUbicacion';
import { formatearCantidad, leerCantidad } from '@/lib/cantidad';
import { mensajeError } from '@/lib/errores';
import type { FilaStock } from '@/types/catalogo';
import { movimientosApi } from './api';
import { CampoCantidad } from './CampoCantidad';
import { Confirmacion } from './Confirmacion';
import { SelectorOrigen } from './SelectorOrigen';

export function NuevoTrasladoPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [origen, setOrigen] = useState<FilaStock | null>(null);
  const [destino, setDestino] = useState<HuecoElegido | null>(null);
  const [cantidadTexto, setCantidadTexto] = useState('');
  const [notas, setNotas] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState<{ fila: FilaStock; destino: string; cantidad: number } | null>(null);
  const [clave, setClave] = useState(0);

  const cantidad = leerCantidad(cantidadTexto);
  const mismoHueco = !!origen && !!destino && origen.hueco_id === destino.id;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!origen) err.origen = 'Elige qué mercancía se mueve y de dónde.';
    if (cantidad === null || cantidad <= 0) err.cantidad = 'Indica una cantidad mayor que cero.';
    else if (origen && cantidad > origen.cantidad) err.cantidad = `Solo hay ${formatearCantidad(origen.cantidad)} disponibles.`;
    if (!destino) err.destino = 'Elige el hueco de destino.';
    else if (mismoHueco) err.destino = 'El destino debe ser distinto del origen.';
    else if (destino.capacidad !== null && cantidad && cantidad > destino.capacidad - destino.unidades) err.destino = 'La cantidad no cabe en el hueco de destino.';
    setErrores(err);
    setErrorGeneral(null);
    if (Object.keys(err).length) return;

    setEnviando(true);
    try {
      await movimientosApi.traslado({ productoId: origen!.producto_id, origenId: origen!.hueco_id, destinoId: destino!.id, loteId: origen!.lote_id, cantidad: cantidad!, notas });
      setHecho({ fila: origen!, destino: destino!.codigo_completo, cantidad: cantidad! });
      window.scrollTo({ top: 0 });
    } catch (error) {
      setErrorGeneral(await mensajeError(error));
    } finally {
      setEnviando(false);
    }
  }

  if (hecho) {
    return (
      <Confirmacion
        titulo="Traslado registrado"
        acciones={
          <>
            <Boton
              icono={<ArrowLeftRight className="h-4 w-4" />}
              onClick={() => {
                setHecho(null);
                setOrigen(null);
                setDestino(null);
                setCantidadTexto('');
                setNotas('');
                setClave((c) => c + 1);
              }}
            >
              Registrar otro traslado
            </Boton>
            <Boton variante="secundario" onClick={() => navigate(`/productos/${hecho.fila.producto_id}`)}>Ver producto</Boton>
          </>
        }
      >
        <p>
          <strong>{formatearCantidad(hecho.cantidad)}</strong> de <strong>{hecho.fila.producto_nombre}</strong>
        </p>
        <p className="flex flex-wrap items-center justify-center gap-2">
          <Placa>{hecho.fila.codigo_completo}</Placa>
          <span aria-label="a">→</span>
          <Placa>{hecho.destino}</Placa>
        </p>
      </Confirmacion>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/traslados" className="mb-3 inline-flex min-h-[44px] items-center gap-2 font-semibold text-acero hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Traslados
      </Link>
      <h1 className="mb-6 text-4xl">Trasladar mercancía</h1>

      <form onSubmit={enviar} noValidate className="space-y-5">
        <SeccionFormulario numero={1} titulo="Qué se mueve y desde dónde">
          <SelectorOrigen key={clave} valor={origen} onCambio={setOrigen} productoInicial={clave === 0 ? params.get('producto') : null} huecoInicial={clave === 0 ? params.get('hueco') : null} />
          {errores.origen && <p className="text-sm text-peligro" role="alert">{errores.origen}</p>}
          <CampoCantidad id="cantidad" valor={cantidadTexto} onCambio={setCantidadTexto} maximo={origen?.cantidad} error={errores.cantidad} />
        </SeccionFormulario>

        <SeccionFormulario numero={2} titulo="A dónde">
          <SelectorUbicacion key={clave} id="destino" valor={destino} onCambio={setDestino} cantidad={cantidad} />
          {mismoHueco && <p className="text-sm text-peligro" role="alert">El destino debe ser distinto del origen.</p>}
          {errores.destino && !mismoHueco && <p className="text-sm text-peligro" role="alert">{errores.destino}</p>}
          <Campo etiqueta="Notas" htmlFor="notas" ayuda="Opcional: por qué se mueve (reorganización, pasillo en obras…).">
            <Entrada id="notas" value={notas} maxLength={500} onChange={(e) => setNotas(e.target.value)} />
          </Campo>
        </SeccionFormulario>

        {errorGeneral && <Aviso>{errorGeneral}</Aviso>}

        <div className="sticky bottom-0 -mx-4 border-t border-linea bg-fondo/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}>
          <Boton type="submit" ancho cargando={enviando} className="min-h-[52px] text-lg">
            {origen && destino && cantidad ? `Mover ${formatearCantidad(cantidad)} a ${destino.codigo_completo}` : 'Registrar traslado'}
          </Boton>
        </div>
      </form>
    </div>
  );
}
