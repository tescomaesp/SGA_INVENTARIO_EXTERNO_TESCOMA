import { useState, type FormEvent } from 'react';
import { Dialogo } from '@/components/Dialogo';
import { Placa } from '@/components/Placa';
import { Aviso, Boton, Campo, Entrada, Selector } from '@/components/ui';
import { formatearCantidad, leerCantidad } from '@/lib/cantidad';
import { mensajeError } from '@/lib/errores';
import { MOTIVOS_AJUSTE, type MotivoAjuste } from '@/lib/motivos';
import type { FilaStock } from '@/types/catalogo';
import { movimientosApi } from './api';

interface Props {
  fila: FilaStock | null;
  onCerrar: () => void;
  onHecho: (mensaje: string) => void;
}

/** Corrige el stock de una línea indicando la cantidad real contada. */
export function DialogoAjuste({ fila, onCerrar, onHecho }: Props) {
  return (
    <Dialogo abierto={!!fila} onCerrar={onCerrar} titulo="Ajustar stock">
      {fila && <FormAjuste key={fila.id} fila={fila} onCerrar={onCerrar} onHecho={onHecho} />}
    </Dialogo>
  );
}

function FormAjuste({ fila, onCerrar, onHecho }: { fila: FilaStock; onCerrar: () => void; onHecho: (m: string) => void }) {
  const [realTexto, setRealTexto] = useState('');
  const [motivo, setMotivo] = useState<MotivoAjuste>('recuento');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const real = leerCantidad(realTexto);
  const diferencia = real !== null ? real - fila.cantidad : null;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (real === null || real < 0) return setError('Indica la cantidad real contada (0 si no queda nada).');
    if (diferencia === 0) return setError('La cantidad real coincide con la registrada: no hay nada que ajustar.');
    if (!notas.trim()) return setError('Explica el motivo en las notas: queda en el historial.');
    setError(null);
    setEnviando(true);
    try {
      await movimientosApi.ajuste({ productoId: fila.producto_id, huecoId: fila.hueco_id, loteId: fila.lote_id, cantidadReal: real, motivo, notas: notas.trim() });
      onHecho(`Stock ajustado: ${diferencia! > 0 ? '+' : '−'}${formatearCantidad(Math.abs(diferencia!))} en ${fila.codigo_completo}`);
    } catch (err) {
      setError(await mensajeError(err));
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-5" noValidate>
      <div>
        <p className="font-semibold">{fila.producto_nombre} <span className="font-normal text-suave">{fila.sku}</span></p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Placa tamano="sm">{fila.codigo_completo}</Placa>
          {fila.lote_codigo && <span className="text-sm">Lote {fila.lote_codigo}</span>}
        </div>
        <p className="mt-2">Registrado en el sistema: <strong>{formatearCantidad(fila.cantidad)}</strong></p>
      </div>
      <Campo etiqueta="Cantidad real contada" htmlFor="aj-real" obligatorio>
        <div className="flex flex-wrap items-center gap-3">
          <Entrada id="aj-real" inputMode="decimal" value={realTexto} onChange={(e) => setRealTexto(e.target.value)} className="max-w-[10rem] font-rotulo text-2xl font-bold" autoFocus />
          {diferencia !== null && diferencia !== 0 && (
            <span className={`font-rotulo text-xl font-bold ${diferencia > 0 ? 'text-ok' : 'text-peligro'}`} aria-live="polite">
              {diferencia > 0 ? '+' : '−'}{formatearCantidad(Math.abs(diferencia))}
            </span>
          )}
        </div>
      </Campo>
      <Campo etiqueta="Motivo" htmlFor="aj-motivo" obligatorio>
        <Selector id="aj-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoAjuste)}>
          {(Object.keys(MOTIVOS_AJUSTE) as MotivoAjuste[]).map((m) => <option key={m} value={m}>{MOTIVOS_AJUSTE[m]}</option>)}
        </Selector>
      </Campo>
      <Campo etiqueta="Notas" htmlFor="aj-notas" obligatorio ayuda="Qué se ha encontrado y por qué. Queda registrado con tu nombre.">
        <Entrada id="aj-notas" value={notas} maxLength={500} onChange={(e) => setNotas(e.target.value)} />
      </Campo>
      {error && <Aviso>{error}</Aviso>}
      <div className="flex flex-col-reverse gap-2 border-t border-linea pt-5 sm:flex-row sm:justify-end">
        <Boton type="button" variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton type="submit" cargando={enviando}>Registrar ajuste</Boton>
      </div>
    </form>
  );
}
