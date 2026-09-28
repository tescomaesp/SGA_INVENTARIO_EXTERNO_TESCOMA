import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilaMovimiento } from './FilaMovimiento';
import { Aviso, Boton, CabeceraPagina, Cargando } from './ui';
import { useAuth } from '@/features/auth/ProveedorAuth';
import { catalogoApi } from '@/features/catalogo/api';
import { mensajeError } from '@/lib/errores';
import type { Movimiento, TipoMovimiento } from '@/types/catalogo';

const POR_PAGINA = 25;

interface Props {
  tipo: TipoMovimiento;
  titulo: string;
  descripcion: string;
  vacio: string;
  rutaNueva: string;
  textoNueva: string;
  icono: ReactNode;
}

/** Listado paginado de un tipo de movimiento con acceso al formulario de alta. */
export function PaginaMovimientos({ tipo, titulo, descripcion, vacio, rutaNueva, textoNueva, icono }: Props) {
  const { puede } = useAuth();
  const navigate = useNavigate();
  const [lista, setLista] = useState<Movimiento[] | null>(null);
  const [hayMas, setHayMas] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(
    async (desde: number) => {
      try {
        const pagina = await catalogoApi.movimientos({ tipo }, desde, POR_PAGINA);
        setLista((l) => (desde === 0 ? pagina : [...(l ?? []), ...pagina]));
        setHayMas(pagina.length === POR_PAGINA);
      } catch (e) {
        setError(await mensajeError(e));
      }
    },
    [tipo],
  );

  useEffect(() => {
    setLista(null);
    cargar(0);
  }, [cargar]);

  return (
    <>
      <CabeceraPagina
        titulo={titulo}
        descripcion={descripcion}
        acciones={puede('registrar_movimientos') && <Boton icono={icono} onClick={() => navigate(rutaNueva)}>{textoNueva}</Boton>}
      />
      {error ? (
        <Aviso>{error}</Aviso>
      ) : !lista ? (
        <Cargando />
      ) : lista.length === 0 ? (
        <div className="rounded-md border border-dashed border-linea bg-white px-6 py-12 text-center text-suave">{vacio}</div>
      ) : (
        <>
          <ul className="rounded-md border border-linea bg-white">
            {lista.map((m) => <FilaMovimiento key={m.id} m={m} />)}
          </ul>
          {hayMas && (
            <div className="mt-4 text-center">
              <Boton
                variante="secundario"
                cargando={cargandoMas}
                onClick={async () => {
                  setCargandoMas(true);
                  await cargar(lista.length);
                  setCargandoMas(false);
                }}
              >
                Ver más
              </Boton>
            </div>
          )}
        </>
      )}
    </>
  );
}
