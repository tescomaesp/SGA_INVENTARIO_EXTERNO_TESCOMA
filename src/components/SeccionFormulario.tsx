import type { ReactNode } from 'react';

/** Bloque numerado de un formulario por pasos (entrada, salida, traslado). */
export function SeccionFormulario({ numero, titulo, children }: { numero: number; titulo: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-linea bg-white p-5 sm:p-6" aria-labelledby={`seccion-${numero}`}>
      <h2 id={`seccion-${numero}`} className="mb-5 flex items-center gap-3 text-2xl">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-tinta font-rotulo text-lg text-white" aria-hidden>{numero}</span>
        {titulo}
      </h2>
      <div className="space-y-5">{children}</div>
    </section>
  );
}
