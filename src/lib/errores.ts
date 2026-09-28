import { FunctionsHttpError } from '@supabase/supabase-js';

const TRADUCCIONES: [RegExp, string][] = [
  [/invalid login credentials/i, 'El email o la contraseña no son correctos.'],
  [/email not confirmed/i, 'Todavía no has aceptado la invitación. Revisa tu correo.'],
  [/banned/i, 'Tu cuenta está desactivada. Habla con un administrador.'],
  [/password should be at least/i, 'La contraseña debe tener al menos 8 caracteres.'],
  [/same.*password|different from the old/i, 'La nueva contraseña debe ser distinta de la anterior.'],
  [/rate limit|too many/i, 'Demasiados intentos. Espera unos minutos y vuelve a probar.'],
  [/failed to fetch|network/i, 'No hay conexión con el servidor. Comprueba tu conexión a internet.'],
  [/duplicate key value.*(almacenes|pasillos|estanterias|niveles|huecos)/i, 'Ya existe una ubicación con ese código en el mismo sitio.'],
  [/codigo_check/i, 'El código solo admite letras y números, sin espacios ni guiones (máximo 12).'],
  [/foreign key.*(stock_por_ubicacion|movimientos)/is, 'No se puede eliminar: tiene mercancía o movimientos registrados. Para dejar de usarlo, bloquéalo o dalo de baja.'],
  [/foreign key.*(productos)/is, 'No se puede eliminar porque tiene productos asociados. Puedes desactivarlo en su lugar.'],
  [/colecciones_nombre_unico/i, 'Ya existe una colección con ese nombre.'],
  [/contactos_email_check/i, 'El email del contacto no es válido.'],
  [/multiple \(or no\) rows|PGRST116/i, 'No se ha podido guardar: el elemento ya no existe o no tienes permiso para modificarlo.'],
  [/row-level security|permission denied/i, 'No tienes permiso para hacer esta operación.'],
  [/jwt expired|session.*(missing|expired)/i, 'Tu sesión ha caducado. Vuelve a iniciar sesión.'],
];

/** Convierte cualquier error (Supabase, Edge Function, red) en un mensaje claro en español. */
export async function mensajeError(e: unknown): Promise<string> {
  if (e instanceof FunctionsHttpError) {
    try {
      const body = await e.context.json();
      if (body?.error) return body.error;
    } catch {
      /* respuesta sin JSON */
    }
  }
  const msg =
    e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : '';
  for (const [patron, texto] of TRADUCCIONES) if (patron.test(msg)) return texto;
  return msg || 'Ha ocurrido un error inesperado.';
}
