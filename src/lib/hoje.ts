import { chaveDiaLocal } from "@/core/util/tempo";

/** Data de referência da demonstração: hoje em America/Sao_Paulo. */
export function hojeLocal(): string {
  return chaveDiaLocal(Date.now());
}
