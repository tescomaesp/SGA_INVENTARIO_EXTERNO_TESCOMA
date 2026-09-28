import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configuracionCompleta = Boolean(url && anonKey);

// El cliente limpia el fragmento (#...) de la URL al procesar un enlace de invitación
// o recuperación, así que guardamos antes qué tipo de enlace era y si traía error.
const enNavegador = typeof window !== 'undefined';
const fragmento = new URLSearchParams(enNavegador ? window.location.hash.slice(1) : '');
const consulta = new URLSearchParams(enNavegador ? window.location.search : '');
export const enlaceInicial = {
  tipo: (fragmento.get('type') ?? consulta.get('type')) as 'invite' | 'recovery' | 'signup' | null,
  error: fragmento.get('error_description') ?? consulta.get('error_description'),
};

export const supabase = createClient(url || 'http://localhost', anonKey || 'sin-clave', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const NOMBRE_EMPRESA = import.meta.env.VITE_NOMBRE_EMPRESA || 'tu empresa';

