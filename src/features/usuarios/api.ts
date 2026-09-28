import { supabase } from '@/lib/supabase';
import type { Perfil, RegistroAcceso, Rol, RolId } from '@/types/modelos';

async function invocar<T = { ok: true }>(accion: string, datos: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('gestionar-usuarios', { body: { accion, ...datos } });
  if (error) throw error;
  return data as T;
}

export interface DatosUsuario {
  nombre_completo: string;
  puesto: string;
  telefono: string;
}

export const usuariosApi = {
  async listar(): Promise<Perfil[]> {
    const { data, error } = await supabase.from('perfiles').select('*').order('nombre_completo');
    if (error) throw error;
    return data as Perfil[];
  },
  async roles(): Promise<Rol[]> {
    const { data, error } = await supabase.from('roles').select('*').order('orden');
    if (error) throw error;
    return data as Rol[];
  },
  async accesos(limite = 200): Promise<RegistroAcceso[]> {
    const { data, error } = await supabase.from('auditoria_accesos').select('*').order('fecha', { ascending: false }).limit(limite);
    if (error) throw error;
    return data as RegistroAcceso[];
  },
  pendientes: () => invocar<{ pendientes: string[] }>('estado_invitaciones').then((r) => new Set(r.pendientes)),
  invitar: (email: string, rol: RolId, datos: DatosUsuario) => invocar('invitar', { email, rol, ...datos }),
  editarDatos: (usuario_id: string, datos: DatosUsuario) => invocar('editar_datos', { usuario_id, ...datos }),
  cambiarRol: (usuario_id: string, rol: RolId) => invocar('cambiar_rol', { usuario_id, rol }),
  desactivar: (usuario_id: string) => invocar('desactivar', { usuario_id }),
  reactivar: (usuario_id: string) => invocar('reactivar', { usuario_id }),
  enviarAcceso: (usuario_id: string) => invocar<{ tipo: 'invitacion' | 'recuperacion' }>('enviar_acceso', { usuario_id }),
};
