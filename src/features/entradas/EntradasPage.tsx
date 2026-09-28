import { PackagePlus } from 'lucide-react';
import { PaginaMovimientos } from '@/components/PaginaMovimientos';

export function EntradasPage() {
  return (
    <PaginaMovimientos
      tipo="entrada"
      titulo="Entradas"
      descripcion="Mercancía recibida en el almacén, de la más reciente a la más antigua."
      vacio="Todavía no se ha registrado ninguna entrada."
      rutaNueva="/entradas/nueva"
      textoNueva="Registrar entrada"
      icono={<PackagePlus className="h-4 w-4" />}
    />
  );
}
