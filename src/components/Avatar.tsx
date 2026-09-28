import { useUrlFirmada } from '@/lib/almacenamiento';
import { iniciales } from '@/lib/formato';

interface Props {
  nombre: string;
  email?: string;
  ruta: string | null | undefined;
  tamano?: number;
}

export function Avatar({ nombre, email, ruta, tamano = 40 }: Props) {
  const url = useUrlFirmada('avatares', ruta);
  const estilo = { width: tamano, height: tamano, fontSize: tamano * 0.4 };
  if (url) {
    return <img src={url} alt="" style={estilo} className="shrink-0 rounded-full object-cover" loading="lazy" />;
  }
  return (
    <span
      style={estilo}
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-acero-claro font-rotulo font-bold text-acero-oscuro"
    >
      {iniciales(nombre, email)}
    </span>
  );
}
