import { ArrowLeftRight } from 'lucide-react';
import { PaginaMovimientos } from '@/components/PaginaMovimientos';

export function TrasladosPage() {
  return (
    <PaginaMovimientos
      tipo="traslado"
      titulo="Traslados"
      descripcion="Cambios de ubicación dentro del almacén."
      vacio="Todavía no se ha movido mercancía entre ubicaciones."
      rutaNueva="/traslados/nueva"
      textoNueva="Trasladar mercancía"
      icono={<ArrowLeftRight className="h-4 w-4" />}
    />
  );
}
