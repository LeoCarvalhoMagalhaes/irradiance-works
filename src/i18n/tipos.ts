import type { pt } from "./dicionarios/pt";

/** Converte literais em string, mantendo a estrutura: todos os idiomas precisam das mesmas chaves. */
type Amplo<T> = T extends string ? string : T extends readonly (infer U)[] ? readonly Amplo<U>[] : { [K in keyof T]: Amplo<T[K]> };

export type Dicionario = Amplo<typeof pt>;
