import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto com dimensões reservadas (evita deslocamento de layout enquanto o cliente hidrata). */
export function EsqueletoPagina({ altura = 520 }: { altura?: number }) {
  return (
    <div className="grid gap-4" aria-hidden="true">
      <Skeleton className="h-10 w-full max-w-md" />
      <Skeleton className="w-full" style={{ height: altura }} />
    </div>
  );
}
