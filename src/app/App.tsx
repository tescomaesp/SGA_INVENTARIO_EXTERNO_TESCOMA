import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Cargando } from '@/components/ui';
import { ProveedorNotificaciones } from '@/components/Notificaciones';
import { AccesoPage } from '@/features/auth/AccesoPage';
import { CrearContrasenaPage } from '@/features/auth/CrearContrasenaPage';
import { OlvideContrasenaPage } from '@/features/auth/OlvideContrasenaPage';
import { ProveedorAuth } from '@/features/auth/ProveedorAuth';
import { RutaProtegida } from '@/features/auth/RutaProtegida';
import { MiPerfilPage } from '@/features/perfil/MiPerfilPage';
// Módulos pesados o de uso ocasional: se cargan al entrar en ellos
const UsuariosPage = lazy(() => import('@/features/usuarios/UsuariosPage').then((m) => ({ default: m.UsuariosPage })));
const UbicacionesPage = lazy(() => import('@/features/ubicaciones/UbicacionesPage').then((m) => ({ default: m.UbicacionesPage })));
const ProductosPage = lazy(() => import('@/features/catalogo/ProductosPage').then((m) => ({ default: m.ProductosPage })));
const ProductoDetallePage = lazy(() => import('@/features/catalogo/ProductoDetallePage').then((m) => ({ default: m.ProductoDetallePage })));
const EntradasPage = lazy(() => import('@/features/entradas/EntradasPage').then((m) => ({ default: m.EntradasPage })));
const NuevaEntradaPage = lazy(() => import('@/features/entradas/NuevaEntradaPage').then((m) => ({ default: m.NuevaEntradaPage })));
const SalidasPage = lazy(() => import('@/features/movimientos/SalidasPage').then((m) => ({ default: m.SalidasPage })));
const NuevaSalidaPage = lazy(() => import('@/features/movimientos/NuevaSalidaPage').then((m) => ({ default: m.NuevaSalidaPage })));
const TrasladosPage = lazy(() => import('@/features/movimientos/TrasladosPage').then((m) => ({ default: m.TrasladosPage })));
const NuevoTrasladoPage = lazy(() => import('@/features/movimientos/NuevoTrasladoPage').then((m) => ({ default: m.NuevoTrasladoPage })));
const EtiquetasProductoPage = lazy(() => import('@/features/catalogo/EtiquetasProductoPage').then((m) => ({ default: m.EtiquetasProductoPage })));
const TrazabilidadPage = lazy(() => import('@/features/trazabilidad/TrazabilidadPage').then((m) => ({ default: m.TrazabilidadPage })));
const LotePage = lazy(() => import('@/features/trazabilidad/LotePage').then((m) => ({ default: m.LotePage })));
const PanelPage = lazy(() => import('@/features/panel/PanelPage').then((m) => ({ default: m.PanelPage })));
const InformesPage = lazy(() => import('@/features/informes/InformesPage').then((m) => ({ default: m.InformesPage })));
const EtiquetasPage = lazy(() => import('@/features/ubicaciones/EtiquetasPage').then((m) => ({ default: m.EtiquetasPage })));
import { Layout } from './Layout';

export function App() {
  return (
    <BrowserRouter>
      <ProveedorNotificaciones>
        <ProveedorAuth>
          <Suspense fallback={<Cargando />}>
          <Routes>
            <Route path="/acceso" element={<AccesoPage />} />
            <Route path="/olvide-contrasena" element={<OlvideContrasenaPage />} />
            <Route path="/crear-contrasena" element={<CrearContrasenaPage />} />
            <Route
              path="/productos/etiquetas"
              element={
                <RutaProtegida requiere="ver_stock">
                  <EtiquetasProductoPage />
                </RutaProtegida>
              }
            />
            <Route
              path="/ubicaciones/etiquetas"
              element={
                <RutaProtegida requiere="ver_stock">
                  <EtiquetasPage />
                </RutaProtegida>
              }
            />

            <Route
              element={
                <RutaProtegida>
                  <Layout />
                </RutaProtegida>
              }
            >
              <Route index element={<PanelPage />} />
              <Route path="perfil" element={<MiPerfilPage />} />
              <Route path="ubicaciones" element={<UbicacionesPage />} />
              <Route path="productos" element={<ProductosPage />} />
              <Route path="productos/:id" element={<ProductoDetallePage />} />
              <Route path="entradas" element={<EntradasPage />} />
              <Route path="salidas" element={<SalidasPage />} />
              <Route path="traslados" element={<TrasladosPage />} />
              <Route path="trazabilidad" element={<TrazabilidadPage />} />
              <Route
                path="informes"
                element={
                  <RutaProtegida requiere="informes">
                    <InformesPage />
                  </RutaProtegida>
                }
              />
              <Route path="trazabilidad/lote/:id" element={<LotePage />} />
              <Route
                path="salidas/nueva"
                element={
                  <RutaProtegida requiere="registrar_movimientos">
                    <NuevaSalidaPage />
                  </RutaProtegida>
                }
              />
              <Route
                path="traslados/nueva"
                element={
                  <RutaProtegida requiere="registrar_movimientos">
                    <NuevoTrasladoPage />
                  </RutaProtegida>
                }
              />
              <Route
                path="entradas/nueva"
                element={
                  <RutaProtegida requiere="registrar_movimientos">
                    <NuevaEntradaPage />
                  </RutaProtegida>
                }
              />
              <Route
                path="usuarios"
                element={
                  <RutaProtegida requiere="gestionar_usuarios">
                    <UsuariosPage />
                  </RutaProtegida>
                }
              />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </ProveedorAuth>
      </ProveedorNotificaciones>
    </BrowserRouter>
  );
}
