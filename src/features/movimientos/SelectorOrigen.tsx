import { useCallback, useEffect, useState } from 'react';
import { QrCode, RotateCcw } from 'lucide-react';
import { Combobox } from '@/components/Combobox';
import { EscanerQR } from '@/components/EscanerQR';
import { Miniatura } from '@/components/Miniatura';
import { useNotificar } from '@/components/Notificaciones';
import { Placa } from '@/components/Placa';
import { Boton, Cargando, Entrada } from '@/components/ui';
import { catalogoApi } from '@/features/catalogo/api';
import { ubicacionesApi } from '@/features/ubicaciones/api';
import { formatearCantidad } from '@/lib/cantidad';
import { normalizarCodigo, PREFIJO_QR_PRODUCTO, PREFIJO_QR_UBICACION } from '@/lib/codigos';
import { mensajeError } from '@/lib/errores';
import { formatearFecha } from '@/lib/formato';
import type { FilaStock, Producto } from '@/types/catalogo';

type Contexto = { tipo: 'producto'; texto: string } | { tipo: 'hueco'; texto: string };

interface Props {
  valor: FilaStock | null;
  onCambio: (f: FilaStock | null) => void;
  productoInicial?: string | null;
  huecoInicial?: string | null;
}

/** Orden FEFO: primero lo que caduca antes; sin caducidad al final. */
function ordenarFefo(filas: FilaStock[]) {
  return [...filas].sort((a, b) => {
    if (a.fecha_caducidad && b.fecha_caducidad) return a.fecha_caducidad.localeCompare(b.fecha_caducidad);
    if (a.fecha_caducidad) return -1;
    if (b.fecha_caducidad) return 1;
    return a.codigo_completo.localeCompare(b.codigo_completo, 'es', { numeric: true });
  });
}

/**
 * Elegir de dónde sale la mercancía. Se puede partir del producto (buscándolo o escaneando
 * su etiqueta) o del hueco (escaneando la etiqueta de la estantería); después se elige la
 * línea concreta de stock: hueco + lote.
 */
