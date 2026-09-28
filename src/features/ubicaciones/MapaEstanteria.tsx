import { Plus } from 'lucide-react';
import { MenuAcciones, type OpcionMenu } from '@/components/MenuAcciones';
import { Placa } from '@/components/Placa';
import type { Estanteria, Hueco, Nivel, Ocupacion } from '@/types/ubicaciones';
import { ESTADOS, estadoHueco } from './estado';

interface Props {
  estanteria: Estanteria;
  prefijo: string; // "ALM1-P01"
  ocupacion: Map<string, Ocupacion>;
  resaltados: Set<string> | null;
  editable: boolean;
  opciones: OpcionMenu[];
  onHueco: (h: Hueco, nivel: Nivel) => void;
  onAnadirHueco: (nivel: Nivel) => void;
  onAnadirNivel: () => void;
}

/**
 * Estantería dibujada como en el almacén: montantes a los lados, baldas como
 * líneas horizontales y el nivel 1 abajo, junto al suelo.
 */
export function MapaEstanteria({ estanteria: e, prefijo, ocupacion, resaltados, editable, opciones, onHueco, onAnadirHueco, onAnadirNivel }: Props) {
  const huecos = e.niveles.flatMap((n) => n.huecos);
  const conMercancia = huecos.filter((h) => (ocupacion.get(h.id)?.unidades ?? 0) > 0).length;

  return (
    <article className="min-w-0 max-w-full rounded-md border border-linea bg-white">
      <header className="flex items-start justify-between gap-2 border-b border-linea px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Placa tamano="sm">{e.codigo}</Placa>
            {e.descripcion && <span className="truncate text-sm font-medium">{e.descripcion}</span>}
          </div>
          <p className="mt-1 text-sm text-suave">
            {huecos.length} {huecos.length === 1 ? 'hueco' : 'huecos'}, {conMercancia} con mercancía
          </p>
        </div>
        <MenuAcciones opciones={opciones} etiqueta={`Acciones de la estantería ${e.codigo}`} />
      </header>

      <div className="overflow-x-auto p-3">
        {e.niveles.length === 0 ? (
          <div className="py-4 text-center text-sm text-suave">
            Sin niveles.
            {editable && (
              <button onClick={onAnadirNivel} className="ml-1 font-semibold text-acero hover:underline">Añadir el primero</button>
            )}
          </div>
        ) : (
          <div className="inline-block border-x-[5px] border-acero/70 px-1.5">
            {e.niveles.map((n) => (
              <div key={n.id} className="flex items-center gap-1.5 border-b-[3px] border-acero/70 py-1.5">
                <span className="w-7 shrink-0 font-rotulo text-sm font-bold text-suave">{n.codigo}</span>
                {n.huecos.map((h) => {
                  const estado = estadoHueco(h, ocupacion.get(h.id));
                  const resaltado = resaltados?.has(h.id);
                  const atenuado = resaltados && !resaltado;
                  const codigo = `${prefijo}-${e.codigo}-${n.codigo}-${h.codigo}`;
                  return (
                    <button
                      key={h.id}
                      onClick={() => onHueco(h, n)}
                      title={`${codigo}: ${ESTADOS[estado].texto}`}
                      aria-label={`Hueco ${codigo}, ${ESTADOS[estado].texto}`}
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[3px] border-2 font-rotulo text-sm font-bold transition-colors ${ESTADOS[estado].celda} ${
                        resaltado ? 'ring-4 ring-senal ring-offset-1' : ''
                      } ${atenuado ? 'opacity-35' : ''}`}
                    >
                      {h.codigo.replace(/^H/, '')}
                    </button>
                  );
                })}
                {editable && n.huecos.length < 50 && (
                  <button
                    onClick={() => onAnadirHueco(n)}
                    className="flex h-11 w-8 shrink-0 items-center justify-center rounded-[3px] border-2 border-dashed border-linea text-suave hover:border-acero hover:text-acero"
                    aria-label={`Añadir hueco al nivel ${n.codigo} de ${e.codigo}`}
                    title="Añadir hueco"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
