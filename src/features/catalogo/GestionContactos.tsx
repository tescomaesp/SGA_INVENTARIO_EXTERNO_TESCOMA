import { useCallback, useEffect, useState } from 'react';
import { Mail, Pencil, Phone, Search, Trash2, UserPlus } from 'lucide-react';
import { Dialogo } from '@/components/Dialogo';
import { BarraSeleccion } from '@/components/BarraSeleccion';
import { Casilla } from '@/components/Casilla';
import { DialogoEliminar } from '@/components/DialogoEliminar';
import type { ElementoAEliminar } from '@/features/modificaciones/api';
import { useNotificar } from '@/components/Notificaciones';
import { Aviso, Boton, Cargando, Entrada } from '@/components/ui';
import { useAuth } from '@/features/auth/ProveedorAuth';
import { mensajeError } from '@/lib/errores';
import type { Contacto } from '@/types/catalogo';
import { catalogoApi } from './api';
import { FormContacto } from './FormContacto';

export function GestionContactos() {
  const { puede } = useAuth();
  const notificar = useNotificar();
  const [texto, setTexto] = useState('');
  const [lista, setLista] = useState<Contacto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<Contacto | 'nuevo' | null>(null);
  const puedeEliminar = puede('eliminar');
  const [seleccion, setSeleccion] = useState<Map<string, Contacto>>(new Map());
  const [aEliminar, setAEliminar] = useState<ElementoAEliminar[] | null>(null);
  const alternar = (c: Contacto, v: boolean) => setSeleccion((s) => { const n = new Map(s); if (v) n.set(c.id, c); else n.delete(c.id); return n; });
  const pedirEliminar = (filas: Contacto[]) => setAEliminar(filas.map((c) => ({ tipo: 'contacto', id: c.id, descripcion: c.empresa ? `${c.nombre} (${c.empresa})` : c.nombre })));

  const cargar = useCallback(async (t: string) => {
    try {
      setLista(await catalogoApi.contactos(t, 300));
    } catch (e) {
      setError(await mensajeError(e));
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => cargar(texto), 250);
    return () => clearTimeout(t);
  }, [texto, cargar]);

  if (error) return <Aviso>{error}</Aviso>;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" aria-hidden />
          <Entrada type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre o empresa" className="pl-9" aria-label="Buscar contactos" />
        </div>
        {puede('registrar_movimientos') && <Boton icono={<UserPlus className="h-4 w-4" />} onClick={() => setEditando('nuevo')}>Nuevo contacto</Boton>}
      </div>

      {!lista ? (
        <Cargando />
      ) : lista.length === 0 ? (
        <div className="rounded-md border border-dashed border-linea bg-white px-6 py-12 text-center text-suave">
          {texto ? 'Ningún contacto coincide con la búsqueda.' : 'Todavía no hay contactos. También se pueden crear al registrar una entrada.'}
        </div>
      ) : (
        <ul className="divide-y divide-linea/70 rounded-md border border-linea bg-white">
          {lista.map((c) => (
            <li key={c.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${seleccion.has(c.id) ? 'bg-peligro-claro/60' : ''}`}>
              {puedeEliminar && <Casilla etiqueta={`Seleccionar ${c.nombre}`} marcada={seleccion.has(c.id)} onCambio={(v) => alternar(c, v)} />}
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{c.nombre}</p>
                {c.empresa && <p className="text-sm text-suave">{c.empresa}</p>}
                <p className="mt-0.5 flex flex-wrap gap-x-4 text-sm">
                  {c.telefono && <a href={`tel:${c.telefono}`} className="inline-flex items-center gap-1 text-acero hover:underline"><Phone className="h-3.5 w-3.5" aria-hidden />{c.telefono}</a>}
                  {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-acero hover:underline"><Mail className="h-3.5 w-3.5" aria-hidden />{c.email}</a>}
                </p>
              </div>
              <div className="flex shrink-0">
                {puede('editar_productos') && <Boton variante="fantasma" className="px-3" onClick={() => setEditando(c)} aria-label={`Editar ${c.nombre}`} icono={<Pencil className="h-4 w-4" />} />}
                {puedeEliminar && <Boton variante="fantasma" className="px-3 text-peligro hover:bg-peligro-claro" onClick={() => pedirEliminar([c])} aria-label={`Eliminar ${c.nombre}`} icono={<Trash2 className="h-4 w-4" />} />}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialogo abierto={!!editando} onCerrar={() => setEditando(null)} titulo={editando === 'nuevo' ? 'Nuevo contacto' : 'Editar contacto'}>
        {editando && (
          <FormContacto
            key={editando === 'nuevo' ? 'nuevo' : editando.id}
            inicial={editando === 'nuevo' ? undefined : editando}
            onCancelar={() => setEditando(null)}
            onGuardar={async (v) => {
              if (editando === 'nuevo') await catalogoApi.crearContacto(v);
              else await catalogoApi.editarContacto(editando.id, v);
              setEditando(null);
              notificar(editando === 'nuevo' ? `Contacto ${v.nombre} creado` : 'Contacto actualizado');
              await cargar(texto);
            }}
          />
        )}
      </Dialogo>

      {seleccion.size > 0 && (
        <BarraSeleccion
          texto={`${seleccion.size} ${seleccion.size === 1 ? 'contacto seleccionado' : 'contactos seleccionados'}`}
          onCancelar={() => setSeleccion(new Map())}
          onEliminar={() => pedirEliminar([...seleccion.values()])}
        />
      )}
      {seleccion.size > 0 && <div className="h-20" aria-hidden />}
      <DialogoEliminar
        elementos={aEliminar}
        onCerrar={() => setAEliminar(null)}
        onHecho={(r) => {
          setSeleccion((s) => { const n = new Map(s); r.eliminados.forEach((e) => n.delete(e.id)); return n; });
          cargar(texto);
        }}
      />
    </>
  );
}