export function SelectorOrigen({ valor, onCambio, productoInicial, huecoInicial }: Props) {
  const notificar = useNotificar();
  const [texto, setTexto] = useState('');
  const [codigoHueco, setCodigoHueco] = useState('');
  const [contexto, setContexto] = useState<Contexto | null>(null);
  const [filas, setFilas] = useState<FilaStock[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [escaneando, setEscaneando] = useState(false);
  const buscar = useCallback((t: string) => catalogoApi.buscarProductos(t), []);

  const mostrar = useCallback(
    async (ctx: Contexto, obtener: () => Promise<FilaStock[]>) => {
      setContexto(ctx);
      setCargando(true);
      try {
        const lista = ordenarFefo(await obtener());
        setFilas(lista);
        if (lista.length === 1) onCambio(lista[0]);
      } catch (e) {
        notificar(await mensajeError(e), 'error');
      } finally {
        setCargando(false);
      }
    },
    [onCambio, notificar],
  );

  const porProducto = useCallback((p: Pick<Producto, 'id' | 'nombre' | 'sku'>) => mostrar({ tipo: 'producto', texto: `${p.nombre} (${p.sku})` }, () => catalogoApi.stock({ producto_id: p.id })), [mostrar]);

  const porHueco = useCallback(
    async (codigo: string) => {
      const c = normalizarCodigo(codigo.replace(PREFIJO_QR_UBICACION, ''));
      if (!c) return;
      const h = await ubicacionesApi.huecoPorCodigo(c).catch(() => null);
      if (!h) return notificar(`No existe ninguna ubicación con el código ${c}`, 'error');
      setCodigoHueco('');
      mostrar({ tipo: 'hueco', texto: h.codigo_completo }, () => catalogoApi.stock({ hueco_id: h.id }));
    },
    [mostrar, notificar],
  );

  // Precarga desde otras pantallas
  useEffect(() => {
    if (productoInicial) catalogoApi.producto(productoInicial).then((p) => p && porProducto(p));
    else if (huecoInicial)
      ubicacionesApi.huecosPlanos({ id: huecoInicial }).then(([h]) => h && mostrar({ tipo: 'hueco', texto: h.codigo_completo }, () => catalogoApi.stock({ hueco_id: h.id })));
  }, [productoInicial, huecoInicial, porProducto, mostrar]);

  async function leerQr(t: string) {
    setEscaneando(false);
    if (t.startsWith(PREFIJO_QR_PRODUCTO)) {
      const p = await catalogoApi.productoPorSku(t.slice(PREFIJO_QR_PRODUCTO.length));
      if (!p) return notificar('No se encuentra el producto de esa etiqueta', 'error');
      porProducto(p);
    } else if (t.startsWith(PREFIJO_QR_UBICACION)) {
      porHueco(t);
    } else {
      notificar('Ese QR no es una etiqueta del almacén', 'error');
    }
  }

  // --- Línea elegida --------------------------------------------------------
  if (valor) {
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-md border-2 border-acero bg-acero-claro/40 p-3">
        <Miniatura ruta={valor.foto_url} tamano={64} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{valor.producto_nombre} <span className="font-normal text-suave">{valor.sku}</span></p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Placa tamano="sm">{valor.codigo_completo}</Placa>
            {valor.lote_codigo && <span className="text-sm">Lote {valor.lote_codigo}</span>}
            {valor.fecha_caducidad && <span className="text-sm text-suave">caduca {formatearFecha(valor.fecha_caducidad)}</span>}
          </div>
          <p className="mt-1 text-sm">Disponible: <strong>{formatearCantidad(valor.cantidad)}</strong></p>
        </div>
        <Boton type="button" variante="fantasma" icono={<RotateCcw className="h-4 w-4" />} onClick={() => onCambio(null)}>Cambiar</Boton>
      </div>
    );
  }

  // --- Buscar ---------------------------------------------------------------
  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <Combobox<Producto>
          id="origen-producto"
          etiquetaAria="Buscar producto"
          valor={texto}
          onCambio={setTexto}
          buscar={buscar}
          clave={(p) => p.id}
          onElegir={(p) => {
            setTexto('');
            porProducto(p);
          }}
          placeholder="Busca el producto por nombre o SKU"
          renderOpcion={(p) => (
            <span className="flex items-center gap-3">
              <Miniatura ruta={p.foto_url} tamano={40} />
              <span className="min-w-0">
                <span className="block truncate font-medium">{p.nombre}</span>
                <span className="block text-sm text-suave">{p.sku}, stock {formatearCantidad(p.stock_total)}</span>
              </span>
            </span>
          )}
        />
        <Boton type="button" variante="secundario" icono={<QrCode className="h-4 w-4" />} onClick={() => setEscaneando(true)}>
          Escanear producto o hueco
        </Boton>
      </div>
      <div className="flex gap-2">
        <Entrada
          value={codigoHueco}
          onChange={(e) => setCodigoHueco(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              porHueco(codigoHueco);
            }
          }}
          placeholder="o escribe el código de un hueco para ver qué contiene"
          aria-label="Código de hueco"
          className="uppercase placeholder:normal-case"
        />
        <Boton type="button" variante="secundario" onClick={() => porHueco(codigoHueco)} disabled={!codigoHueco.trim()}>Ver</Boton>
      </div>

      {cargando ? (
        <Cargando />
      ) : contexto && filas ? (
        <div>
          <p className="mb-2 font-semibold">
            {contexto.tipo === 'producto' ? `Dónde hay ${contexto.texto}` : `Contenido de ${contexto.texto}`}
          </p>
          {filas.length === 0 ? (
            <p className="rounded-md border border-dashed border-linea px-4 py-5 text-center text-suave">
              {contexto.tipo === 'producto' ? 'No hay stock de este producto en el almacén.' : 'Este hueco está vacío.'}
            </p>
          ) : (
            <ul className="space-y-2" role="list">
              {filas.map((f, i) => (
                <li key={f.id}>
                  <button type="button" onClick={() => onCambio(f)} className="flex w-full items-center gap-3 rounded-md border border-linea bg-white p-3 text-left hover:border-acero">
                    {contexto.tipo === 'hueco' && <Miniatura ruta={f.foto_url} tamano={44} />}
                    <span className="min-w-0 flex-1">
                      {contexto.tipo === 'hueco' ? (
                        <span className="block truncate font-semibold">{f.producto_nombre} <span className="font-normal text-suave">{f.sku}</span></span>
                      ) : (
                        <Placa tamano="sm">{f.codigo_completo}</Placa>
                      )}
                      <span className="mt-0.5 block text-sm text-suave">
                        {f.lote_codigo ? `Lote ${f.lote_codigo}` : 'Sin lote'}
                        {f.fecha_caducidad && `, caduca ${formatearFecha(f.fecha_caducidad)}`}
                        {i === 0 && f.fecha_caducidad && filas.length > 1 && <strong className="text-tinta">, sale primero</strong>}
                      </span>
                    </span>
                    <span className="font-rotulo text-2xl font-bold tabular-nums">{formatearCantidad(f.cantidad)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <EscanerQR abierto={escaneando} titulo="Escanear etiqueta" instrucciones="Apunta a la etiqueta del producto o del hueco." onCerrar={() => setEscaneando(false)} onLeer={leerQr} />
    </div>
  );
}
