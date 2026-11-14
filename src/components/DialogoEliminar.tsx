import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Dialogo } from './Dialogo';
import { useNotificar } from './Notificaciones';
import { Aviso, Boton, Campo } from './ui';
import { mensajeError } from '@/lib/errores';
import { modificacionesApi, NOMBRE_TIPO, type ElementoAEliminar, type ResultadoEliminacion } from '@/features/modificaciones/api';

interface Props {
  elementos: ElementoAEliminar[] | null;
  onCerrar: () => void;
  /** Se llama tras eliminar (aunque algunos elementos hayan quedado bloqueados) para recargar los datos. */
  onHecho: (r: ResultadoEliminacion) => void;
}

const VISIBLES = 12;

function resumen(elementos: { tipo: ElementoAEliminar['tipo'] }[]) {
  const cuenta = new Map<string, number>();
  for (const e of elementos) cuenta.set(e.tipo, (cuenta.get(e.tipo) ?? 0) + 1);
  return [...cuenta].map(([t, n]) => `${n} ${NOMBRE_TIPO[t as ElementoAEliminar['tipo']][n === 1 ? 0 : 1]}`).join(', ');
}

/**
 * Confirmación de eliminación para uno o muchos elementos. Pide un motivo opcional, que queda en el
 * registro de modificaciones, y al terminar muestra lo que no se pudo eliminar y por qué.
 */
export function DialogoEliminar({ elementos, onCerrar, onHecho }: Props) {
  const notificar = useNotificar();
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoEliminacion | null>(null);

  useEffect(() => {
    if (elementos) {
      setMotivo('');
      setError(null);
      setResultado(null);
      setEnviando(false);
    }
  }, [elementos]);

  if (!elementos) return <Dialogo abierto={false} onCerrar={onCerrar} titulo="">{null}</Dialogo>;

  async function eliminar() {
    setEnviando(true);
    setError(null);
    try {
      const r = await modificacionesApi.eliminar(elementos!, motivo);
      onHecho(r);
      if (r.bloqueados.length === 0) {
        notificar(r.eliminados.length === 1 ? `${r.eliminados[0].descripcion} eliminado` : `${resumen(r.eliminados)} eliminados`);
        onCerrar();
      } else {
        setResultado(r);
      }
    } catch (e) {
      setError(await mensajeError(e));
    } finally {
      setEnviando(false);
    }
  }

  const titulo = elementos.length === 1 ? `Eliminar ${NOMBRE_TIPO[elementos[0].tipo][0]}` : `Eliminar ${elementos.length} elementos`;

  return (
    <Dialogo abierto onCerrar={onCerrar} titulo={resultado ? 'Resultado' : titulo}>
      {resultado ? (
        <div className="space-y-4">
          {resultado.eliminados.length > 0 && (
            <p className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ok" aria-hidden />
              <span>Eliminados: <strong>{resumen(resultado.eliminados)}</strong>.</span>
            </p>
          )}
          <div>
            <p className="flex items-start gap-2 font-semibold text-peligro">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              No se {resultado.bloqueados.length === 1 ? 'ha podido eliminar 1 elemento' : `han podido eliminar ${resultado.bloqueados.length} elementos`}:
            </p>
            <ul className="mt-2 max-h-72 space-y-2 overflow-auto">
              {resultado.bloqueados.map((b) => (
                <li key={b.id} className="rounded border border-peligro/30 bg-peligro-claro px-3 py-2 text-sm">
                  <span className="font-semibold">{b.descripcion}</span>
                  <span className="block">{b.motivo}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-end border-t border-linea pt-4">
            <Boton onClick={onCerrar}>Entendido</Boton>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <p>{elementos.length === 1 ? 'Se eliminará:' : `Se eliminarán ${resumen(elementos)}:`}</p>
            <ul className="mt-2 max-h-56 divide-y divide-linea/70 overflow-auto rounded-md border border-linea">
              {elementos.slice(0, VISIBLES).map((e) => (
                <li key={`${e.tipo}-${e.id}`} className="px-3 py-2">
                  <span className="font-semibold">{e.descripcion}</span>
                  <span className="text-sm text-suave"> · {NOMBRE_TIPO[e.tipo][0]}</span>
                  {e.aviso && <span className="block text-sm text-peligro">{e.aviso}</span>}
                </li>
              ))}
              {elementos.length > VISIBLES && <li className="px-3 py-2 text-sm text-suave">y {elementos.length - VISIBLES} más</li>}
            </ul>
          </div>
          <Aviso tipo="info">
            Desaparecerá de toda la aplicación, pero su historial de movimientos se conserva en Trazabilidad. La eliminación queda anotada con tu nombre en
            Modificaciones. Las ubicaciones con mercancía no se eliminan: hay que vaciarlas antes.
          </Aviso>
          <Campo etiqueta="Motivo (opcional)" htmlFor="motivo-eliminar" ayuda="Se guarda en el registro de modificaciones.">
            <textarea id="motivo-eliminar" value={motivo} maxLength={500} rows={2} onChange={(e) => setMotivo(e.target.value)} className="entrada" />
          </Campo>
          {error && <Aviso>{error}</Aviso>}
          <div className="flex flex-col-reverse gap-2 border-t border-linea pt-5 sm:flex-row sm:justify-end">
            <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
            <Boton variante="peligro" cargando={enviando} onClick={eliminar}>
              {elementos.length === 1 ? 'Eliminar' : `Eliminar ${elementos.length}`}
            </Boton>
          </div>
        </div>
      )}
    </Dialogo>
  );
}
