"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useTextos } from "@/i18n/cliente";
import { restaurarDemonstracao } from "@/lib/estado";

export function BotaoRestaurarDemonstracao() {
  const t = useTextos("comum");
  const [aberto, setAberto] = useState(false);
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="-mx-2.5 text-muted-foreground">
          <RotateCcw aria-hidden="true" /> {t.armazenamento.restaurar}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.armazenamento.restaurar}</DialogTitle>
          <DialogDescription>{t.armazenamento.restaurarConfirma}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t.acoes.cancelar}</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => {
              restaurarDemonstracao();
              setAberto(false);
              toast.success(t.armazenamento.restaurado);
            }}
          >
            {t.acoes.confirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
