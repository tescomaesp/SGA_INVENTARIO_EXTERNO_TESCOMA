import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, BarChart3, Boxes, History, Home, LogOut, Map as IconoMapa, Menu, Users, X,
} from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { Placa } from '@/components/Placa';
import { Cargando } from '@/components/ui';
import { useAuth } from '@/features/auth/ProveedorAuth';
import { NOMBRE_ROL, type Accion } from '@/lib/permisos';

interface Enlace {
  a: string;
  texto: string;
  icono: typeof Home;
  requiere?: Accion;
}

const DISPONIBLES: Enlace[] = [
  { a: '/', texto: 'Panel', icono: Home },
  { a: '/entradas', texto: 'Entradas', icono: ArrowDownToLine },
  { a: '/salidas', texto: 'Salidas', icono: ArrowUpFromLine },
  { a: '/traslados', texto: 'Traslados', icono: ArrowLeftRight },
  { a: '/productos', texto: 'Productos', icono: Boxes },
  { a: '/ubicaciones', texto: 'Ubicaciones', icono: IconoMapa },
  { a: '/trazabilidad', texto: 'Trazabilidad', icono: History },
  { a: '/informes', texto: 'Informes', icono: BarChart3, requiere: 'informes' },
  { a: '/usuarios', texto: 'Usuarios', icono: Users, requiere: 'gestionar_usuarios' },
];

export function Layout() {
  const { perfil, puede, cerrarSesion } = useAuth();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const location = useLocation();

  useEffect(() => setMenuAbierto(false), [location.pathname]);

  if (!perfil) return null;

  const navegacion = (
    <nav className="flex h-full flex-col" aria-label="Principal">
      <div className="flex items-center gap-3 px-5 py-5">
        <Placa>SGA</Placa>
        <span className="font-rotulo text-xl font-bold text-white">Almacén</span>
      </div>

      <ul className="space-y-0.5 px-3">
        {DISPONIBLES.filter((e) => !e.requiere || puede(e.requiere)).map(({ a, texto, icono: Icono }) => (
          <li key={a}>
            <NavLink
              to={a}
              end={a === '/'}
              className={({ isActive }) =>
                `flex min-h-[44px] items-center gap-3 rounded px-3 font-medium transition-colors ${
                  isActive ? 'bg-white text-acero-oscuro' : 'text-white/85 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <Icono className="h-5 w-5" aria-hidden />
              {texto}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="mt-auto border-t border-white/10 p-3">
        <NavLink
          to="/perfil"
          className={({ isActive }) =>
            `flex items-center gap-3 rounded p-2 transition-colors ${isActive ? 'bg-white/15' : 'hover:bg-white/10'}`
          }
        >
          <Avatar nombre={perfil.nombre_completo} email={perfil.email} ruta={perfil.foto_url} tamano={36} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-white">{perfil.nombre_completo || perfil.email}</span>
            <span className="block truncate text-sm text-white/60">{NOMBRE_ROL[perfil.rol_id]}</span>
          </span>
        </NavLink>
        <button
          onClick={cerrarSesion}
          className="mt-1 flex min-h-[44px] w-full items-center gap-3 rounded px-3 text-white/75 hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-5 w-5" aria-hidden />
          Cerrar sesión
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-full lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] print:block">
      {/* Barra superior en móvil y tablet */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between bg-acero-oscuro px-4 py-2 lg:hidden print:hidden"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
      >
        <div className="flex items-center gap-2">
          <Placa tamano="sm">SGA</Placa>
          <span className="font-rotulo text-lg font-bold text-white">Almacén</span>
        </div>
        <button
          onClick={() => setMenuAbierto(true)}
          className="rounded p-2.5 text-white hover:bg-white/10"
          aria-label="Abrir menú"
          aria-expanded={menuAbierto}
        >
          <Menu className="h-6 w-6" />
        </button>
      </header>

      {/* Menú lateral fijo en escritorio */}
      <aside className="sticky top-0 hidden h-screen overflow-y-auto bg-acero-oscuro lg:block print:hidden">{navegacion}</aside>

      {/* Menú deslizante en móvil */}
      {menuAbierto && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="absolute inset-0 bg-tinta/50" onClick={() => setMenuAbierto(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto bg-acero-oscuro" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
            <button
              onClick={() => setMenuAbierto(false)}
              className="absolute right-3 top-4 rounded p-2 text-white hover:bg-white/10"
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5" />
            </button>
            {navegacion}
          </aside>
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10 print:max-w-none print:p-0">
        <Suspense fallback={<Cargando />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
