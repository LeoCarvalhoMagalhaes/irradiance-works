"use client";

import { useEffect } from "react";
import { ehIdioma, IDIOMA_PADRAO, IDIOMAS } from "@/i18n/config";
import { lerIdiomaPreferido } from "@/lib/persistencia";

export function RedirecionarIdioma() {
  useEffect(() => {
    const salvo = lerIdiomaPreferido();
    let escolhido: string = salvo && ehIdioma(salvo) ? salvo : IDIOMA_PADRAO;
    if (!salvo) {
      for (const pref of navigator.languages ?? [navigator.language]) {
        const base = pref.toLowerCase().split("-")[0];
        if ((IDIOMAS as readonly string[]).includes(base)) {
          escolhido = base;
          break;
        }
      }
    }
    window.location.replace(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/${escolhido}/`);
  }, []);
  return null;
}
