import { prisma } from "./prisma";

// Categorías de catálogo: cada una alimenta un campo de selección del sistema
export type CatalogCategory =
  | "source"
  | "task_type"
  | "industry"
  | "municipio"
  | "regimen_tributario"
  | "tamano_empresa";

export const catalogCategories: { key: CatalogCategory; title: string; hint: string }[] = [
  {
    key: "source",
    title: "Origen del lead",
    hint: "Opciones del campo «Origen» al crear un contacto.",
  },
  {
    key: "task_type",
    title: "Tipos de tarea e interacción",
    hint: "Opciones al crear tareas y al registrar interacciones en el historial.",
  },
  {
    key: "industry",
    title: "Sectores económicos",
    hint: "Opciones del campo «Sector económico» en la ficha del cliente.",
  },
  {
    key: "municipio",
    title: "Municipios de operación",
    hint: "Municipios donde operan los clientes. Determinan las obligaciones municipales.",
  },
  {
    key: "regimen_tributario",
    title: "Regímenes tributarios",
    hint: "Clasificación del cliente ante el SENIAT (contribuyente ordinario, especial…).",
  },
  {
    key: "tamano_empresa",
    title: "Tamaño del cliente",
    hint: "Rangos de facturación estimada para segmentar la cartera.",
  },
];

export function getOptions(category: CatalogCategory) {
  return prisma.catalogOption.findMany({
    where: { category, active: true },
    orderBy: [{ order: "asc" }, { label: "asc" }],
  });
}

// Icono según el texto de la opción (tolerante a acentos y mayúsculas),
// para que las opciones nuevas del catálogo tengan un icono razonable.
export function iconFor(label: string | null | undefined): string {
  if (!label) return "📌";
  const n = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (n.includes("whatsapp")) return "💬";
  if (n.includes("llamada") || n.includes("telefon")) return "📞";
  if (n.includes("email") || n.includes("correo") || n.includes("mail")) return "✉️";
  if (n.includes("reunion") || n.includes("sesion") || n.includes("visita") || n.includes("cita")) return "🤝";
  if (n.includes("seguimiento")) return "🔄";
  if (n.includes("nota")) return "📝";
  if (n.includes("sistema")) return "⚙️";
  return "📌";
}
