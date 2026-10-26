"use client";

import { MotionConfig } from "motion/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Idioma } from "@/i18n/config";
import { ProvedorIdioma } from "@/i18n/cliente";
import type { Dicionario } from "@/i18n/tipos";
import { AvisoArmazenamento } from "./aviso-armazenamento";

export function Provedores({ idioma, textos, children }: { idioma: Idioma; textos: Partial<Dicionario>; children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {/* reducedMotion="user": respeita prefers-reduced-motion em todas as animações do Motion. */}
      <MotionConfig reducedMotion="user">
        <ProvedorIdioma idioma={idioma} textos={textos}>
          <TooltipProvider delayDuration={200}>
            {children}
            <AvisoArmazenamento />
            <Toaster position="bottom-right" richColors closeButton />
          </TooltipProvider>
        </ProvedorIdioma>
      </MotionConfig>
    </ThemeProvider>
  );
}
