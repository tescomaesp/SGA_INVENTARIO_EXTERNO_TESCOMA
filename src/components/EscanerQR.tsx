import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Dialogo } from './Dialogo';
import { Aviso } from './ui';

interface Props {
  abierto: boolean;
  titulo?: string;
  instrucciones?: string;
  onLeer: (texto: string) => void;
  onCerrar: () => void;
}

/** Lee códigos QR con la cámara trasera. Requiere HTTPS (o localhost). */
export function EscanerQR({ abierto, titulo = 'Escanear código QR', instrucciones = 'Apunta la cámara al código QR.', onLeer, onCerrar }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Referencia estable: así la cámara no se reinicia cada vez que el padre se vuelve a dibujar
  const alLeer = useRef(onLeer);
  alLeer.current = onLeer;

  useEffect(() => {
    if (!abierto) return;
    let flujo: MediaStream | null = null;
    let activo = true;
    let ultimo = 0;
    const lienzo = document.createElement('canvas');
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    setError(null);

    const analizar = (t: number) => {
      if (!activo) return;
      const v = video.current;
      if (v && ctx && v.readyState >= 2 && t - ultimo > 150) {
        ultimo = t;
        // Se analiza una versión reducida: más rápido y suficiente para etiquetas
        const escala = Math.min(1, 640 / v.videoWidth);
        lienzo.width = v.videoWidth * escala;
        lienzo.height = v.videoHeight * escala;
        ctx.drawImage(v, 0, 0, lienzo.width, lienzo.height);
        const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
        const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (r?.data) {
          activo = false;
          navigator.vibrate?.(80);
          alLeer.current(r.data);
          return;
        }
      }
      requestAnimationFrame(analizar);
    };

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Este navegador no permite usar la cámara. Escribe el código a mano.');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((s) => {
        flujo = s;
        if (!activo) return s.getTracks().forEach((tr) => tr.stop());
        if (video.current) {
          video.current.srcObject = s;
          video.current.play().catch(() => {});
        }
        requestAnimationFrame(analizar);
      })
      .catch((e: DOMException) => {
        setError(
          e.name === 'NotAllowedError'
            ? 'No hay permiso para usar la cámara. Actívalo en los ajustes del navegador o escribe el código a mano.'
            : 'No se ha podido abrir la cámara. Escribe el código a mano.',
        );
      });

    return () => {
      activo = false;
      flujo?.getTracks().forEach((tr) => tr.stop());
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
            <div className="pointer-events-none absolute inset-[18%] rounded-md border-4 border-senal" aria-hidden />
          </div>
          <p className="mt-3 text-center text-suave">{instrucciones}</p>
        </>
      )}
    </Dialogo>
  );
}
