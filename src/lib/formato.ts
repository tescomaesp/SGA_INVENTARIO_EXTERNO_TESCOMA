const fechaHora = new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' });
const fecha = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' });

export const formatearFechaHora = (iso: string) => fechaHora.format(new Date(iso));
export const formatearFecha = (iso: string) => fecha.format(new Date(iso));

export function iniciales(nombre: string, email = '') {
  const base = nombre.trim() || email;
  const partes = base.split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function navegador(ua: string | null) {
  if (!ua) return '—';
  const so = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  const nav = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  return so ? `${nav} en ${so}` : nav;
}
