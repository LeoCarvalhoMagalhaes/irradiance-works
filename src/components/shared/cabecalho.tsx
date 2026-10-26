"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIdioma, useTextos } from "@/i18n/cliente";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { SeletorIdioma } from "./seletor-idioma";
import { SeletorTema } from "./seletor-tema";

const ROTAS = ["simulador", "monitoramento", "manutencao", "metodologia"] as const;

export function Cabecalho() {
  const t = useTextos("comum");
  const idioma = useIdioma();
  const caminho = usePathname();
  const ativo = (rota: string) => caminho.startsWith(`/${idioma}/${rota}`);

  const links = (orientacao: "horizontal" | "vertical") =>
    ROTAS.map((rota) => (
      <Link
        key={rota}
        href={`/${idioma}/${rota}/`}
        aria-current={ativo(rota) ? "page" : undefined}
        className={cn(
          "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          ativo(rota) && "bg-muted text-foreground",
          orientacao === "vertical" && "block text-base",
        )}
      >
        {t.nav[rota]}
      </Link>
    ));

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
        <Link href={`/${idioma}/`} className="flex items-center gap-2 rounded-md font-semibold tracking-tight">
          <Logo className="size-7" />
          <span>{t.marca}</span>
        </Link>
        <nav aria-label={t.navegacaoPrincipal} className="ml-4 hidden items-center gap-1 md:flex">
          {links("horizontal")}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <SeletorIdioma />
          <SeletorTema />
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label={t.abrirMenu}>
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>{t.menu}</SheetTitle>
                <SheetDescription className="sr-only">{t.navegacaoPrincipal}</SheetDescription>
              </SheetHeader>
              <nav aria-label={t.navegacaoPrincipal} className="flex flex-col gap-1 px-4">
                {links("vertical")}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
