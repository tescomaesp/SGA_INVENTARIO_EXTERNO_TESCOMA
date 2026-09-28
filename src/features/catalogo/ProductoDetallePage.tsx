import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowLeftRight, Mail, PackageMinus, PackagePlus, Pencil, Phone, Printer, SlidersHorizontal } from 'lucide-react';
import { Dialogo } from '@/components/Dialogo';
import { FilaMovimiento } from '@/components/FilaMovimiento';
import { Miniatura } from '@/components/Miniatura';
import { useNotificar } from '@/components/Notificaciones';
import { Placa } from '@/components/Placa';
import { Aviso, Boton, Cargando } from '@/components/ui';
import { useAuth } from '@/features/auth/ProveedorAuth';
import { formatearCantidad } from '@/lib/cantidad';
import { mensajeError } from '@/lib/errores';
import { formatearFecha } from '@/lib/formato';
import type { Contacto, FilaStock, Lote, Movimiento, Producto } from '@/types/catalogo';
import { catalogoApi } from './api';
import { FormProducto } from './FormProducto';
import { trazabilidadApi } from '@/features/trazabilidad/api';
import { DialogoAjuste } from '@/features/movimientos/DialogoAjuste';

export function ProductoDetallePage() {
  const { id = '' } = useParams();
  const { puede } = useAuth();
  const navigate = useNavigate();
  const notificar = useNotificar();

  const [producto, setProducto] = useState<Producto | null | undefined>(undefined);
  const [contacto, setContacto] = useState<Contacto | null>(null);
  const [stock, setStock] = useState<FilaStock[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [ajustando, setAjustando] = useState<FilaStock | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [p, s, m, l] = await Promise.all([
        catalogoApi.producto(id),
        catalogoApi.stock({ producto_id: id }),
        catalogoApi.movimientos({ producto_id: id }, 0, 10),
        trazabilidadApi.lotesDeProducto(id),
      ]);
      setProducto(p);
      setLotes(l);
      setStock(s);
      setMovimientos(m);
      setContacto(p?.contacto_id ? await catalogoApi.contacto(p.contacto_id) : null);
    } catch (e) {
      setError(await mensajeError(e));
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (error) return <Aviso>{error}</Aviso>;
  if (producto === undefined) return <Cargando />;
  if (producto === null) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-3xl">Producto no encontrado</h1>
        <Link to="/productos" className="mt-4 inline-block font-semibold text-acero hover:underline">Volver a productos</Link>
      </div>
    );
  }

  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Link to="/productos" className="mb-3 inline-flex min-h-[44px] items-center gap-2 font-semibold text-acero hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Productos
      </Link>

      <div className="mb-8 grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
        <Miniatura ruta={producto.foto_url} tamano={224} className="max-w-full" />
        <div className="min-w-0">
          <p className="text-suave">{producto.sku}, {producto.coleccion_nombre}</p>
          <h1 className="text-4xl">{producto.nombre}</h1>
          {!producto.activo && <p className="mt-1 font-semibold text-peligro">Producto dado de baja</p>}

          <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <p className="text-sm text-suave">Stock total</p>
              <p className={`font-rotulo text-5xl font-bold leading-none tabular-nums ${producto.stock_bajo ? 'text-peligro' : ''}`}>{formatearCantidad(producto.stock_total)}</p>
            </div>
            {producto.stock_minimo > 0 && (
              <p className={producto.stock_bajo ? 'flex items-center gap-1 font-semibold text-peligro' : 'text-suave'}>
                {producto.stock_bajo && <AlertTriangle className="h-4 w-4" aria-hidden />}
                Mínimo {formatearCantidad(producto.stock_minimo)}
              </p>
            )}
          </div>

          {contacto && (
            <div className="mt-4">
              <p className="text-sm text-suave">Contacto habitual</p>
              <p className="font-semibold">{contacto.nombre}{contacto.empresa && <span className="font-normal text-suave">, {contacto.empresa}</span>}</p>
              <p className="flex flex-wrap gap-x-4 text-sm">
                {contacto.telefono && <a href={`tel:${contacto.telefono}`} className="inline-flex items-center gap-1 text-acero hover:underline"><Phone className="h-3.5 w-3.5" aria-hidden />{contacto.telefono}</a>}
                {contacto.email && <a href={`mailto:${contacto.email}`} className="inline-flex items-center gap-1 text-acero hover:underline"><Mail className="h-3.5 w-3.5" aria-hidden />{contacto.email}</a>}
              </p>
            </div>
          )}
          {producto.notas && <p className="mt-3 max-w-prose text-suave">{producto.notas}</p>}

          <div className="mt-5 flex flex-wrap gap-2">
            {puede('registrar_movimientos') && producto.activo && (
              <Boton icono={<PackagePlus className="h-4 w-4" />} onClick={() => navigate(`/entradas/nueva?producto=${producto.id}`)}>Registrar entrada</Boton>
            )}
            {puede('registrar_movimientos') && stock.length > 0 && (
              <>
                <Boton variante="secundario" icono={<PackageMinus className="h-4 w-4" />} onClick={() => navigate(`/salidas/nueva?producto=${producto.id}`)}>Registrar salida</Boton>
                <Boton variante="secundario" icono={<ArrowLeftRight className="h-4 w-4" />} onClick={() => navigate(`/traslados/nueva?producto=${producto.id}`)}>Trasladar</Boton>
              </>
            )}
            {puede('editar_productos') && <Boton variante="secundario" icono={<Pencil className="h-4 w-4" />} onClick={() => setEditando(true)}>Editar ficha</Boton>}
            <Boton variante="fantasma" icono={<Printer className="h-4 w-4" />} onClick={() => navigate(`/productos/etiquetas?producto=${producto.id}`)}>Etiquetas</Boton>
          </div>
        </div>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-2xl">Dónde está</h2>
        {stock.length === 0 ? (
          <p className="rounded-md border border-dashed border-linea bg-white px-4 py-6 text-center text-suave">No hay stock de este producto en el almacén.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-linea bg-white">
            <table className="tabla w-full min-w-[32rem]">
              <thead>
                <tr>
                  <th>Ubicación</th>
                  <th>Lote</th>
                  <th>Caducidad</th>
                  <th className="text-right">Cantidad</th>
                  {puede('ajustes') && <th><span className="sr-only">Acciones</span></th>}
                </tr>
              </thead>
              <tbody>
                {stock.map((s) => {
                  const caducado = s.fecha_caducidad && s.fecha_caducidad < hoy;
                  return (
                    <tr key={s.id}>
                      <td><Link to={`/ubicaciones?almacen=${s.almacen_id}&hueco=${s.hueco_id}`}><Placa tamano="sm">{s.codigo_completo}</Placa></Link></td>
                      <td>{s.lote_codigo ?? <span className="text-suave">—</span>}</td>
                      <td className={caducado ? 'font-semibold text-peligro' : ''}>
                        {s.fecha_caducidad ? `${formatearFecha(s.fecha_caducidad)}${caducado ? ' (caducado)' : ''}` : <span className="text-suave">—</span>}
                      </td>
                      <td className="text-right font-rotulo text-xl font-bold tabular-nums">{formatearCantidad(s.cantidad)}</td>
                      {puede('ajustes') && (
                        <td className="text-right">
                          <Boton variante="fantasma" className="px-3" icono={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setAjustando(s)} aria-label={`Ajustar stock en ${s.codigo_completo}`}>
                            Ajustar
                          </Boton>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {lotes.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-2xl">Lotes</h2>
          <ul className="divide-y divide-linea/70 rounded-md border border-linea bg-white">
            {lotes.map((l) => {
              const caducado = l.fecha_caducidad && l.fecha_caducidad < hoy;
              return (
                <li key={l.id}>
                  <Link to={`/trazabilidad/lote/${l.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-fondo/60">
                    <span className="font-semibold">Lote {l.codigo}</span>
                    {l.fecha_caducidad && (
                      <span className={`text-sm ${caducado ? 'font-semibold text-peligro' : 'text-suave'}`}>
                        caduca {formatearFecha(l.fecha_caducidad)}{caducado && ' (caducado)'}
                      </span>
                    )}
                    <span className="text-sm text-suave">
                      entraron {formatearCantidad(l.entrado)}{l.destinos > 0 && `, enviado a ${l.destinos} ${l.destinos === 1 ? 'destino' : 'destinos'}`}
                    </span>
                    <span className="ml-auto font-rotulo text-xl font-bold tabular-nums">{formatearCantidad(l.stock_actual)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-2xl">Últimos movimientos</h2>
          <Link to={`/trazabilidad?producto=${producto.id}`} className="font-semibold text-acero hover:underline">Ver historial completo</Link>
        </div>
        {movimientos.length === 0 ? (
          <p className="text-suave">Sin movimientos.</p>
        ) : (
          <ul className="rounded-md border border-linea bg-white">
            {movimientos.map((m) => <FilaMovimiento key={m.id} m={m} sinProducto />)}
          </ul>
        )}
      </section>

      <DialogoAjuste
        fila={ajustando}
        onCerrar={() => setAjustando(null)}
        onHecho={async (mensaje) => {
          setAjustando(null);
          notificar(mensaje);
          await cargar();
        }}
      />

      <Dialogo abierto={editando} onCerrar={() => setEditando(false)} titulo="Editar producto">
        {editando && (
          <FormProducto
            producto={producto}
            onCancelar={() => setEditando(false)}
            onGuardado={async () => {
              setEditando(false);
              notificar('Producto actualizado');
              await cargar();
            }}
          />
        )}
      </Dialogo>
    </>
  );
}
