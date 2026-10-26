import type { NextConfig } from "next";

/**
 * Exportação estática para GitHub Pages. O caminho base (nome do repositório) vem de
 * NEXT_PUBLIC_BASE_PATH no build de publicação; em desenvolvimento local fica vazio.
 * As rotas com parâmetro (?id=) existem porque usinas criadas pelo usuário não podem ser
 * pré-renderizadas em uma exportação estática.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
  // 404 global multilíngue: há vários layouts raiz (um por idioma e a página de escolha de idioma).
  experimental: { globalNotFound: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
