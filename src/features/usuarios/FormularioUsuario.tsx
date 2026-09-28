import { useState, type FormEvent } from 'react';
import { Aviso, Boton, Campo, Entrada, Selector } from '@/components/ui';
import { mensajeError } from '@/lib/errores';
import { NOMBRE_ROL, ROLES_ORDENADOS } from '@/lib/permisos';
import type { Perfil, Rol, RolId } from '@/types/modelos';

export interface ValoresUsuario {
  email: string;
  nombre_completo: string;
  puesto: string;
  telefono: string;
  rol: RolId;
}

interface Props {
  /** Si se pasa, el formulario edita a ese usuario; si no, invita a uno nuevo. */
  usuario?: Perfil;
  roles: Rol[];
  esUnoMismo?: boolean;
  onGuardar: (valores: ValoresUsuario) => Promise<void>;
  onCancelar: () => void;
}

export function FormularioUsuario({ usuario, roles, esUnoMismo, onGuardar, onCancelar }: Props) {
  const [v, setV] = useState<ValoresUsuario>({
    email: usuario?.email ?? '',
    nombre_completo: usuario?.nombre_completo ?? '',
    puesto: usuario?.puesto ?? '',
    telefono: usuario?.telefono ?? '',
    rol: usuario?.rol_id ?? 'operario',
  });
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const set = (campo: keyof ValoresUsuario) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [campo]: e.target.value }));

  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim());
  const descripcionRol = roles.find((r) => r.id === v.rol)?.descripcion;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!v.nombre_completo.trim()) return setError('El nombre es obligatorio.');
    if (!usuario && !emailValido) return setError('Escribe un email válido.');
    setError(null);
    setEnviando(true);
    try {
      await onGuardar({ ...v, email: v.email.trim().toLowerCase(), nombre_completo: v.nombre_completo.trim() });
    } catch (err) {
      setError(await mensajeError(err));
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-5" noValidate>
      <Campo etiqueta="Email" htmlFor="u-email" obligatorio={!usuario} ayuda={usuario ? undefined : 'Recibirá un correo para crear su contraseña.'}>
        <Entrada id="u-email" type="email" inputMode="email" autoComplete="off" value={v.email} onChange={set('email')} disabled={!!usuario} />
      </Campo>
      <Campo etiqueta="Nombre completo" htmlFor="u-nombre" obligatorio>
        <Entrada id="u-nombre" maxLength={120} value={v.nombre_completo} onChange={set('nombre_completo')} />
      </Campo>
      <div className="grid gap-5 sm:grid-cols-2">
        <Campo etiqueta="Puesto" htmlFor="u-puesto">
          <Entrada id="u-puesto" maxLength={80} value={v.puesto} onChange={set('puesto')} />
        </Campo>
        <Campo etiqueta="Teléfono" htmlFor="u-telefono">
          <Entrada id="u-telefono" type="tel" maxLength={30} value={v.telefono} onChange={set('telefono')} />
        </Campo>
      </div>
      <Campo
        etiqueta="Rol"
        htmlFor="u-rol"
        obligatorio
        ayuda={esUnoMismo ? 'No puedes cambiar tu propio rol.' : descripcionRol}
      >
        <Selector id="u-rol" value={v.rol} onChange={set('rol')} disabled={esUnoMismo}>
          {ROLES_ORDENADOS.map((r) => (
            <option key={r} value={r}>
              {NOMBRE_ROL[r]}
            </option>
          ))}
        </Selector>
      </Campo>
      {error && <Aviso>{error}</Aviso>}
      <div className="flex flex-col-reverse gap-2 border-t border-linea pt-5 sm:flex-row sm:justify-end">
        <Boton type="button" variante="secundario" onClick={onCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" cargando={enviando}>
          {usuario ? 'Guardar cambios' : 'Enviar invitación'}
        </Boton>
      </div>
    </form>
  );
}
