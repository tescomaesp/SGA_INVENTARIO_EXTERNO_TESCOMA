/** Casilla de selección grande (cómoda en móvil) para listados con selección múltiple. */
export function Casilla({ marcada, indeterminada, onCambio, etiqueta }: { marcada: boolean; indeterminada?: boolean; onCambio: (v: boolean) => void; etiqueta: string }) {
  return (
    <input
      type="checkbox"
      aria-label={etiqueta}
      checked={marcada}
      ref={(el) => {
        if (el) el.indeterminate = !!indeterminada && !marcada;
      }}
      onChange={(e) => onCambio(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      className="h-5 w-5 shrink-0 cursor-pointer accent-peligro"
    />
  );
}
