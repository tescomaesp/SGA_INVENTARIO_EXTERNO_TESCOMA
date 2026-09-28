import { useState, type FormEvent } from 'react';
import { Aviso, Boton, Campo, Entrada } from '@/components/ui';
import { mensajeError } from '@/lib/errores';
import type { Contacto } from '@/types/catalogo';

type Valores = Omit<Contacto, 'id'>;

interface Props {
  inicial?: Partial<Contacto>;
  textoGuardar?: string;
  compacto?: boolean;
  onGuardar: (v: Valores) => Promise<void>;
  onCancelar: () => void;
}

export function FormContacto({ inicial, textoGuardar = 'Guardar contacto', compacto, onGuardar, onCancelar }: Props) {
  const [v, setV] = useState<Valores>({
    nombre: inicial?.nombre ?? '',
    empresa: inicial?.empresa ?? '',
    telefono: inicial?.telefono ?? '',
    email: inicial?.email ?? '',
    notas: inicial?.notas ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const set = (c: keyof Valores) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [c]: e.target.value }));

  // Se usa dentro de otros formularios (entrada), así que no es un <form> propio
  async function guardar(e?: FormEvent) {
    e?.preventDefault();
    if (!v.nombre?.trim()) return setError('El nombre es obligatorio.');
    if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) return setError('El email no es válido.');
    setError(null);
    setEnviando(true);
    try {
      const limpio = (t: string | null) => (t ?? '').trim() || null;
      await onGuardar({ nombre: v.nombre.trim(), empresa: limpio(v.empresa), telefono: limpio(v.telefono), email: limpio(v.email), notas: limpio(v.notas) });
    } catch (err) {
      setError(await mensajeError(err));
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-4" onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && (e.preventDefault(), guardar())}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre" htmlFor="ct-nombre" obligatorio>
          <Entrada id="ct-nombre" value={v.nombre} maxLength={120} onChange={set('nombre')} autoFocus />
        </Campo>
        <Campo etiqueta="Empresa" htmlFor="ct-empresa">
          <Entrada id="ct-empresa" value={v.empresa ?? ''} maxLength={120} onChange={set('empresa')} />
        </Campo>
        <Campo etiqueta="Teléfono" htmlFor="ct-telefono">
          <Entrada id="ct-telefono" type="tel" value={v.telefono ?? ''} maxLength={30} onChange={set('telefono')} />
        </Campo>
        <Campo etiqueta="Email" htmlFor="ct-email">
          <Entrada id="ct-email" type="email" inputMode="email" value={v.email ?? ''} maxLength={254} onChange={set('email')} />
        </Campo>
      </div>
      {!compacto && (
        <Campo etiqueta="Notas" htmlFor="ct-notas">
          <Entrada id="ct-notas" value={v.notas ?? ''} maxLength={300} onChange={set('notas')} />
        </Campo>
      )}
      {error && <Aviso>{error}</Aviso>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Boton type="button" variante="secundario" onClick={onCancelar}>Cancelar</Boton>
        <Boton type="button" cargando={enviando} onClick={() => guardar()}>{textoGuardar}</Boton>
      </div>
    </div>
  );
}
