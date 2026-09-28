export type RolId = 'admin' | 'responsable' | 'operario' | 'consulta';

export interface Rol {
  id: RolId;
  nombre: string;
  descripcion: string;
  orden: number;
}

export interface Perfil {
  id: string;
  email: string;
  nombre_completo: string;
  telefono: string | null;
  foto_url: string | null;
  puesto: string | null;
  rol_id: RolId;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
}

export interface RegistroAcceso {
  id: number;
  usuario_id: string | null;
  email: string | null;
  evento: 'login' | 'logout' | 'login_fallido';
  ip: string | null;
  user_agent: string | null;
  fecha: string;
}
