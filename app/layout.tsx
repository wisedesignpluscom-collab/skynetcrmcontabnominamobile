import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nogui CRM",
  description: "CRM de ventas y posventa: del lead al cliente recurrente",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full bg-white font-sans text-slate-800">{children}</body>
    </html>
  );
}
