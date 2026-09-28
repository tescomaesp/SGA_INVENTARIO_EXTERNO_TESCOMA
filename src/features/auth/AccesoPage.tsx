import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Aviso, Boton, Campo, Entrada } from '@/components/ui';
import { mensajeError } from '@/lib/errores';
import { configuracionCompleta, supabase } from '@/lib/supabase';
import { useAuth } from './ProveedorAuth';
import { PantallaAcceso } from './PantallaAcceso';

export function AccesoPage() {
  const { sesion, perfil, motivoSalida } = useAuth();
  const location = useLocation();
  const desde = (location.state as { desde?: string } | null)?.desde ?? '/';

  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (sesion && perfil) return <Navigate to={desde} replace />;

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: contrasena });
    if (error) {
      if (/invalid login credentials/i.test(error.message)) {
        supabase.rpc('registrar_acceso_fallido', { p_email: email }).then(() => {});
      }
      setError(await mensajeError(error));
      setEnviando(false);
      return;
    }
    await supabase.rpc('registrar_acceso', { p_evento: 'login' });
    // La redirección la hace el <Navigate> de arriba cuando el perfil está cargado.
  }

  return (
    <PantallaAcceso titulo="Iniciar sesión" descripcion="Accede con el email y la contraseña de tu cuenta.">
      {!configuracionCompleta && (
        <div className="mb-5">
          <Aviso>Falta configurar la conexión con Supabase. Crea el archivo .env a partir de .env.example.</Aviso>
        </div>
      )}
      {motivoSalida && !error && (
        <div className="mb-5">
          <Aviso>{motivoSalida}</Aviso>
        </div>
      )}
      <form onSubmit={entrar} className="space-y-5" noValidate>
        <Campo etiqueta="Email" htmlFor="email">
          <Entrada id="email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <Campo etiqueta="Contraseña" htmlFor="contrasena">
          <Entrada id="contrasena" type="password" autoComplete="current-password" required value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
        </Campo>
        {error && <Aviso>{error}</Aviso>}
        <Boton type="submit" ancho cargando={enviando} disabled={!email || !contrasena}>
          Iniciar sesión
        </Boton>
      </form>
      <p className="mt-6 text-center">
        <Link to="/olvide-contrasena" className="font-semibold text-acero underline-offset-4 hover:underline">
          He olvidado mi contraseña
        </Link>
      </p>
      <p className="mt-8 border-t border-linea pt-5 text-sm text-suave">
        ¿No tienes cuenta? Las cuentas las crea un administrador de la empresa. Pídele que te invite.
      </p>
    </PantallaAcceso>
  );
}
