import { useNavigate, useSearchParams } from 'react-router-dom';
import { PackagePlus } from 'lucide-react';
import { Boton, CabeceraPagina } from '@/components/ui';
import { useAuth } from '@/features/auth/ProveedorAuth';
import { GestionColecciones } from './GestionColecciones';
import { GestionContactos } from './GestionContactos';
import { ListaProductos } from './ListaProductos';

const PESTANAS = [
  ['productos', 'Productos'],
  ['colecciones', 'Colecciones'],
  ['contactos', 'Contactos'],
] as const;
type Pestana = (typeof PESTANAS)[number][0];

export function ProductosPage() {
  const { puede } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const pestana = (PESTANAS.find(([id]) => id === params.get('pestana'))?.[0] ?? 'productos') as Pestana;

  return (
    <>
      <CabeceraPagina
        titulo="Productos"
        descripcion="Catálogo con el stock de cada referencia."
        acciones={puede('registrar_movimientos') && <Boton icono={<PackagePlus className="h-4 w-4" />} onClick={() => navigate('/entradas/nueva')}>Registrar entrada</Boton>}
      />
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-linea" role="tablist">
        {PESTANAS.map(([id, texto]) => (
          <button
            key={id}
            role="tab"
            aria-selected={pestana === id}
            onClick={() => setParams(id === 'productos' ? {} : { pestana: id }, { replace: true })}
            className={`-mb-px min-h-[44px] shrink-0 border-b-[3px] px-4 font-semibold ${pestana === id ? 'border-acero text-acero' : 'border-transparent text-suave hover:text-tinta'}`}
          >
            {texto}
          </button>
        ))}
      </div>
      {pestana === 'productos' && <ListaProductos />}
      {pestana === 'colecciones' && <GestionColecciones />}
      {pestana === 'contactos' && <GestionContactos />}
    </>
  );
}
