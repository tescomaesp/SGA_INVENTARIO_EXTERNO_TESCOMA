import { useEffect, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { Printer } from 'lucide-react';
import { Boton, Cargando, Selector } from './ui';

export interface Etiqueta {
  clave: string;
  qr: string;
  arriba: string;
  grande: string;
  abajo: string;
  /** Si se indica, se imprime además un código de barras Code 128 con este valor. */
  barras?: string;
}

type Formato = 'a4' | 'rollo';

const FORMATOS: Record<Formato, { nombre: string; css: string }> = {
  // Hoja A4 de 21 etiquetas (3 × 7) de 63,5 × 38,1 mm, estándar tipo Avery L7160 / Apli 1263
  a4: {
    nombre: 'Hoja A4, 21 etiquetas de 63,5 × 38,1 mm',
    css: `
      @page { size: A4; margin: 15.1mm 7.2mm; }
      .hoja { display: grid; grid-template-columns: repeat(3, 63.5mm); grid-auto-rows: 38.1mm; column-gap: 2.5mm; }
      .etiqueta { width: 63.5mm; height: 38.1mm; }
      .qr { width: 26mm; height: 26mm; }
      .grande { font-size: 17pt; }
    `,
  },
  // Impresora térmica de etiquetas (Zebra, Brother, Dymo…) con rollo de 100 × 50 mm
  rollo: {
    nombre: 'Impresora de etiquetas, 100 × 50 mm',
    css: `
      @page { size: 100mm 50mm; margin: 0; }
      .hoja { display: block; }
      .etiqueta { width: 100mm; height: 50mm; break-after: page; }
      .qr { width: 38mm; height: 38mm; }
      .grande { font-size: 26pt; }
    `,
  },
};

interface Props {
  titulo: string;
  volver: ReactNode;
  etiquetas: Etiqueta[] | null;
  /** Controles adicionales en la barra (p. ej. número de copias). */
  controles?: ReactNode;
}

/** Hoja imprimible de etiquetas con QR. La barra superior no se imprime. */
export function HojaEtiquetas({ titulo, volver, etiquetas, controles }: Props) {
  const [formato, setFormato] = useState<Formato>('a4');
  const [svgs, setSvgs] = useState<Map<string, string> | null>(null);
  const [barras, setBarras] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!etiquetas) return;
    let vigente = true;
    const unicos = [...new Set(etiquetas.map((e) => e.qr))];
    Promise.all(unicos.map((t) => QRCode.toString(t, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }))).then(
      (r) => vigente && setSvgs(new Map(unicos.map((t, i) => [t, r[i]]))),
    );
    // Códigos de barras: se generan como SVG con JsBarcode (solo se carga si hace falta)
    const valores = [...new Set(etiquetas.map((e) => e.barras).filter((v): v is string => !!v))];
    if (valores.length) {
      import('jsbarcode').then(({ default: JsBarcode }) => {
        const mapa = new Map<string, string>();
        for (const v of valores) {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          // Margen lateral (zona de silencio): los lectores lo necesitan para leer de forma fiable
          JsBarcode(svg, v, { format: 'CODE128', displayValue: false, margin: 0, marginLeft: 12, marginRight: 12, height: 40, width: 2, background: '#ffffff' });
          svg.setAttribute('preserveAspectRatio', 'none');
          mapa.set(v, svg.outerHTML);
        }
        if (vigente) setBarras(mapa);
      });
    }
    return () => {
      vigente = false;
    };
  }, [etiquetas]);

  const listas = etiquetas && svgs;

  return (
    <div className="min-h-full bg-fondo">
      <style>{`
        ${FORMATOS[formato].css}
        .etiqueta { box-sizing: border-box; overflow: hidden; break-inside: avoid; }
        .qr svg { width: 100%; height: 100%; display: block; }
        .barras { height: 7mm; width: 100%; margin-top: 1.2mm; }
        .barras svg { width: 100%; height: 100%; display: block; }
        @media screen { .hoja { margin: 0 auto; width: fit-content; gap: 3mm; } .etiqueta { outline: 1px dashed #CBD3DC; background: #fff; } }
        @media print { body { background: #fff !important; padding: 0 !important; } }
      `}</style>

      <header className="sticky top-0 z-10 border-b border-linea bg-white px-4 py-3 print:hidden" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}>
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
          {volver}
          <h1 className="text-2xl">{titulo}</h1>
          {etiquetas && <span className="text-suave">{etiquetas.length} {etiquetas.length === 1 ? 'etiqueta' : 'etiquetas'}</span>}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {controles}
            <Selector value={formato} onChange={(e) => setFormato(e.target.value as Formato)} className="w-auto" aria-label="Formato de etiqueta">
              {(Object.keys(FORMATOS) as Formato[]).map((f) => (
                <option key={f} value={f}>{FORMATOS[f].nombre}</option>
              ))}
            </Selector>
            <Boton icono={<Printer className="h-4 w-4" />} onClick={() => window.print()} disabled={!listas || !etiquetas.length}>Imprimir</Boton>
          </div>
        </div>
      </header>

      <main className="px-4 py-6 print:p-0">
        {!listas ? (
          <Cargando texto="Generando códigos QR…" />
        ) : etiquetas.length === 0 ? (
          <p className="text-center text-suave">No hay nada que imprimir en esta selección.</p>
        ) : (
          <>
            <p className="mx-auto mb-4 max-w-2xl text-center text-sm text-suave print:hidden">
              Al imprimir, elige escala al 100 % (tamaño real) y sin encabezados ni pies de página en el diálogo del navegador.
            </p>
            <div className="hoja">
              {etiquetas.map((e) => (
                <div key={e.clave} className="etiqueta flex items-center gap-[3mm] p-[3mm] text-black">
                  <div className="qr shrink-0" dangerouslySetInnerHTML={{ __html: svgs.get(e.qr) ?? '' }} role="img" aria-label={`Código QR ${e.grande}`} />
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="line-clamp-2 text-[7pt]">{e.arriba}</p>
                    <p className="grande font-rotulo font-bold leading-none tracking-wide">{e.grande}</p>
                    <p className="mt-[1.5mm] line-clamp-2 break-words text-[6.5pt]">{e.abajo}</p>
                    {e.barras && <div className="barras" dangerouslySetInnerHTML={{ __html: barras.get(e.barras) ?? '' }} role="img" aria-label={`Código de barras ${e.barras}`} />}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
