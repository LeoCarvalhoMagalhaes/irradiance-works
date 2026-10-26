"use client";

import { Check, Languages } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { type Idioma, IDIOMAS, LANG_HTML, NOME_IDIOMA } from "@/i18n/config";
import { useIdioma, useTextos } from "@/i18n/cliente";
import { gravarIdiomaPreferido } from "@/lib/persistencia";

/** Troca de idioma preservando a página e os parâmetros (por exemplo, ?id= da usina). */
export function SeletorIdioma() {
  const t = useTextos("comum");
  const atual = useIdioma();
  const caminho = usePathname();
  const roteador = useRouter();

  const trocar = (novo: Idioma) => {
    gravarIdiomaPreferido(novo);
    const resto = caminho.replace(new RegExp(`^/${atual}(?=/|$)`), "");
    roteador.push(`/${novo}${resto || "/"}${window.location.search}${window.location.hash}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`${t.idioma}: ${NOME_IDIOMA[atual]}`}>
          <Languages />
          <span className="hidden sm:inline">{NOME_IDIOMA[atual]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t.idioma}</DropdownMenuLabel>
        {IDIOMAS.map((idioma) => (
          <DropdownMenuItem key={idioma} lang={LANG_HTML[idioma]} onSelect={() => trocar(idioma)} aria-current={idioma === atual ? "true" : undefined}>
            <Check className={idioma === atual ? "opacity-100" : "opacity-0"} aria-hidden="true" />
            {NOME_IDIOMA[idioma]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
