import { useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Camera, KeyRound, Trash2 } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { useNotificar } from '@/components/Notificaciones';
import { Aviso, Boton, CabeceraPagina, Campo, Entrada } from '@/components/ui';
import { useAuth } from '@/features/auth/ProveedorAuth';
import { comprimirImagen } from '@/lib/almacenamiento';
import { mensajeError } from '@/lib/errores';
import { NOMBRE_ROL } from '@/lib/permisos';
import { supabase } from '@/lib/supabase';

export function MiPerfilPage() {
  const { perfil, recargarPerfil } = useAuth();
  const notificar = useNotificar();
  const [params] = useSearchParams();
  const bienvenida = params.get('bienvenida') === '1';

  const [nombre, setNombre] = useState(perfil?.nombre_completo ?? '');
  const [telefono, setTelefono] = useState(perfil?.telefono ?? '');
  const [puesto, setPuesto] = useState(perfil?.puesto ?? '');
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputFoto = useRef<HTMLInputElement>(null);

  if (!perfil) return null;

  const cambios =
    nombre.trim() !== perfil.nombre_completo || (telefono.trim() || null) !== perfil.telefono || (puesto.trim() || null) !== perfil.puesto;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!perfil) return;
    if (!nombre.trim()) return setError('El nombre es obligatorio.');
    setError(null);
    setGuardando(true);
    const { error } = await supabase
      .from('perfiles')
      .update({ nombre_completo: nombre.trim(), telefono: telefono.trim() || null, puesto: puesto.trim() || null })
      .eq('id', perfil.id);
    setGuardando(false);
    if (error) return setError(await mensajeError(error));
    await recargarPerfil();
    notificar('Perfil guardado');
  }

  async function cambiarFoto(archivo: File | undefined) {
    if (!archivo || !perfil) return;
    if (!archivo.type.startsWith('image/')) return notificar('El archivo tiene que ser una imagen', 'error');
    setSubiendo(true);
    try {
      const comprimida = await comprimirImagen(archivo, 512);
      const ruta = `${perfil.id}/avatar-${Date.now()}.webp`;
      const { error: errSubida } = await supabase.storage.from('avatares').upload(ruta, comprimida, { contentType: 'image/webp' });
      if (errSubida) throw errSubida;
      const { error } = await supabase.from('perfiles').update({ foto_url: ruta }).eq('id', perfil.id);
      if (error) throw error;
      if (perfil.foto_url) await supabase.storage.from('avatares').remove([perfil.foto_url]);
      await recargarPerfil();
      notificar('Foto actualizada');
    } catch (e) {
      notificar(await mensajeError(e), 'error');
    } finally {
      setSubiendo(false);
      if (inputFoto.current) inputFoto.current.value = '';
    }
  }

  async function quitarFoto() {
    if (!perfil?.foto_url) return;
    const anterior = perfil.foto_url;
    const { error } = await supabase.from('perfiles').update({ foto_url: null }).eq('id', perfil.id);
    if (error) return notificar(await mensajeError(error), 'error');
    await supabase.storage.from('avatares').remove([anterior]);
    await recargarPerfil();
    notificar('Foto eliminada');
  }

  return (
    <>
      <CabeceraPagina titulo="Mi perfil" descripcion="Tus datos de contacto son visibles para el resto del equipo." />

      {bienvenida && (
        <div className="mb-6 max-w-2xl">
          <Aviso tipo="info">Tu cuenta ya está lista. Revisa tus datos y añade una foto para que tus compañeros te reconozcan.</Aviso>
        </div>
      )}

      <div className="grid max-w-4xl gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <section className="flex flex-col items-center rounded-md border border-linea bg-white p-6 text-center">
          <Avatar nombre={perfil.nombre_completo} email={perfil.email} ruta={perfil.foto_url} tamano={112} />
          <p className="mt-4 font-rotulo text-2xl font-bold leading-tight">{perfil.nombre_completo || 'Sin nombre'}</p>
          <p className="text-suave">{NOMBRE_ROL[perfil.rol_id]}</p>

          <input
            ref={inputFoto}
            type="file"
            accept="image/*"
            capture="user"
            className="sr-only"
            id="foto"
            onChange={(e) => cambiarFoto(e.target.files?.[0])}
          />
          <div className="mt-5 flex w-full flex-col gap-2">
            <Boton variante="secundario" icono={<Camera className="h-4 w-4" />} cargando={subiendo} onClick={() => inputFoto.current?.click()}>
              {perfil.foto_url ? 'Cambiar foto' : 'Añadir foto'}
            </Boton>
            {perfil.foto_url && (
              <Boton variante="fantasma" icono={<Trash2 className="h-4 w-4" />} onClick={quitarFoto}>
                Quitar foto
              </Boton>
            )}
          </div>
        </section>

        <section className="rounded-md border border-linea bg-white p-6">
          <form onSubmit={guardar} className="space-y-5" noValidate>
            <Campo etiqueta="Nombre completo" htmlFor="nombre" obligatorio>
              <Entrada id="nombre" autoComplete="name" maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </Campo>
            <div className="grid gap-5 sm:grid-cols-2">
              <Campo etiqueta="Teléfono" htmlFor="telefono">
                <Entrada id="telefono" type="tel" autoComplete="tel" maxLength={30} value={telefono} onChange={(e) => setTelefono(e.target.value)} />
              </Campo>
              <Campo etiqueta="Puesto" htmlFor="puesto">
                <Entrada id="puesto" maxLength={80} value={puesto} onChange={(e) => setPuesto(e.target.value)} placeholder="Ej.: Mozo de almacén" />
              </Campo>
            </div>
            <Campo etiqueta="Email" htmlFor="email" ayuda="Para cambiarlo, habla con un administrador.">
              <Entrada id="email" value={perfil.email} disabled />
            </Campo>
            {error && <Aviso>{error}</Aviso>}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linea pt-5">
              <Link to="/crear-contrasena" className="inline-flex items-center gap-2 font-semibold text-acero underline-offset-4 hover:underline">
                <KeyRound className="h-4 w-4" aria-hidden />
                Cambiar contraseña
              </Link>
              <Boton type="submit" cargando={guardando} disabled={!cambios}>
                Guardar cambios
              </Boton>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
