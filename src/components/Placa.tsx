import type { ReactNode } from 'react';

/**
 * Placa de señalización de pasillo: el elemento visual propio del SGA.
 * Se usa para la marca y, en fases siguientes, para códigos de ubicación.
 */
export function Placa({ children, tamano = 'md', className = '' }: { children: ReactNode; tamano?: 'sm' | 'md' | 'xl'; className?: string }) {
  const t = {
    sm: 'px-1.5 py-0.5 text-sm border-2',
    md: 'px-2.5 py-1 text-lg border-[3px]',
    xl: 'px-5 py-2 text-6xl border-[5px]',
  }[tamano];
  return (
    <span
      className={`inline-block rounded-[3px] border-tinta bg-senal font-rotulo font-bold leading-none tracking-wide text-tinta ${t} ${className}`}
    >
      {children}
    </span>
  );
}
