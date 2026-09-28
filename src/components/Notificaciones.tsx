import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

type Tipo = 'ok' | 'error';
interface Nota { id: number; tipo: Tipo; texto: string }

const Ctx = createContext<(texto: string, tipo?: Tipo) => void>(() => {});

export function ProveedorNotificaciones({ children }: { children: ReactNode }) {
  const [notas, setNotas] = useState<Nota[]>([]);

  const notificar = useCallback((texto: string, tipo: Tipo = 'ok') => {
    const id = Date.now() + Math.random();
    setNotas((n) => [...n, { id, tipo, texto }]);
    setTimeout(() => setNotas((n) => n.filter((x) => x.id !== id)), tipo === 'error' ? 7000 : 4000);
  }, []);

  return (
    <Ctx.Provider value={notificar}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {notas.map((n) => (
          <div
            key={n.id}
            className={`pointer-events-auto flex max-w-md items-center gap-2 rounded border bg-white px-4 py-3 font-medium shadow-lg ${n.tipo === 'ok' ? 'border-ok/40' : 'border-peligro/40'}`}
          >
            {n.tipo === 'ok' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-ok" aria-hidden /> : <XCircle className="h-5 w-5 shrink-0 text-peligro" aria-hidden />}
            {n.texto}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useNotificar = () => useContext(Ctx);
