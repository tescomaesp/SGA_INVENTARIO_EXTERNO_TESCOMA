import type { ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';

export function Confirmacion({ titulo, children, acciones }: { titulo: string; children: ReactNode; acciones: ReactNode }) {
  return (
    <div className="mx-auto max-w-xl py-6 text-center">
      <CheckCircle2 className="mx-auto h-14 w-14 text-ok" aria-hidden />
      <h1 className="mt-3 text-4xl">{titulo}</h1>
      <div className="mt-3 space-y-2 text-lg">{children}</div>
      <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">{acciones}</div>
    </div>
  );
}
