// Semilla de las sub-fases de las obligaciones (Etapa 3 «Mis Consultores»):
// el checklist paso a paso tomado del Manual de Procedimientos de Gestoría
// (Venezuela), condensado a campos de evidencia real — nunca un simple
// "¿lo hiciste? Sí/No". No toca datos del CRM. Idempotente:
//
//   npx tsx prisma/seed-fases-obligaciones.ts
//
// Se apoya en las Obligacion ya sembradas por seed-obligaciones.ts (buscadas
// por nombre) y crea una nueva: "Impuesto sobre Pensiones (LPPSS) — Forma 19"
// (SENIAT, 9% patronal, mensual — dato confirmado por el cliente, no está en
// el manual). Su reglaTipo queda en "manual": el día exacto de vencimiento no
// se inventa, lo fija el analista hasta que se confirme con el cliente.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type CampoInput = {
  clave: string;
  etiqueta: string;
  tipo: "texto" | "numero" | "fecha" | "moneda" | "archivo_url" | "select";
  opciones?: string[];
  requerido: boolean;
  ayuda?: string;
  claveUnicidad?: boolean;
};

type FaseInput = {
  order: number;
  nombre: string;
  ayuda?: string;
  campos: CampoInput[];
  validacionEspecial?: string;
};

const PAGO_CAMPOS: CampoInput[] = [
  { clave: "fechaPago", etiqueta: "Fecha de pago", tipo: "fecha", requerido: true },
  { clave: "bancoReferencia", etiqueta: "Banco / referencia", tipo: "texto", requerido: true },
  { clave: "montoPagado", etiqueta: "Monto pagado", tipo: "moneda", requerido: true },
];

const ARCHIVAR_CAMPOS: CampoInput[] = [
  { clave: "comprobanteUrl", etiqueta: "Comprobante", tipo: "archivo_url", requerido: true },
];

