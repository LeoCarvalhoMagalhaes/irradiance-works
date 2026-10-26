"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTextos } from "@/i18n/cliente";
import { useEstado } from "@/lib/estado";

/** Avisa uma única vez por sessão quando o armazenamento local está corrompido ou indisponível. */
export function AvisoArmazenamento() {
  const t = useTextos("comum");
  const estado = useEstado();
  const avisado = useRef(false);
  useEffect(() => {
    if (!estado || avisado.current) return;
    if (estado.situacao === "corrompido") toast.warning(t.armazenamento.corrompido, { duration: 10000 });
    if (estado.situacao === "indisponivel") toast.warning(t.armazenamento.indisponivel, { duration: 10000 });
    avisado.current = true;
  }, [estado, t]);
  return null;
}
