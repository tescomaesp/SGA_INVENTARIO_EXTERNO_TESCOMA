import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { puede as puedeRol, type Accion } from '@/lib/permisos';
import type { Perfil } from '@/types/modelos';

interface AuthCtx {
  sesion: Session | null;
  perfil: Perfil | null;
  cargando: boolean;
  /** Motivo por el que se cerró la sesión automáticamente (p. ej. cuenta desactivada). */
  motivoSalida: string | null;
  puede: (accion: Accion) => boolean;
  recargarPerfil: () => Promise<void>;
  cerrarSesion: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function ProveedorAuth({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [sesionLista, setSesionLista] = useState(false);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [perfilListo, setPerfilListo] = useState(false);
  const [motivoSalida, setMotivoSalida] = useState<string | null>(null);

  const usuarioId = sesion?.user.id ?? null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session);
      setSesionLista(true);
    });
    // No se llama a Supabase dentro de este callback (puede bloquear el cliente);
    // la carga del perfil se hace en el efecto de abajo.
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => {
      setSesion(s);
      setSesionLista(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const cargarPerfil = useCallback(async (id: string) => {
    const { data, error } = await supabase.from('perfiles').select('*').eq('id', id).maybeSingle();
    if (error) {
      console.error(error);
      setPerfil(null);
    } else if (!data || !data.activo) {
      setMotivoSalida('Tu cuenta está desactivada. Habla con un administrador.');
      setPerfil(null);
      await supabase.auth.signOut();
    } else {
      setPerfil(data as Perfil);
    }
    setPerfilListo(true);
  }, []);

  useEffect(() => {
    if (!usuarioId) {
      setPerfil(null);
      setPerfilListo(true);
      return;
    }
    setPerfilListo(false);
    cargarPerfil(usuarioId);
  }, [usuarioId, cargarPerfil]);

  const cerrarSesion = useCallback(async () => {
    try {
      await supabase.rpc('registrar_acceso', { p_evento: 'logout' });
    } catch {
      /* no bloquear la salida si falla la auditoría */
    }
    setMotivoSalida(null);
    await supabase.auth.signOut();
  }, []);

  const valor = useMemo<AuthCtx>(
    () => ({
      sesion,
      perfil,
      cargando: !sesionLista || (!!usuarioId && !perfilListo),
      motivoSalida,
      puede: (accion) => puedeRol(perfil?.rol_id, accion),
      recargarPerfil: async () => {
        if (usuarioId) await cargarPerfil(usuarioId);
      },
      cerrarSesion,
    }),
    [sesion, perfil, sesionLista, usuarioId, perfilListo, motivoSalida, cargarPerfil, cerrarSesion],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <ProveedorAuth>');
  return ctx;
}
