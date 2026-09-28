import { useState, type ReactNode } from 'react';
import { Dialogo } from './Dialogo';
import { Aviso, Boton } from './ui';
import { mensajeError } from '@/lib/errores';

interface Props {
  abierto: boolean;
  titulo: string;
  children: ReactNode;
  textoConfirmar: string;
  peligro?: boolean;
  onConfirmar: () => Promise<void>;
  onCerrar: () => void;
}

export function DialogoConfirmar({ abierto, titulo, children, textoConfirmar, peligro, onConfirmar, onCerrar }: Props) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cerrar = () => {
    setError(null);
    onCerrar();
  };

  return (
    <Dialogo abierto={abierto} onCerrar={cerrar} titulo={titulo}>
      <div className="space-y-5">
        <div className="space-y-2">{children}</div>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Boton variante="secundario" onClick={cerrar}>Cancelar</Boton>
          <Boton
            variante={peligro ? 'peligro' : 'primario'}
            cargando={enviando}
            onClick={async () => {
              setEnviando(true);
              setError(null);
              try {
                await onConfirmar();
                cerrar();
              } catch (e) {
                setError(await mensajeError(e));
              } finally {
                setEnviando(false);
              }
            }}
          >
            {textoConfirmar}
          </Boton>
        </div>
      </div>
    </Dialogo>
  );
}
