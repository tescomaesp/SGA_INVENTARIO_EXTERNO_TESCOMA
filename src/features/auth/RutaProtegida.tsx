import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { Cargando } from '@/components/ui';
import type { Accion } from '@/lib/permisos';
import { useAuth } from './ProveedorAuth';

export function RutaProtegida({ children, requiere }: { children: ReactNode; requiere?: Accion }) {
  const { sesion, perfil, cargando, puede } = useAuth();
  const location = useLocation();

  if (cargando) return <Cargando />;
  if (!sesion || !perfil) return <Navigate to="/acceso" replace state={{ desde: location.pathname }} />;

  if (requiere && !puede(requiere)) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <ShieldOff className="mx-auto h-10 w-10 text-suave" aria-hidden />
        <h1 className="mt-4 text-3xl">Sin acceso a esta sección</h1>
        <p className="mt-2 text-suave">Tu rol no permite ver esta página. Si la necesitas, pide a un administrador que cambie tu rol.</p>
      </div>
    );
  }
  return <>{children}</>;
}
