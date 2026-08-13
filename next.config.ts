import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy: mitiga XSS e inyección de recursos externos. Se permite
// 'unsafe-inline' porque Next inyecta estilos/scripts en línea; en desarrollo se
// añade 'unsafe-eval' (lo necesita el HMR de Turbopack). No se cargan recursos de
// terceros, y frame-ancestors 'none' impide el clickjacking.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Ignorada sobre HTTP (LAN); protege cuando se sirve por HTTPS.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  // Empaquetado para el servidor del cliente: "standalone" produce
  // .next/standalone con un server.js y SOLO las dependencias que el runtime
  // usa de verdad. Es lo que permite instalar en Windows sin node_modules
  // completo ni npm install en el servidor (ver instalador/).
  output: "standalone",
  // Oculta la cabecera "X-Powered-By: Next.js" (menos huella para atacantes)
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: {
    // Los adjuntos del chat (documento o imagen) viajan como Server Action con
    // un File en el FormData. El límite por defecto de Next es 1 MB; se sube a
    // 100 MB para igualar el máximo que acepta WhatsApp en documentos — lib/chat.ts
    // valida además el límite específico por tipo (16 MB en imágenes).
    serverActions: { bodySizeLimit: "100mb" },
  },
};

export default nextConfig;