// obligacionNombre → fases. La clave debe calzar EXACTO con Obligacion.nombre
// de seed-obligaciones.ts (o con NUEVAS_OBLIGACIONES abajo).
const FASES: Record<string, FaseInput[]> = {
  "FAOV — Ahorro habitacional (BANAVIH)": [
    {
      order: 10,
      nombre: "Cerrar nómina y calcular el 3%",
      ayuda: "2% patronal + 1% retenido sobre el salario integral de cada trabajador activo.",
      campos: [
        { clave: "trabajadoresActivos", etiqueta: "Trabajadores activos", tipo: "numero", requerido: true },
        { clave: "salarioIntegralTotal", etiqueta: "Salario integral total", tipo: "moneda", requerido: true },
        { clave: "montoPatronal", etiqueta: "Monto patronal (2%)", tipo: "moneda", requerido: true },
        { clave: "montoRetenido", etiqueta: "Monto retenido (1%)", tipo: "moneda", requerido: true },
      ],
    },
    {
      order: 20,
      nombre: "Cargar la nómina en BANAVIH EN LÍNEA",
      campos: [
        { clave: "fechaCarga", etiqueta: "Fecha de carga", tipo: "fecha", requerido: true },
        { clave: "referenciaCarga", etiqueta: "Referencia de confirmación", tipo: "texto", requerido: false },
      ],
    },
    {
      order: 30,
      nombre: "Conciliar contra el cálculo interno",
      ayuda: "Cédulas mal cargadas es el error más común: bloquea la acreditación individual.",
      campos: [
        { clave: "diferenciaEncontrada", etiqueta: "Diferencia encontrada (0 = ok)", tipo: "moneda", requerido: true },
        { clave: "cedulasRevisadas", etiqueta: "Cédulas revisadas", tipo: "numero", requerido: false },
      ],
    },
    {
      order: 40,
      nombre: "Generar la planilla de pago",
      campos: [
        { clave: "numeroPlanilla", etiqueta: "Número de planilla", tipo: "texto", requerido: true, claveUnicidad: true },
      ],
      validacionEspecial: "sin_duplicado",
    },
    { order: 50, nombre: "Cancelar en banco autorizado", campos: PAGO_CAMPOS },
    { order: 60, nombre: "Archivar soporte y reporte de nómina", campos: ARCHIVAR_CAMPOS },
  ],

  "Seguro Social Obligatorio (IVSS)": [
    {
      order: 10,
      nombre: "Revisar la facturación cargada por TIUNA",
      campos: [
        { clave: "periodoFacturado", etiqueta: "Período facturado", tipo: "texto", requerido: true },
        { clave: "montoFacturado", etiqueta: "Monto facturado por el IVSS", tipo: "moneda", requerido: true },
      ],
    },
    {
      order: 20,
      nombre: "Cotejar contra la nómina real",
      campos: [
        { clave: "trabajadoresCotejados", etiqueta: "Trabajadores cotejados", tipo: "numero", requerido: true },
        { clave: "diferenciasEncontradas", etiqueta: "Diferencias encontradas", tipo: "texto", requerido: false },
      ],
    },
    {
      order: 30,
      nombre: "Reportar novedades del mes (altas, bajas, cambios salariales)",
      campos: [{ clave: "novedadesReportadas", etiqueta: "Novedades reportadas (0 = ninguna)", tipo: "numero", requerido: true }],
    },
    {
      order: 40,
      nombre: "Descargar la factura / planilla",
      campos: [
        { clave: "numeroFactura", etiqueta: "Número de factura", tipo: "texto", requerido: true, claveUnicidad: true },
      ],
      validacionEspecial: "sin_duplicado",
    },
    { order: 50, nombre: "Cancelar en banca autorizada", campos: PAGO_CAMPOS },
    {
      order: 60,
      nombre: "Archivar comprobante (soporte de solvencia)",
      campos: ARCHIVAR_CAMPOS,
    },
  ],

  "INCES — Aporte trimestral": [
    {
      order: 10,
      nombre: "Totalizar sueldos y salarios del trimestre",
      campos: [{ clave: "totalRemuneraciones", etiqueta: "Total de remuneraciones del trimestre", tipo: "moneda", requerido: true }],
    },
    {
      order: 20,
      nombre: "Calcular el aporte del 2% (y 0,5% de utilidades si aplica)",
      campos: [
        { clave: "montoAporte2", etiqueta: "Aporte patronal (2%)", tipo: "moneda", requerido: true },
        { clave: "montoRetencionUtilidades", etiqueta: "Retención sobre utilidades (0,5%, si hubo pago)", tipo: "moneda", requerido: false },
      ],
    },
    {
      order: 30,
      nombre: "Declarar en el portal del INCES",
      campos: [
        { clave: "numeroDeclaracion", etiqueta: "Número de declaración", tipo: "texto", requerido: true, claveUnicidad: true },
      ],
      validacionEspecial: "sin_duplicado",
    },
    { order: 40, nombre: "Pagar la planilla generada", campos: PAGO_CAMPOS },
    { order: 50, nombre: "Archivar el reporte trimestral del aporte", campos: ARCHIVAR_CAMPOS },
  ],

  "IVA — Declaración y pago mensual": [
    {
      order: 10,
      nombre: "Cerrar los libros de compras y ventas del período",
      campos: [
        { clave: "debitoFiscal", etiqueta: "Débito fiscal (IVA cobrado)", tipo: "moneda", requerido: true },
        { clave: "creditoFiscal", etiqueta: "Crédito fiscal (IVA pagado)", tipo: "moneda", requerido: true },
      ],
    },
    {
      order: 20,
      nombre: "Incorporar retenciones de IVA acreditables",
      campos: [{ clave: "montoRetencionesAcreditadas", etiqueta: "Retenciones acreditadas", tipo: "moneda", requerido: false }],
    },
    {
      order: 30,
      nombre: "Declarar en el Portal Fiscal del SENIAT",
      campos: [
        { clave: "numeroDeclaracion", etiqueta: "Número de declaración", tipo: "texto", requerido: true, claveUnicidad: true },
      ],
      validacionEspecial: "sin_duplicado",
    },
    { order: 40, nombre: "Pagar el impuesto resultante", campos: PAGO_CAMPOS },
    { order: 50, nombre: "Archivar declaración y libros del período", campos: ARCHIVAR_CAMPOS },
  ],

  "ISLR — Declaración definitiva": [
    {
      order: 10,
      nombre: "Preparar la conciliación fiscal de la renta",
      campos: [{ clave: "enriquecimientoNetoGravable", etiqueta: "Enriquecimiento neto gravable", tipo: "moneda", requerido: true }],
    },
    {
      order: 20,
      nombre: "Declarar en el Portal Fiscal del SENIAT",
      campos: [
        { clave: "numeroDeclaracion", etiqueta: "Número de declaración", tipo: "texto", requerido: true, claveUnicidad: true },
      ],
      validacionEspecial: "sin_duplicado",
    },
    {
      order: 30,
      nombre: "Adjuntar comprobantes ARC de retenciones recibidas",
      campos: [{ clave: "montoRetencionesAcreditadas", etiqueta: "Retenciones acreditadas como crédito", tipo: "moneda", requerido: false }],
    },
    {
      order: 40,
      nombre: "Pagar el impuesto resultante (si aplica)",
      campos: [
        { clave: "fechaPago", etiqueta: "Fecha de pago", tipo: "fecha", requerido: false },
        { clave: "montoPagado", etiqueta: "Monto pagado", tipo: "moneda", requerido: false },
      ],
    },
    { order: 50, nombre: "Archivar la planilla de confirmación", campos: ARCHIVAR_CAMPOS },
  ],

  "Impuesto sobre Actividades Económicas": [
    {
      order: 10,
      nombre: "Determinar los ingresos brutos del período",
      campos: [{ clave: "ingresosBrutos", etiqueta: "Ingresos brutos del período", tipo: "moneda", requerido: true }],
    },
    {
      order: 20,
      nombre: "Aplicar la alícuota / verificar el mínimo tributable",
      campos: [{ clave: "montoDeterminado", etiqueta: "Monto determinado", tipo: "moneda", requerido: true }],
    },
    {
      order: 30,
      nombre: "Presentar la Declaración Jurada de Ingresos Brutos",
      campos: [
        { clave: "numeroDeclaracion", etiqueta: "Número de declaración", tipo: "texto", requerido: true, claveUnicidad: true },
      ],
      validacionEspecial: "sin_duplicado",
    },
    { order: 40, nombre: "Pagar dentro del plazo de la ordenanza", campos: PAGO_CAMPOS },
    { order: 50, nombre: "Archivar comprobante", campos: ARCHIVAR_CAMPOS },
  ],

  "Impuesto sobre Pensiones (LPPSS) — Forma 19": [
    {
      order: 10,
      nombre: "Calcular el aporte patronal (9% sobre el ingreso total)",
      ayuda: "LPPSS: 9% patronal sobre el total del ingreso del trabajador. Sin pata de retención al trabajador.",
      campos: [
        { clave: "trabajadoresActivos", etiqueta: "Trabajadores activos", tipo: "numero", requerido: true },
        { clave: "ingresoTotalConsiderado", etiqueta: "Ingreso total considerado", tipo: "moneda", requerido: true },
        { clave: "montoAporte", etiqueta: "Aporte patronal (9%)", tipo: "moneda", requerido: true },
      ],
    },
    {
      order: 20,
      nombre: "Generar la Forma 19 en el portal del SENIAT",
      campos: [
        { clave: "numeroFormulario", etiqueta: "Número de Forma 19", tipo: "texto", requerido: true, claveUnicidad: true },
      ],
      validacionEspecial: "sin_duplicado",
    },
    { order: 30, nombre: "Pagar", campos: PAGO_CAMPOS },
    { order: 40, nombre: "Archivar soporte", campos: ARCHIVAR_CAMPOS },
  ],

  // Trámite de UNA SOLA VEZ (periodicidad "unica"): constituir una empresa
  // nueva para un cliente sin RIF todavía (Etapa 3.6). Los 13 pasos son
  // literalmente el checklist de la Parte IV del manual — aquí sí conviene
  // el mismo nivel de detalle que el manual, es un trámite poco frecuente y
  // de alto riesgo si se salta un paso.
  "Apertura de empresa (SAREN)": [
    {
      order: 10,
      nombre: "Definir figura jurídica y datos societarios",
      campos: [
        {
          clave: "tipoSocietario",
          etiqueta: "Figura jurídica",
          tipo: "select",
          opciones: ["Compañía Anónima (C.A.)", "Sociedad de Responsabilidad Limitada (S.R.L.)", "Firma Personal", "Otra"],
          requerido: true,
        },
        { clave: "objetoSocial", etiqueta: "Objeto social", tipo: "texto", requerido: true },
        { clave: "capitalSocial", etiqueta: "Capital social", tipo: "moneda", requerido: true },
        { clave: "socios", etiqueta: "Socios/accionistas", tipo: "texto", requerido: true },
      ],
    },
    {
      order: 20,
      nombre: "Reservar la denominación comercial (SAREN)",
      campos: [
        { clave: "nombreReservado", etiqueta: "Nombre reservado", tipo: "texto", requerido: true },
        { clave: "numeroConstancia", etiqueta: "N° de constancia de reserva", tipo: "texto", requerido: true },
        { clave: "fechaReserva", etiqueta: "Fecha de reserva", tipo: "fecha", requerido: true },
      ],
    },
    {
      order: 30,
      nombre: "Elaborar el Acta Constitutiva y Estatutos Sociales",
      campos: [
        { clave: "abogadoResponsable", etiqueta: "Abogado colegiado responsable", tipo: "texto", requerido: true },
        { clave: "fechaElaboracion", etiqueta: "Fecha de elaboración", tipo: "fecha", requerido: false },
      ],
    },
    {
      order: 40,
      nombre: "Presentar e inscribir ante el Registro Mercantil",
      campos: [
        { clave: "montoArancel", etiqueta: "Arancel registral pagado", tipo: "moneda", requerido: true },
        { clave: "fechaProtocolizacion", etiqueta: "Fecha de protocolización", tipo: "fecha", requerido: true },
        { clave: "numeroExpediente", etiqueta: "N° de expediente/tomo", tipo: "texto", requerido: true, claveUnicidad: true },
      ],
      validacionEspecial: "sin_duplicado",
    },
    {
      order: 50,
      nombre: "Publicar el Acta Constitutiva (cuando aplique)",
      campos: [
        { clave: "diarioPublicacion", etiqueta: "Diario/periódico mercantil", tipo: "texto", requerido: false },
        { clave: "fechaPublicacion", etiqueta: "Fecha de publicación", tipo: "fecha", requerido: false },
      ],
    },
    {
      order: 60,
      nombre: "Sellar los libros legales",
      ayuda: "Libro Diario, Mayor, Inventarios, Accionistas/Socios, Actas de Asamblea.",
      campos: [
        { clave: "fechaSellado", etiqueta: "Fecha de sellado", tipo: "fecha", requerido: true },
        { clave: "librosSellados", etiqueta: "Libros sellados", tipo: "texto", requerido: true },
      ],
    },
    {
      order: 70,
      nombre: "Abrir la cuenta bancaria empresarial",
      campos: [
        { clave: "banco", etiqueta: "Banco", tipo: "texto", requerido: true },
        { clave: "numeroCuenta", etiqueta: "Número de cuenta", tipo: "texto", requerido: true },
        { clave: "fechaAperturaCuenta", etiqueta: "Fecha de apertura", tipo: "fecha", requerido: false },
      ],
    },
    {
      order: 80,
      nombre: "Tramitar el RIF ante el SENIAT",
      ayuda: "Máx. 30 días desde la constitución. Se valida el formato y que no esté repetido.",
      campos: [
        { clave: "rif", etiqueta: "RIF asignado", tipo: "texto", requerido: true },
        { clave: "fechaEmisionRif", etiqueta: "Fecha de emisión", tipo: "fecha", requerido: false },
      ],
      validacionEspecial: "rif_valido",
    },
    {
      order: 90,
      nombre: "Registro patronal ante el IVSS (Sistema TIUNA)",
      campos: [{ clave: "numeroPatronalIvss", etiqueta: "Número patronal IVSS", tipo: "texto", requerido: true, claveUnicidad: true }],
      validacionEspecial: "sin_duplicado",
    },
    {
      order: 100,
      nombre: "Registro ante BANAVIH (FAOV en línea)",
      campos: [{ clave: "usuarioPatronalFaov", etiqueta: "Usuario patronal FAOV", tipo: "texto", requerido: true, claveUnicidad: true }],
      validacionEspecial: "sin_duplicado",
    },
    {
      order: 110,
      nombre: "Registro ante el INCES",
      campos: [{ clave: "numeroAportanteInces", etiqueta: "Número de aportante INCES", tipo: "texto", requerido: true, claveUnicidad: true }],
      validacionEspecial: "sin_duplicado",
    },
    {
      order: 120,
      nombre: "Registro de la entidad de trabajo ante el MINTRA (RNET)",
      campos: [{ clave: "constanciaRnet", etiqueta: "Constancia de inscripción RNET", tipo: "texto", requerido: true }],
    },
    {
      order: 130,
      nombre: "Licencia de Actividades Económicas (municipal)",
      campos: [
        { clave: "municipioLicencia", etiqueta: "Municipio", tipo: "texto", requerido: true },
        { clave: "numeroLicencia", etiqueta: "N° de licencia", tipo: "texto", requerido: true, claveUnicidad: true },
        { clave: "vigenciaLicencia", etiqueta: "Vigencia", tipo: "fecha", requerido: false },
      ],
      validacionEspecial: "sin_duplicado",
    },
  ],
};

