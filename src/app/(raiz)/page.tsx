import { IDIOMAS, LANG_HTML, NOME_IDIOMA } from "@/i18n/config";
import { RedirecionarIdioma } from "./redirecionar";

/**
 * Página "/": escolhe o idioma pela preferência salva ou pelo navegador e redireciona. Sem
 * JavaScript, a lista de idiomas continua utilizável.
 */
export default function PaginaRaiz() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-4 py-12">
      <RedirecionarIdioma />
      <h1 className="text-2xl font-semibold tracking-tight">Irradiance Works</h1>
      <p className="text-muted-foreground">Escolha o idioma · Choose your language</p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {IDIOMAS.map((idioma) => (
          <li key={idioma}>
            <a
              href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/${idioma}/`}
              lang={LANG_HTML[idioma]}
              hrefLang={LANG_HTML[idioma]}
              className="block rounded-lg border bg-card px-4 py-3 font-medium shadow-cartao transition-colors hover:bg-accent"
            >
              {NOME_IDIOMA[idioma]}
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
