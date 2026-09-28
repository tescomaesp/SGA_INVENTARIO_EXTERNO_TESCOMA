import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { Dialogo } from '@/components/Dialogo';
import { DialogoConfirmar } from '@/components/DialogoConfirmar';
import { useNotificar } from '@/components/Notificaciones';
import { Aviso, Boton, Campo, Cargando, Entrada } from '@/components/ui';
import { useAuth } from '@/features/auth/ProveedorAuth';
import { mensajeError } from '@/lib/errores';
import type { Coleccion } from '@/types/catalogo';
import { catalogoApi } from './api';

type Fila = Coleccion & { productos: number };

function FormColeccion({ inicial, onGuardar, onCancelar }: { inicial?: Coleccion; onGuardar: (v: { nombre: string; descripcion: string | null; activa: boolean }) => Promise<void>; onCancelar: () => void }) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? '');
  const [activa, setActiva] = useState(inicial?.activa ?? true);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return setError('El nombre es obligatorio.');
    setEnviando(true);
    try {
      await onGuardar({ nombre: nombre.trim(), descripcion: descripcion.trim() || null, activa });
    } catch (err) {
      setError(await mensajeError(err));
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-5" noValidate>
      <Campo etiqueta="Nombre" htmlFor="col-nombre" obligatorio>
        <Entrada id="col-nombre" value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} autoFocus placeholder="Ej.: Otoño-Invierno 2026" />
      </Campo>
      <Campo etiqueta="Descripción" htmlFor="col-desc">
        <Entrada id="col-desc" value={descripcion} maxLength={200} onChange={(e) => setDescripcion(e.target.value)} />
      </Campo>
      {inicial && (
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-linea p-3">
          <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} className="mt-1 h-5 w-5 accent-acero" />
          <span>
            <span className="block font-semibold">Activa</span>
            <span className="text-sm text-suave">Las colecciones inactivas no se ofrecen al crear productos nuevos.</span>
          </span>
        </label>
      )}
      {error && <Aviso>{error}</Aviso>}
      <div className="flex flex-col-reverse gap-2 border-t border-linea pt-5 sm:flex-row sm:justify-end">
        <Boton type="button" variante="secundario" onClick={onCancelar}>Cancelar</Boton>
        <Boton type="submit" cargando={enviando}>{inicial ? 'Guardar cambios' : 'Crear colección'}</Boton>
      </div>
    </form>
  );
}

export function GestionColecciones() {
  const { puede } = useAuth();
  const editable = puede('gestionar_ubicaciones');
  const notificar = useNotificar();
  const navigate = useNavigate();
  const [lista, setLista] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<Fila | 'nueva' | null>(null);
  const [borrando, setBorrando] = useState<Fila | null>(null);

  const cargar = useCallback(async () => {
    try {
      setLista(await catalogoApi.colecciones());
    } catch (e) {
      setError(await mensajeError(e));
    }
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);

  if (error) return <Aviso>{error}</Aviso>;
  if (!lista) return <Cargando />;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-suave">Agrupan los productos. Se elige una al crear cada producto nuevo.</p>
        {editable && <Boton icono={<Plus className="h-4 w-4" />} onClick={() => setEditando('nueva')}>Nueva colección</Boton>}
      </div>
      {lista.length === 0 ? (
        <div className="rounded-md border border-dashed border-linea bg-white px-6 py-12 text-center text-suave">
          {editable ? 'Crea al menos una colección para poder dar de alta productos.' : 'Todavía no hay colecciones. Un administrador tiene que crearlas.'}
        </div>
      ) : (
        <ul className="divide-y divide-linea/70 rounded-md border border-linea bg-white">
          {lista.map((c) => (
            <li key={c.id} className={`flex items-center gap-3 px-4 py-3 ${c.activa ? '' : 'text-suave'}`}>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{c.nombre}{!c.activa && <span className="ml-2 text-sm font-normal">(inactiva)</span>}</p>
                {c.descripcion && <p className="text-sm text-suave">{c.descripcion}</p>}
              </div>
              <span className="shrink-0 text-sm text-suave">{c.productos} {c.productos === 1 ? 'producto' : 'productos'}</span>
              {c.productos > 0 && (
                <Boton variante="fantasma" className="px-3" onClick={() => navigate(`/productos/etiquetas?coleccion=${c.id}`)} aria-label={`Imprimir etiquetas de ${c.nombre}`} title="Imprimir etiquetas de sus productos" icono={<Printer className="h-4 w-4" />} />
              )}
              {editable && (
                <div className="flex shrink-0">
                  <Boton variante="fantasma" className="px-3" onClick={() => setEditando(c)} aria-label={`Editar ${c.nombre}`} icono={<Pencil className="h-4 w-4" />} />
                  <Boton variante="fantasma" className="px-3 text-peligro hover:bg-peligro-claro" onClick={() => setBorrando(c)} aria-label={`Eliminar ${c.nombre}`} icono={<Trash2 className="h-4 w-4" />} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialogo abierto={!!editando} onCerrar={() => setEditando(null)} titulo={editando === 'nueva' ? 'Nueva colección' : 'Editar colección'}>
        {editando && (
          <FormColeccion
            key={editando === 'nueva' ? 'nueva' : editando.id}
            inicial={editando === 'nueva' ? undefined : editando}
            onCancelar={() => setEditando(null)}
            onGuardar={async (v) => {
              if (editando === 'nueva') await catalogoApi.crearColeccion({ nombre: v.nombre, descripcion: v.descripcion });
              else await catalogoApi.editarColeccion(editando.id, v);
              setEditando(null);
              notificar(editando === 'nueva' ? `Colección ${v.nombre} creada` : 'Colección actualizada');
              await cargar();
            }}
          />
        )}
      </Dialogo>

      <DialogoConfirmar
        abierto={!!borrando}
        titulo={`Eliminar la colección ${borrando?.nombre ?? ''}`}
        textoConfirmar="Eliminar"
        peligro
        onCerrar={() => setBorrando(null)}
        onConfirmar={async () => {
          if (!borrando) return;
          await catalogoApi.borrarColeccion(borrando.id);
          notificar('Colección eliminada');
          await cargar();
        }}
      >
        {borrando && borrando.productos > 0 ? (
          <p>Tiene {borrando.productos} {borrando.productos === 1 ? 'producto' : 'productos'}, así que no se podrá eliminar. Desactívala para que no se use en productos nuevos.</p>
        ) : (
          <p>La colección no tiene productos y se eliminará definitivamente.</p>
        )}
      </DialogoConfirmar>
    </>
  );
}
