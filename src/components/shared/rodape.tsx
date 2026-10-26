"use client";

import Link from "next/link";
import { useIdioma, useTextos } from "@/i18n/cliente";
import { BotaoRestaurarDemonstracao } from "./restaurar-demonstracao";

export function Rodape() {
  const t = useTextos("comum");
  const idioma = useIdioma();
  return (
    <footer className="mt-16 border-t bg-muted/40">
      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-8 text-sm text-muted-foreground md:grid-cols-[1fr_auto]">
        <div className="space-y-1.5">
          <p>{t.rodape.aviso}</p>
          <p>{t.rodape.estimativa}</p>
          <p>{t.rodape.fontes}</p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <Link className="underline-offset-4 hover:underline" href={`/${idioma}/metodologia/`}>
            {t.rodape.metodologia}
          </Link>
          <Link className="underline-offset-4 hover:underline" href={`/${idioma}/metodologia/#licencas`}>
            {t.rodape.licencas}
          </Link>
          <BotaoRestaurarDemonstracao />
        </div>
      </div>
    </footer>
  );
}
