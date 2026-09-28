import { useEffect, useState, type FormEvent } from 'react';
import { CampoFoto } from '@/components/CampoFoto';
import { Aviso, Boton, Campo, Entrada, Selector } from '@/components/ui';
import { useUrlFirmada } from '@/lib/almacenamiento';
import { leerCantidad } from '@/lib/cantidad';
import { mensajeError } from '@/lib/errores';
import type { Coleccion, Contacto, Producto } from '@/types/catalogo';
import { catalogoApi } from './api';
import { SelectorContacto } from './SelectorContacto';

interface Props {
  producto: Producto;
  onGuardado: () => Promise<void>;
  onCancelar: () => void;
}

export function FormProducto({ producto, onGuardado, onCancelar }: Props) {
  const [nombre, setNombre] = useState(producto.nombre);
  const [coleccionId, setColeccionId] = useState(producto.coleccion_id);
  const [contacto, setContacto] = useState<Contacto | null>(null);
  const [minimo, setMinimo] = useState(producto.stock_minimo ? String(producto.stock_minimo).replace('.', ',') : '');
  const [notas, setNotas] = useState(producto.notas ?? '');
  const [activo, setActivo] = useState(producto.activo);
  const [foto, setFoto] = useState<File | null>(null);
  const [colecciones, setColecciones] = useState<Coleccion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const urlFoto = useUrlFirmada('productos', producto.foto_url);

  useEffect(() => {
    catalogoApi.colecciones().then((l) => setColecciones(l.filter((c) => c.activa || c.id === producto.coleccion_id)));
    if (producto.contacto_id) catalogoApi.contacto(producto.contacto_id).then(setContacto);
  }, [producto]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const stockMinimo = minimo.trim() ? leerCantidad(minimo) : 0;
    if (!nombre.trim()) return setError('El nombre es obligatorio.');
    if (stockMinimo === null || stockMinimo < 0) return setError('El stock mínimo no es un número válido.');
    setError(null);
    setEnviando(true);
    try {
      const foto_url = foto ? await catalogoApi.subirFoto(foto) : undefined;
      await catalogoApi.editarProducto(producto.id, {
        nombre: nombre.trim(),
        coleccion_id: coleccionId,
        contacto_id: contacto?.id ?? null,
        stock_minimo: stockMinimo,
        notas: notas.trim() || null,
        activo,
        ...(foto_url ? { foto_url } : {}),
      });
      await onGuardado();
    } catch (err) {
      setError(await mensajeError(err));
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-5" noValidate>
      <Campo etiqueta="Foto" htmlFor="p-foto">
        <CampoFoto id="p-foto" archivo={foto} onCambio={setFoto} urlActual={urlFoto} />
      </Campo>
      <Campo etiqueta="Nombre" htmlFor="p-nombre" obligatorio>
        <Entrada id="p-nombre" value={nombre} maxLength={150} onChange={(e) => setNombre(e.target.value)} />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Colección" htmlFor="p-col" obligatorio>
          <Selector id="p-col" value={coleccionId} onChange={(e) => setColeccionId(e.target.value)}>
            {colecciones.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Selector>
        </Campo>
        <Campo etiqueta="Stock mínimo" htmlFor="p-min" ayuda="Por debajo de esta cantidad se marca como stock bajo. 0 para no avisar.">
          <Entrada id="p-min" inputMode="decimal" value={minimo} onChange={(e) => setMinimo(e.target.value)} />
        </Campo>
      </div>
      <div>
        <p className="mb-1.5 font-semibold">Contacto habitual</p>
        <SelectorContacto id="p-contacto" valor={contacto} onCambio={setContacto} />
      </div>
      <Campo etiqueta="Notas" htmlFor="p-notas">
        <Entrada id="p-notas" value={notas} maxLength={500} onChange={(e) => setNotas(e.target.value)} />
      </Campo>
      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-linea p-3">
        <input type="checkbox" checked={!activo} onChange={(e) => setActivo(!e.target.checked)} className="mt-1 h-5 w-5 accent-acero" />
        <span>
          <span className="block font-semibold">Dar de baja</span>
          <span className="text-sm text-suave">No se podrán registrar más entradas de este producto. Su historial se conserva.</span>
        </span>
      </label>
      {error && <Aviso>{error}</Aviso>}
      <div className="flex flex-col-reverse gap-2 border-t border-linea pt-5 sm:flex-row sm:justify-end">
        <Boton type="button" variante="secundario" onClick={onCancelar}>Cancelar</Boton>
        <Boton type="submit" cargando={enviando}>Guardar cambios</Boton>
      </div>
    </form>
  );
}
