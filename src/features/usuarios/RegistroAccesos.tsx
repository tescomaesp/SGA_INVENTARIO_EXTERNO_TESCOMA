import { useEffect, useMemo, useState } from 'react';
import { Aviso, Cargando, Selector } from '@/components/ui';
import { mensajeError } from '@/lib/errores';
import { formatearFechaHora, navegador } from '@/lib/formato';
import type { Perfil, RegistroAcceso } from '@/types/modelos';
import { usuariosApi } from './api';

const EVENTO: Record<RegistroAcceso['evento'], { texto: string; clase: string }> = {
  login: { texto: 'Inicio de sesión', clase: 'text-ok' },
  logout: { texto: 'Cierre de sesión', clase: 'text-suave' },
  login_fallido: { texto: 'Intento fallido', clase: 'text-peligro' },
};

export function RegistroAccesos({ usuarios }: { usuarios: Perfil[] }) {
  const [registros, setRegistros] = useState<RegistroAcceso[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<RegistroAcceso['evento'] | ''>('');

  useEffect(() => {
    usuariosApi.accesos().then(setRegistros).catch(async (e) => setError(await mensajeError(e)));
  }, []);

  const nombres = useMemo(() => new Map(usuarios.map((u) => [u.id, u.nombre_completo])), [usuarios]);
  const visibles = (registros ?? []).filter((r) => !filtro || r.evento === filtro);

  if (error) return <Aviso>{error}</Aviso>;
  if (!registros) return <Cargando />;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-suave">Últimos 200 accesos a la plataforma.</p>
        <Selector value={filtro} onChange={(e) => setFiltro(e.target.value as RegistroAcceso['evento'] | '')} className="w-auto" aria-label="Filtrar por tipo">
          <option value="">Todos los eventos</option>
          {(Object.keys(EVENTO) as RegistroAcceso['evento'][]).map((e) => (
            <option key={e} value={e}>{EVENTO[e].texto}</option>
          ))}
        </Selector>
      </div>
      {visibles.length === 0 ? (
        <div className="rounded-md border border-dashed border-linea bg-white px-6 py-12 text-center text-suave">No hay accesos registrados.</div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-linea bg-white">
          <table className="tabla w-full min-w-[40rem]">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Evento</th>
                <th>Dispositivo</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap tabular-nums">{formatearFechaHora(r.fecha)}</td>
                  <td>
                    <p className="font-medium">{(r.usuario_id && nombres.get(r.usuario_id)) || r.email || '—'}</p>
                    {r.usuario_id && nombres.get(r.usuario_id) && <p className="text-sm text-suave">{r.email}</p>}
                  </td>
                  <td className={`whitespace-nowrap font-medium ${EVENTO[r.evento].clase}`}>{EVENTO[r.evento].texto}</td>
                  <td className="whitespace-nowrap">{navegador(r.user_agent)}</td>
                  <td className="tabular-nums text-suave">{r.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
