import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Aviso, Boton, Campo, Entrada } from '@/components/ui';
import { mensajeError } from '@/lib/errores';
import { supabase } from '@/lib/supabase';
import { PantallaAcceso } from './PantallaAcceso';

export function OlvideContrasenaPage() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/crear-contrasena`,
    });
    setEnviando(false);
    // Por seguridad no se revela si el email existe: solo se muestran errores técnicos.
    if (error && /rate limit|fetch|network/i.test(error.message)) setError(await mensajeError(error));
    else setEnviado(true);
  }

  return (
    <PantallaAcceso titulo="Recuperar contraseña" descripcion="Te enviaremos un enlace para crear una contraseña nueva.">
      {enviado ? (
        <Aviso tipo="ok">
          Si <strong>{email}</strong> tiene una cuenta, recibirás un correo con el enlace en unos minutos. Revisa también la carpeta de spam.
        </Aviso>
      ) : (
        <form onSubmit={enviar} className="space-y-5" noValidate>
          <Campo etiqueta="Email de tu cuenta" htmlFor="email">
            <Entrada id="email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Campo>
          {error && <Aviso>{error}</Aviso>}
          <Boton type="submit" ancho cargando={enviando} disabled={!email.includes('@')}>
            Enviar enlace
          </Boton>
        </form>
      )}
      <p className="mt-6 text-center">
        <Link to="/acceso" className="font-semibold text-acero underline-offset-4 hover:underline">
          Volver a iniciar sesión
        </Link>
      </p>
    </PantallaAcceso>
  );
}
