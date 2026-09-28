import { useCallback, useEffect, useMemo, useState } from 'react';
import { Mail, Pencil, Search, UserPlus, UserRoundCheck, UserRoundX } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { Dialogo } from '@/components/Dialogo';
import { useNotificar } from '@/components/Notificaciones';
import { Aviso, Boton, CabeceraPagina, Cargando, Entrada, Selector } from '@/components/ui';
import { useAuth } from '@/features/auth/ProveedorAuth';
import { mensajeError } from '@/lib/errores';
import { NOMBRE_ROL, ROLES_ORDENADOS } from '@/lib/permisos';
import type { Perfil, Rol, RolId } from '@/types/modelos';
import { usuariosApi } from './api';
import { FormularioUsuario, type ValoresUsuario } from './FormularioUsuario';
import { RegistroAccesos } from './RegistroAccesos';

type Estado = 'activo' | 'pendiente' | 'desactivado';

const ESTADO: Record<Estado, { texto: string; clase: string }> = {
  activo: { texto: 'Activo', clase: 'bg-ok-claro text-ok' },
  pendiente: { texto: 'Invitación pendiente', clase: 'bg-senal-claro text-tinta' },
  desactivado: { texto: 'Desactivado', clase: 'bg-fondo text-suave' },
};

export function UsuariosPage() {
  const { perfil: yo, recargarPerfil } = useAuth();
  const notificar = useNotificar();

  const [pestana, setPestana] = useState<'equipo' | 'accesos'>('equipo');
  const [usuarios, setUsuarios] = useState<Perfil[] | null>(null);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [pendientes, setPendientes] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState('');
  const [filtroRol, setFiltroRol] = useState<RolId | ''>('');
  const [filtroEstado, setFiltroEstado] = useState<Estado | ''>('');

  const [invitando, setInvitando] = useState(false);
  const [editando, setEditando] = useState<Perfil | null>(null);
  const [desactivando, setDesactivando] = useState<Perfil | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [u, r] = await Promise.all([usuariosApi.listar(), usuariosApi.roles()]);
      setUsuarios(u);
      setRoles(r);
      setError(null);
      usuariosApi.pendientes().then(setPendientes).catch(() => {});
    } catch (e) {
      setError(await mensajeError(e));
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const estadoDe = useCallback(
    (u: Perfil): Estado => (!u.activo ? 'desactivado' : pendientes.has(u.id) ? 'pendiente' : 'activo'),
    [pendientes],
  );

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (usuarios ?? []).filter(
      (u) =>
        (!q || `${u.nombre_completo} ${u.email} ${u.puesto ?? ''}`.toLowerCase().includes(q)) &&
        (!filtroRol || u.rol_id === filtroRol) &&
        (!filtroEstado || estadoDe(u) === filtroEstado),
    );
  }, [usuarios, busqueda, filtroRol, filtroEstado, estadoDe]);

  async function invitar(v: ValoresUsuario) {
    await usuariosApi.invitar(v.email, v.rol, v);
    setInvitando(false);
    notificar(`Invitación enviada a ${v.email}`);
    await cargar();
  }

  async function guardarEdicion(v: ValoresUsuario) {
    if (!editando) return;
    await usuariosApi.editarDatos(editando.id, v);
    if (v.rol !== editando.rol_id) await usuariosApi.cambiarRol(editando.id, v.rol);
    setEditando(null);
    notificar('Usuario actualizado');
    if (editando.id === yo?.id) await recargarPerfil();
    await cargar();
  }

  async function ejecutar(u: Perfil, accion: () => Promise<unknown>, mensaje: string) {
    setOcupado(u.id);
    try {
      await accion();
      notificar(mensaje);
      await cargar();
    } catch (e) {
      notificar(await mensajeError(e), 'error');
    } finally {
      setOcupado(null);
    }
  }

  const acciones = (u: Perfil) => {
    const esYo = u.id === yo?.id;
    const estado = estadoDe(u);
    return (
      <div className="flex flex-wrap justify-end gap-1">
        <Boton variante="fantasma" className="px-3" icono={<Pencil className="h-4 w-4" />} onClick={() => setEditando(u)} aria-label={`Editar a ${u.nombre_completo || u.email}`}>
          Editar
        </Boton>
        {u.activo && (
          <Boton
            variante="fantasma"
            className="px-3"
            icono={<Mail className="h-4 w-4" />}
            disabled={ocupado === u.id}
            onClick={() =>
              ejecutar(
                u,
                () => usuariosApi.enviarAcceso(u.id),
                estado === 'pendiente' ? `Invitación reenviada a ${u.email}` : `Enlace para cambiar la contraseña enviado a ${u.email}`,
              )
            }
            title={estado === 'pendiente' ? 'Reenviar invitación' : 'Enviar enlace para cambiar la contraseña'}
          >
            {estado === 'pendiente' ? 'Reenviar' : 'Enviar acceso'}
          </Boton>
        )}
        {!esYo &&
          (u.activo ? (
            <Boton variante="fantasma" className="px-3 text-peligro hover:bg-peligro-claro" icono={<UserRoundX className="h-4 w-4" />} onClick={() => setDesactivando(u)}>
              Desactivar
            </Boton>
          ) : (
            <Boton
              variante="fantasma"
              className="px-3"
              icono={<UserRoundCheck className="h-4 w-4" />}
              disabled={ocupado === u.id}
              onClick={() => ejecutar(u, () => usuariosApi.reactivar(u.id), `${u.nombre_completo || u.email} puede volver a acceder`)}
            >
              Reactivar
            </Boton>
          ))}
      </div>
    );
  };

  const insigniaEstado = (u: Perfil) => {
    const e = ESTADO[estadoDe(u)];
    return <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-sm font-medium ${e.clase}`}>{e.texto}</span>;
  };

  return (
    <>
      <CabeceraPagina
        titulo="Usuarios"
        descripcion="Invita a los miembros del equipo y decide qué puede hacer cada uno."
        acciones={
          <Boton icono={<UserPlus className="h-4 w-4" />} onClick={() => setInvitando(true)}>
            Invitar usuario
          </Boton>
        }
      />

      <div className="mb-5 flex gap-1 border-b border-linea" role="tablist">
        {(
          [
            ['equipo', 'Equipo'],
            ['accesos', 'Registro de accesos'],
          ] as const
        ).map(([id, texto]) => (
          <button
            key={id}
            role="tab"
            aria-selected={pestana === id}
            onClick={() => setPestana(id)}
            className={`-mb-px min-h-[44px] border-b-[3px] px-4 font-semibold ${pestana === id ? 'border-acero text-acero' : 'border-transparent text-suave hover:text-tinta'}`}
          >
            {texto}
          </button>
        ))}
      </div>

      {pestana === 'accesos' ? (
        <RegistroAccesos usuarios={usuarios ?? []} />
      ) : error ? (
        <Aviso>{error}</Aviso>
      ) : !usuarios ? (
        <Cargando />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_12rem]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" aria-hidden />
              <Entrada type="search" placeholder="Buscar por nombre, email o puesto" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="pl-9" aria-label="Buscar usuarios" />
            </div>
            <Selector value={filtroRol} onChange={(e) => setFiltroRol(e.target.value as RolId | '')} aria-label="Filtrar por rol">
              <option value="">Todos los roles</option>
              {ROLES_ORDENADOS.map((r) => (
                <option key={r} value={r}>{NOMBRE_ROL[r]}</option>
              ))}
            </Selector>
            <Selector value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as Estado | '')} aria-label="Filtrar por estado">
              <option value="">Todos los estados</option>
              {(Object.keys(ESTADO) as Estado[]).map((e) => (
                <option key={e} value={e}>{ESTADO[e].texto}</option>
              ))}
            </Selector>
          </div>

          {filtrados.length === 0 ? (
            <div className="rounded-md border border-dashed border-linea bg-white px-6 py-12 text-center text-suave">
              {usuarios.length <= 1 ? 'Todavía no has invitado a nadie. Usa «Invitar usuario» para añadir al equipo.' : 'Ningún usuario coincide con la búsqueda.'}
            </div>
          ) : (
            <>
              {/* Escritorio: tabla */}
              <div className="hidden overflow-x-auto rounded-md border border-linea bg-white md:block">
                <table className="tabla w-full">
                  <thead>
                    <tr>
                      <th>Usuario</th>
                      <th>Rol</th>
                      <th>Puesto</th>
                      <th>Estado</th>
                      <th className="text-right"><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((u) => (
                      <tr key={u.id} className={u.activo ? '' : 'text-suave'}>
                        <td>
                          <div className="flex items-center gap-3">
                            <Avatar nombre={u.nombre_completo} email={u.email} ruta={u.foto_url} />
                            <div className="min-w-0">
                              <p className="truncate font-semibold">
                                {u.nombre_completo || 'Sin nombre'}
                                {u.id === yo?.id && <span className="ml-1.5 font-normal text-suave">(tú)</span>}
                              </p>
                              <p className="truncate text-sm text-suave">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap">{NOMBRE_ROL[u.rol_id]}</td>
                        <td>{u.puesto || <span className="text-suave">—</span>}</td>
                        <td>{insigniaEstado(u)}</td>
                        <td>{acciones(u)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Móvil: tarjetas */}
              <ul className="space-y-3 md:hidden">
                {filtrados.map((u) => (
                  <li key={u.id} className="rounded-md border border-linea bg-white p-4">
                    <div className="flex items-start gap-3">
                      <Avatar nombre={u.nombre_completo} email={u.email} ruta={u.foto_url} tamano={44} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">
                          {u.nombre_completo || 'Sin nombre'}
                          {u.id === yo?.id && <span className="ml-1.5 font-normal text-suave">(tú)</span>}
                        </p>
                        <p className="truncate text-sm text-suave">{u.email}</p>
                        <p className="mt-1 text-sm">
                          {NOMBRE_ROL[u.rol_id]}
                          {u.puesto && <span className="text-suave">, {u.puesto}</span>}
                        </p>
                        <div className="mt-2">{insigniaEstado(u)}</div>
                      </div>
                    </div>
                    <div className="mt-3 border-t border-linea pt-2">{acciones(u)}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <Dialogo abierto={invitando} onCerrar={() => setInvitando(false)} titulo="Invitar usuario">
        {invitando && <FormularioUsuario roles={roles} onGuardar={invitar} onCancelar={() => setInvitando(false)} />}
      </Dialogo>

      <Dialogo abierto={!!editando} onCerrar={() => setEditando(null)} titulo="Editar usuario">
        {editando && (
          <FormularioUsuario
            key={editando.id}
            usuario={editando}
            roles={roles}
            esUnoMismo={editando.id === yo?.id}
            onGuardar={guardarEdicion}
            onCancelar={() => setEditando(null)}
          />
        )}
      </Dialogo>

      <Dialogo abierto={!!desactivando} onCerrar={() => setDesactivando(null)} titulo="Desactivar usuario">
        {desactivando && (
          <div className="space-y-5">
            <p>
              <strong>{desactivando.nombre_completo || desactivando.email}</strong> no podrá iniciar sesión y su sesión actual se cerrará en unos minutos.
              Su historial de movimientos se conserva. Puedes reactivarlo cuando quieras.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Boton variante="secundario" onClick={() => setDesactivando(null)}>Cancelar</Boton>
              <Boton
                variante="peligro"
                cargando={ocupado === desactivando.id}
                onClick={async () => {
                  const u = desactivando;
                  await ejecutar(u, () => usuariosApi.desactivar(u.id), `${u.nombre_completo || u.email} ya no puede acceder`);
                  setDesactivando(null);
                }}
              >
                Desactivar
              </Boton>
            </div>
          </div>
        )}
      </Dialogo>
    </>
  );
}
