import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

type Variante = 'primario' | 'secundario' | 'peligro' | 'fantasma';

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-acero text-white hover:bg-acero-oscuro disabled:bg-acero/50',
  secundario: 'border border-linea bg-white text-tinta hover:bg-fondo disabled:text-suave',
  peligro: 'bg-peligro text-white hover:bg-peligro/90 disabled:bg-peligro/50',
  fantasma: 'text-acero hover:bg-acero-claro disabled:text-suave',
};

interface BotonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  cargando?: boolean;
  icono?: ReactNode;
  ancho?: boolean;
}

export function Boton({ variante = 'primario', cargando, icono, ancho, className = '', children, disabled, ...rest }: BotonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || cargando}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded px-4 py-2 font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTES[variante]} ${ancho ? 'w-full' : ''} ${className}`}
    >
      {cargando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icono}
      {children}
    </button>
  );
}

interface CampoProps {
  etiqueta: string;
  htmlFor: string;
  ayuda?: string;
  error?: string | null;
  obligatorio?: boolean;
  children: ReactNode;
}

export function Campo({ etiqueta, htmlFor, ayuda, error, obligatorio, children }: CampoProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block font-semibold">
        {etiqueta}
        {obligatorio && <span className="text-peligro" aria-hidden> *</span>}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-peligro" role="alert">{error}</p>
      ) : ayuda ? (
        <p className="text-sm text-suave">{ayuda}</p>
      ) : null}
    </div>
  );
}

export const Entrada = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Entrada(
  { className = '', ...rest },
  ref,
) {
  return <input ref={ref} {...rest} className={`entrada ${className}`} />;
});

export function Selector({ className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={`entrada pr-8 ${className}`}>
      {children}
    </select>
  );
}

export function Aviso({ tipo = 'error', children }: { tipo?: 'error' | 'ok' | 'info'; children: ReactNode }) {
  const estilos = {
    error: 'border-peligro/30 bg-peligro-claro text-peligro',
    ok: 'border-ok/30 bg-ok-claro text-ok',
    info: 'border-acero/20 bg-acero-claro text-acero-oscuro',
  }[tipo];
  return (
    <div role={tipo === 'error' ? 'alert' : 'status'} className={`rounded border px-3 py-2.5 text-sm ${estilos}`}>
      {children}
    </div>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-suave" role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      {texto}
    </div>
  );
}

export function CabeceraPagina({ titulo, descripcion, acciones }: { titulo: string; descripcion?: string; acciones?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl sm:text-4xl">{titulo}</h1>
        {descripcion && <p className="mt-1 max-w-prose text-suave">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </div>
  );
}
