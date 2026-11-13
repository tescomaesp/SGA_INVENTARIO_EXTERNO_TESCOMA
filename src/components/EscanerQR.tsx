import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { Dialogo } from './Dialogo';
import { Aviso } from './ui';

interface Props {
  abierto: boolean;
  titulo?: string;
  instrucciones?: string;
  onLeer: (texto: string) => void;
  onCerrar: () => void;
}

// Códigos QR de las etiquetas y códigos de barras habituales (Code 128 de las etiquetas, EAN de fabricante…)
const FORMATOS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.ITF,
  BarcodeFormat.DATA_MATRIX,
];

/** Lee códigos QR y de barras con la cámara trasera. Requiere HTTPS (o localhost). */
export function EscanerQR({ abierto, titulo = 'Escanear código', instrucciones = 'Apunta la cámara al código QR o de barras.', onLeer, onCerrar }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Referencia estable: la cámara no se reinicia cada vez que el padre se vuelve a dibujar
  const alLeer = useRef(onLeer);
  alLeer.current = onLeer;

  useEffect(() => {
    if (!abierto) return;
    let controles: IScannerControls | null = null;
    let activo = true;
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Este navegador no permite usar la cámara. Escribe el código a mano.');
      return;
    }

    const pistas = new Map<DecodeHintType, unknown>([
      [DecodeHintType.POSSIBLE_FORMATS, FORMATOS],
      [DecodeHintType.TRY_HARDER, true],
    ]);
    const lector = new BrowserMultiFormatReader(pistas, { delayBetweenScanAttempts: 120 });

    // Esperar a que el <dialog> haya montado el vídeo
    const t = setTimeout(() => {
      if (!video.current) return;
      lector
        .decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, video.current, (resultado, _err, c) => {
          if (!activo || !resultado) return;
          activo = false;
          c.stop();
          navigator.vibrate?.(80);
          alLeer.current(resultado.getText());
        })
        .then((c) => {
          controles = c;
          if (!activo) c.stop();
        })
        .catch((e: DOMException) => {
          setError(
            e?.name === 'NotAllowedError'
              ? 'No hay permiso para usar la cámara. Actívalo en los ajustes del navegador o escribe el código a mano.'
              : 'No se ha podido abrir la cámara. Escribe el código a mano.',
          );
        });
    }, 50);

    return () => {
      activo = false;
      clearTimeout(t);
      controles?.stop();
    };
  }, [abierto]);

  return (
    <Dialogo abierto={abierto} onCerrar={onCerrar} titulo={titulo}>
      {error ? (
        <Aviso>{error}</Aviso>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-md bg-tinta">
            <video ref={video} playsInline muted className="aspect-square w-full object-cover" />
            <div className="pointer-events-none absolute inset-x-[10%] inset-y-[25%] rounded-md border-4 border-senal" aria-hidden />
          </div>
          <p className="mt-3 text-center text-suave">{instrucciones}</p>
        </>
      )}
    </Dialogo>
  );
}
