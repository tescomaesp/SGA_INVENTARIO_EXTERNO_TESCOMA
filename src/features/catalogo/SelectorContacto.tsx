import { useCallback, useState } from 'react';
import { Mail, Phone, RotateCcw, UserPlus } from 'lucide-react';
import { Combobox } from '@/components/Combobox';
import { useNotificar } from '@/components/Notificaciones';
import { Boton } from '@/components/ui';
import type { Contacto } from '@/types/catalogo';
import { catalogoApi } from './api';
import { FormContacto } from './FormContacto';

interface Props {
  id: string;
  valor: Contacto | null;
  onCambio: (c: Contacto | null) => void;
}

/** Busca un contacto guardado o crea uno nuevo sin salir del formulario. */
export function SelectorContacto({ id, valor, onCambio }: Props) {
  const notificar = useNotificar();
  const [texto, setTexto] = useState('');
  const [creando, setCreando] = useState(false);
  const buscar = useCallback((t: string) => catalogoApi.contactos(t, 8), []);

  if (valor) {
    return (
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border-2 border-acero bg-acero-claro/40 p-4">
        <div>
          <p className="font-semibold">{valor.nombre}</p>
          {valor.empresa && <p className="text-suave">{valor.empresa}</p>}
          <p className="mt-1 flex flex-wrap gap-x-4 text-sm">
            {valor.telefono && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" aria-hidden />{valor.telefono}</span>}
            {valor.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" aria-hidden />{valor.email}</span>}
          </p>
        </div>
        <Boton type="button" variante="fantasma" icono={<RotateCcw className="h-4 w-4" />} onClick={() => onCambio(null)}>Cambiar</Boton>
      </div>
    );
  }

  if (creando) {
    return (
      <div className="rounded-md border border-linea bg-fondo/60 p-4">
        <p className="mb-3 font-semibold">Nuevo contacto</p>
        <FormContacto
          compacto
          inicial={{ nombre: texto }}
          textoGuardar="Crear contacto"
          onCancelar={() => setCreando(false)}
          onGuardar={async (v) => {
            const c = await catalogoApi.crearContacto(v);
            setCreando(false);
            setTexto('');
            onCambio(c);
            notificar(`Contacto ${c.nombre} creado`);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Combobox<Contacto>
        id={id}
        valor={texto}
        onCambio={setTexto}
        buscar={buscar}
        clave={(c) => c.id}
        onElegir={(c) => {
          onCambio(c);
          setTexto('');
        }}
        placeholder="Busca por nombre o empresa"
        renderOpcion={(c) => (
          <>
            <span className="block font-medium">{c.nombre}</span>
            {(c.empresa || c.telefono) && <span className="block text-sm text-suave">{[c.empresa, c.telefono].filter(Boolean).join(', ')}</span>}
          </>
        )}
        extra={{
          contenido: (
            <span className="inline-flex items-center gap-2">
              <UserPlus className="h-4 w-4" aria-hidden />
              {texto.trim() ? `Crear contacto «${texto.trim()}»` : 'Crear contacto nuevo'}
            </span>
          ),
          onElegir: () => setCreando(true),
        }}
      />
      <button type="button" onClick={() => setCreando(true)} className="text-sm font-semibold text-acero hover:underline">
        O crea un contacto nuevo
      </button>
    </div>
  );
}