// Obligaciones que no vienen de seed-obligaciones.ts — se crean aquí si faltan.
const NUEVAS_OBLIGACIONES = [
  {
    nombre: "Impuesto sobre Pensiones (LPPSS) — Forma 19",
    jurisdiccion: "nacional",
    periodicidad: "mensual",
    enteReceptor: "SENIAT",
    // El día exacto de vencimiento no está confirmado con el cliente todavía:
    // "manual" evita inventar una fecha (mismo criterio que el motor F2).
    reglaTipo: "manual",
    reglaParam: null,
    notas: "LPPSS. Aporte patronal 9% sobre el ingreso total del trabajador, mensual, Forma 19 en el portal del SENIAT.",
    order: 65,
  },
  {
    nombre: "Apertura de empresa (SAREN)",
    jurisdiccion: "nacional",
    // "unica" = trámite de una sola vez, no un ciclo fiscal recurrente. Nunca
    // se ofrece en el selector de PlanObligacion (empresas/[id]/page.tsx).
    periodicidad: "unica",
    enteReceptor: "SAREN",
    // Sin calendario fiscal que calcular: la fecha (si se quiere una meta) la
    // pone el analista.
    reglaTipo: "manual",
    reglaParam: null,
    notas: "Constitución de una empresa nueva: figura jurídica, SAREN, RIF y registros patronales (Parte II-IV del manual).",
    order: 5,
  },
];

