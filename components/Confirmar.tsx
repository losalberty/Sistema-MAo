"use client";

import { DialogoConfirmar } from "@/components/ui";

export type Pregunta = {
  titulo: string;
  mensaje: string;
  detalle?: string;
  textoOk?: string;
  tono?: "normal" | "peligro";
  onSi: () => void;
};

/**
 * Dialogo de confirmacion del propio sistema, en forma de componente.
 * Se ve igual que confirmar() de "@/components/ui"; esta version existe
 * para las pantallas que la usan como <Confirmar pregunta={...} />.
 */
export default function Confirmar({
  pregunta,
  onCerrar,
}: {
  pregunta: Pregunta | null;
  onCerrar: () => void;
}) {
  return (
    <DialogoConfirmar
      abierto={!!pregunta}
      titulo={pregunta?.titulo ?? ""}
      mensaje={pregunta?.mensaje ?? ""}
      detalle={pregunta?.detalle}
      textoSi={pregunta?.textoOk ?? "Si, continuar"}
      textoNo="No, volver"
      peligro={pregunta?.tono === "peligro"}
      onSi={() => {
        pregunta?.onSi();
        onCerrar();
      }}
      onNo={onCerrar}
    />
  );
}
