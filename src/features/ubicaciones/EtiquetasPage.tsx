import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { HojaEtiquetas, type Etiqueta } from '@/components/HojaEtiquetas';
import { Aviso } from '@/components/ui';
import { PREFIJO_QR_UBICACION } from '@/lib/codigos';
import { mensajeError } from '@/lib/errores';
import { ubicacionesApi, type FiltroHuecos } from './api';

const CAMPOS_FILTRO: (keyof FiltroHuecos)[] = ['almacen_id', 'pasillo_id', 'estanteria_id', 'nivel_id', 'id'];

export function EtiquetasPage() {
  const [params] = useSearchParams();
  const filtro = useMemo(() => Object.fromEntries(CAMPOS_FILTRO.map((c) => [c, params.get(c) ?? undefined])) as FiltroHuecos, [params]);
  const [etiquetas, setEtiquetas] = useState<Etiqueta[] | null>(null);
  const [almacenId, setAlmacenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!CAMPOS_FILTRO.some((c) => filtro[c])) return setError('No se ha indicado qué etiquetas imprimir.');
    ubicacionesApi
      .huecosPlanos(filtro)
      .then((lista) => {
        setAlmacenId(lista[0]?.almacen_id ?? null);
        setEtiquetas(
          lista.map((h) => ({
            clave: h.id,
            qr: PREFIJO_QR_UBICACION + h.codigo_completo,
            arriba: `${h.almacen_codigo}, pasillo ${h.pasillo_codigo}`,
            grande: `${h.estanteria_codigo}-${h.nivel_codigo}-${h.codigo}`,
            abajo: h.codigo_completo,
          })),
        );
      })
      .catch(async (e) => setError(await mensajeError(e)));
  }, [filtro]);

  if (error) return <div className="mx-auto max-w-lg p-6"><Aviso>{error}</Aviso></div>;

  return (
    <HojaEtiquetas
      titulo="Etiquetas de ubicación"
      etiquetas={etiquetas}
      volver={
        <Link to={almacenId ? `/ubicaciones?almacen=${almacenId}` : '/ubicaciones'} className="inline-flex min-h-[44px] items-center gap-2 rounded px-2 font-semibold text-acero hover:bg-acero-claro">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Ubicaciones
        </Link>
      }
    />
  );
}