async function main() {
  for (const o of NUEVAS_OBLIGACIONES) {
    const existente = await prisma.obligacion.findFirst({ where: { nombre: o.nombre } });
    if (!existente) await prisma.obligacion.create({ data: o });
  }

  let creadas = 0;
  let actualizadas = 0;
  let omitidas = 0;

  for (const [nombreObligacion, fases] of Object.entries(FASES)) {
    const obligacion = await prisma.obligacion.findFirst({ where: { nombre: nombreObligacion } });
    if (!obligacion) {
      omitidas += fases.length;
      console.warn(`⚠ No existe la obligación «${nombreObligacion}» — corre seed-obligaciones.ts primero.`);
      continue;
    }
    for (const fase of fases) {
      const existente = await prisma.obligacionFase.findFirst({
        where: { obligacionId: obligacion.id, nombre: fase.nombre },
      });
      const data = {
        obligacionId: obligacion.id,
        order: fase.order,
        nombre: fase.nombre,
        ayuda: fase.ayuda ?? null,
        campos: JSON.stringify(fase.campos),
        validacionEspecial: fase.validacionEspecial ?? null,
      };
      if (existente) {
        await prisma.obligacionFase.update({ where: { id: existente.id }, data });
        actualizadas++;
      } else {
        await prisma.obligacionFase.create({ data });
        creadas++;
      }
    }
  }

  console.log(
    `Listo: ${creadas} fases creadas, ${actualizadas} actualizadas` +
      (omitidas > 0 ? `, ${omitidas} omitidas (obligación no encontrada)` : "")
  );
  await prisma.$disconnect();
}

main();
