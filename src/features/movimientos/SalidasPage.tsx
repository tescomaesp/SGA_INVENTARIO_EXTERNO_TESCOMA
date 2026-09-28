import { PackageMinus } from 'lucide-react';
import { PaginaMovimientos } from '@/components/PaginaMovimientos';

export function SalidasPage() {
  return (
    <PaginaMovimientos
      tipo="salida"
      titulo="Salidas"
      descripcion="Mercancía que ha salido del almacén: envíos, devoluciones, mermas y uso interno."
      vacio="Todavía no se ha registrado ninguna salida."
      rutaNueva="/salidas/nueva"
      textoNueva="Registrar salida"
      icono={<PackageMinus className="h-4 w-4" />}
    />
  );
}
