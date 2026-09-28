// Edge Function: gestionar-usuarios
// Operaciones que necesitan la clave de servicio y que solo puede hacer un administrador.
// Despliegue: supabase functions deploy gestionar-usuarios
// Secreto necesario: supabase secrets set SITE_URL=https://tu-dominio

import { createClient } from 'npm:@supabase/supabase-js@2';

const ROLES = ['admin', 'responsable', 'operario', 'consulta'] as const;
type Rol = (typeof ROLES)[number];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class ErrorPeticion extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const texto = (v: unknown, max: number): string | null => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw new ErrorPeticion('Formato de datos no válido');
  const t = v.trim();
  if (t.length > max) throw new ErrorPeticion(`Un campo supera los ${max} caracteres`);
  return t || null;
};

const esRol = (v: unknown): v is Rol => typeof v === 'string' && (ROLES as readonly string[]).includes(v);
const esEmail = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const siteUrl = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '');
    if (!siteUrl) throw new ErrorPeticion('Falta configurar SITE_URL en la función', 500);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // 1. Quién llama
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth } = await admin.auth.getUser(token);
    if (!auth?.user) throw new ErrorPeticion('Sesión no válida', 401);
    const yo = auth.user.id;

    // 2. Solo administradores activos
    const { data: miPerfil } = await admin.from('perfiles').select('rol_id, activo').eq('id', yo).single();
    if (!miPerfil || !miPerfil.activo || miPerfil.rol_id !== 'admin') {
      throw new ErrorPeticion('Solo un administrador puede gestionar usuarios', 403);
    }

    const body = await req.json().catch(() => ({}));
    const redirectTo = `${siteUrl}/crear-contrasena`;

    const usuarioObjetivo = () => {
      if (typeof body.usuario_id !== 'string') throw new ErrorPeticion('Falta el usuario');
      return body.usuario_id as string;
    };

    switch (body.accion) {
      case 'invitar': {
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        if (!esEmail(email)) throw new ErrorPeticion('El email no es válido');
        if (!esRol(body.rol)) throw new ErrorPeticion('El rol no es válido');
        const nombre = texto(body.nombre_completo, 120);
        if (!nombre) throw new ErrorPeticion('El nombre es obligatorio');
        const puesto = texto(body.puesto, 80);
        const telefono = texto(body.telefono, 30);

        const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
          data: { nombre_completo: nombre, puesto, telefono },
          redirectTo,
        });
        if (error) {
          const yaExiste = /already|registered|exists/i.test(error.message);
          throw new ErrorPeticion(yaExiste ? 'Ya existe un usuario con ese email' : error.message);
        }

        const { error: errPerfil } = await admin
          .from('perfiles')
          .update({ rol_id: body.rol, nombre_completo: nombre, puesto, telefono })
          .eq('id', data.user.id);
        if (errPerfil) throw errPerfil;

        return json({ ok: true, usuario_id: data.user.id });
      }

      case 'cambiar_rol': {
        const id = usuarioObjetivo();
        if (!esRol(body.rol)) throw new ErrorPeticion('El rol no es válido');
        if (id === yo && body.rol !== 'admin') {
          throw new ErrorPeticion('No puedes quitarte a ti mismo el rol de administrador');
        }
        const { error } = await admin.from('perfiles').update({ rol_id: body.rol }).eq('id', id);
        if (error) throw error;
        return json({ ok: true });
      }

      case 'editar_datos': {
        const id = usuarioObjetivo();
        const nombre = texto(body.nombre_completo, 120);
        if (!nombre) throw new ErrorPeticion('El nombre es obligatorio');
        const { error } = await admin
          .from('perfiles')
          .update({ nombre_completo: nombre, puesto: texto(body.puesto, 80), telefono: texto(body.telefono, 30) })
          .eq('id', id);
        if (error) throw error;
        return json({ ok: true });
      }

      case 'desactivar':
      case 'reactivar': {
        const id = usuarioObjetivo();
        const activar = body.accion === 'reactivar';
        if (id === yo && !activar) throw new ErrorPeticion('No puedes desactivar tu propia cuenta');

        // El bloqueo en Auth impide iniciar sesión y renovar tokens; "activo" lo respeta la base de datos.
        const { error: errAuth } = await admin.auth.admin.updateUserById(id, {
          ban_duration: activar ? 'none' : '876000h',
        });
        if (errAuth) throw errAuth;
        const { error } = await admin.from('perfiles').update({ activo: activar }).eq('id', id);
        if (error) throw error;
        return json({ ok: true });
      }

      case 'enviar_acceso': {
        // Reenvía la invitación si aún no la aceptó; si ya tiene cuenta, envía un enlace para cambiar la contraseña.
        const id = usuarioObjetivo();
        const { data, error } = await admin.auth.admin.getUserById(id);
        if (error || !data.user?.email) throw new ErrorPeticion('Usuario no encontrado', 404);

        const res = data.user.email_confirmed_at
          ? await admin.auth.resetPasswordForEmail(data.user.email, { redirectTo })
          : await admin.auth.admin.inviteUserByEmail(data.user.email, { redirectTo });
        if (res.error) throw res.error;
        return json({ ok: true, tipo: data.user.email_confirmed_at ? 'recuperacion' : 'invitacion' });
      }

      case 'estado_invitaciones': {
        // Devuelve qué usuarios aún no han aceptado la invitación (no hay forma de verlo desde el cliente).
        const pendientes: string[] = [];
        let page = 1;
        for (;;) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
          if (error) throw error;
          for (const u of data.users) if (!u.email_confirmed_at) pendientes.push(u.id);
          if (data.users.length < 200) break;
          page++;
        }
        return json({ ok: true, pendientes });
      }

      default:
        throw new ErrorPeticion('Acción no reconocida');
    }
  } catch (e) {
    if (e instanceof ErrorPeticion) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
