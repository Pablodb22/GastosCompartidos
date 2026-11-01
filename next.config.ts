import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ExcelJS usa módulos de Node: se carga tal cual en el servidor, sin empaquetar.
  serverExternalPackages: ["exceljs"],
  cacheComponents: true,
  partialPrefetching: true,
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
