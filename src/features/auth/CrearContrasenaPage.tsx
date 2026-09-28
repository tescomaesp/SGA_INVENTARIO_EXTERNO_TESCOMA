import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Aviso, Boton, Campo, Cargando, Entrada } from '@/components/ui';
import { useNotificar } from '@/components/Notificaciones';
import { mensajeError } from '@/lib/errores';
import { enlaceInicial, supabase } from '@/lib/supabase';
import { useAuth } from './ProveedorAuth';
import { PantallaAcceso } from './PantallaAcceso';

const MINIMO = 8;

/** Sirve para aceptar una invitación, recuperar la contraseña o cambiarla con la sesión iniciada. */
export function CrearContrasenaPage() {
  const { sesion, cargando, recargarPerfil } = useAuth();
  const navigate = useNavigate();
  const notificar = useNotificar();
  const esInvitacion = enlaceInicial.tipo === 'invite';

  const [contrasena, setContrasena] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const titulo = esInvitacion ? 'Te damos la bienvenida' : 'Nueva contraseña';
  const descripcion = esInvitacion
    ? 'Crea la contraseña con la que accederás a partir de ahora.'
    : 'Escribe la nueva contraseña de tu cuenta.';

  if (cargando) return <Cargando />;

  if (!sesion) {
    return (
      <PantallaAcceso titulo="El enlace no es válido">
        <Aviso>
          {enlaceInicial.error
            ? 'El enlace ha caducado o ya se ha usado.'
            : 'Abre esta página desde el enlace del correo que has recibido.'}{' '}
          Puedes pedir uno nuevo o, si es una invitación, pedir a un administrador que te la reenvíe.
        </Aviso>
        <div className="mt-6 flex flex-col gap-3">
          <Link to="/olvide-contrasena" className="text-center font-semibold text-acero underline-offset-4 hover:underline">
            Pedir un enlace nuevo
          </Link>
          <Link to="/acceso" className="text-center font-semibold text-acero underline-offset-4 hover:underline">
            Ir a iniciar sesión
          </Link>
        </div>
      </PantallaAcceso>
    );
  }

  const errorLongitud = contrasena && contrasena.length < MINIMO ? `Debe tener al menos ${MINIMO} caracteres.` : null;
  const errorRepetir = repetir && repetir !== contrasena ? 'Las contraseñas no coinciden.' : null;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (errorLongitud || errorRepetir || !contrasena) return;
    setError(null);
    setEnviando(true);
    const { error } = await supabase.auth.updateUser({ password: contrasena });
    if (error) {
      setError(await mensajeError(error));
      setEnviando(false);
      return;
    }
    if (esInvitacion) {
      await supabase.rpc('registrar_acceso', { p_evento: 'login' });
      await recargarPerfil();
      navigate('/perfil?bienvenida=1', { replace: true });
    } else {
      notificar('Contraseña actualizada');
      navigate('/', { replace: true });
    }
  }

  return (
    <PantallaAcceso titulo={titulo} descripcion={descripcion}>
      <form onSubmit={guardar} className="space-y-5" noValidate>
        <input type="email" autoComplete="username" value={sesion.user.email ?? ''} readOnly hidden />
        <Campo etiqueta="Contraseña" htmlFor="nueva" ayuda={`Mínimo ${MINIMO} caracteres.`} error={errorLongitud}>
          <Entrada id="nueva" type="password" autoComplete="new-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
        </Campo>
        <Campo etiqueta="Repite la contraseña" htmlFor="repetir" error={errorRepetir}>
          <Entrada id="repetir" type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} />
        </Campo>
        {error && <Aviso>{error}</Aviso>}
        <Boton type="submit" ancho cargando={enviando} disabled={!contrasena || !repetir || !!errorLongitud || !!errorRepetir}>
          Guardar contraseña
        </Boton>
      </form>
    </PantallaAcceso>
  );
}
