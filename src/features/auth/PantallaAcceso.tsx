import type { ReactNode } from 'react';
import { Placa } from '@/components/Placa';
import { NOMBRE_EMPRESA } from '@/lib/supabase';

/** Marco común de las pantallas sin sesión: acceso, contraseña olvidada y creación de contraseña. */
export function PantallaAcceso({ titulo, descripcion, children }: { titulo: string; descripcion?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-full lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative flex flex-col justify-between overflow-hidden bg-acero-oscuro px-6 py-8 text-white sm:px-10 lg:py-12">
        {/* Montantes de estantería: referencia visual al almacén, puramente decorativa */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, #fff 0 10px, transparent 10px 150px), repeating-linear-gradient(0deg, #fff 0 4px, transparent 4px 96px)',
          }}
        />
        <div className="relative">
          <Placa tamano="xl" className="text-4xl sm:text-6xl">SGA</Placa>
        </div>
        <div className="relative mt-8 hidden lg:block">
          <p className="font-rotulo text-4xl font-bold leading-tight">
            Control de almacén
            <br />
            de {NOMBRE_EMPRESA}
          </p>
          <p className="mt-3 max-w-sm text-white/75">Entradas, salidas, ubicaciones y trazabilidad de cada producto, en un solo sitio.</p>
        </div>
      </aside>

      <main className="flex items-start justify-center px-5 py-10 sm:items-center sm:px-10">
        <div className="w-full max-w-sm">
          <h1 className="text-4xl">{titulo}</h1>
          {descripcion && <p className="mt-2 text-suave">{descripcion}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
