// Demo completa de la firma de outsourcing contable.
//
// Llena TODOS los módulos con datos coherentes entre sí: clientes con su ficha
// fiscal, contactos, pipeline, planes de servicios, casos recurrentes de varios
// períodos, servicios individuales, facturación, agenda y posventa.
//
// Las fechas límite y los cobros NO se inventan: se calculan con el motor real
// (lib/fiscal), así que la demo se comporta igual que producción.
//
//   npx tsx prisma/seed-demo-contable.ts
//
// Reemplaza los datos de demostración del CRM. NO toca usuarios, reglas,
// catálogos, obligaciones ni feriados.

import { PrismaClient } from "@prisma/client";
import { contextoFiscal, vencimientoDelPlan, periodoActual } from "../lib/fiscal/data";
import { fechaLocal } from "../lib/fiscal/vencimientos";

const prisma = new PrismaClient();

const HOY = new Date();
const dias = (n: number) => {
  const d = new Date(HOY);
  d.setDate(d.getDate() + n);
  d.setHours(12, 0, 0, 0);
  return d;
};

// Períodos: los tres cerrados anteriores y el que está en curso
function periodosRecientes(cantidad: number): string[] {
  const salida: string[] = [];
  let p = periodoActual("mensual", HOY);
  for (let i = 0; i < cantidad; i++) {
    salida.unshift(p);
    // Retroceder un mes
    const [anio, mes] = p.split("-").map(Number);
    const anterior = fechaLocal(anio, mes, 1);
    anterior.setMonth(anterior.getMonth() - 1);
    p = `${anterior.getFullYear()}-${String(anterior.getMonth() + 1).padStart(2, "0")}`;
  }
  return salida;
}

// ── Clientes de la firma ────────────────────────────────────────────────────

type ClienteSeed = {
  name: string;
  rif: string;
  industry: string;
  regimen: string;
  municipios: string;
  tamano: string;
  moneda: string;
  estado: string;
  city: string;
  phone: string;
  contadorAnterior?: string;
  // Honorario mensual del plan; 0 = sin plan (todavía es prospecto o lead)
  honorario: number;
  // Obligaciones del catálogo que cubre su plan (por nombre)
  obligaciones: string[];
  notas?: string;
};

const CLIENTES: ClienteSeed[] = [
  {
    name: "Distribuidora Alimentos del Centro C.A.",
    rif: "J-30542187-6",
    industry: "Distribución",
    regimen: "Contribuyente especial",
    municipios: "Iribarren, Palavecino",
    tamano: "Mediana ($10.000 - $50.000/mes)",
    moneda: "USD",
    estado: "activo",
    city: "Barquisimeto",
    phone: "+58 251 231 4455",
    contadorAnterior: "Despacho Meléndez & Asociados",
    honorario: 450,
    obligaciones: [
      "IVA — Sujetos pasivos especiales",
      "Retenciones de IVA",
      "Retenciones de ISLR",
      "Seguro Social Obligatorio (IVSS)",
      "FAOV — Ahorro habitacional (BANAVIH)",
      "Impuesto sobre Actividades Económicas",
    ],
    notas: "Cierra inventario el día 25; los soportes llegan tarde si no se les recuerda.",
  },
  {
    name: "Ferretería Los Andes C.A.",
    rif: "J-29876543-1",
    industry: "Comercio",
    regimen: "Contribuyente ordinario",
    municipios: "Iribarren",
    tamano: "Pequeña ($2.000 - $10.000/mes)",
    moneda: "USD",
    estado: "activo",
    city: "Barquisimeto",
    phone: "+58 251 442 1180",
    honorario: 280,
    obligaciones: [
      "IVA — Declaración y pago mensual",
      "Retenciones de ISLR",
      "Seguro Social Obligatorio (IVSS)",
      "Impuesto sobre Actividades Económicas",
    ],
  },
  {
    name: "Clínica Santa Lucía C.A.",
    rif: "J-31204567-8",
    industry: "Salud",
    regimen: "Contribuyente especial",
    municipios: "Iribarren",
    tamano: "Grande (más de $50.000/mes)",
    moneda: "USD",
    estado: "activo",
    city: "Barquisimeto",
    phone: "+58 251 254 7788",
    contadorAnterior: "Contabilidad interna",
    honorario: 900,
    obligaciones: [
      "IVA — Sujetos pasivos especiales",
      "Retenciones de IVA",
      "Retenciones de ISLR",
      "Seguro Social Obligatorio (IVSS)",
      "FAOV — Ahorro habitacional (BANAVIH)",
      "INCES — Aporte trimestral",
      "Impuesto sobre Actividades Económicas",
    ],
    notas: "Nómina de 140 personas. La revisión de IVSS la valida siempre el supervisor.",
  },
  {
    name: "Transporte Carabobo Express C.A.",
    rif: "J-40118822-3",
    industry: "Transporte",
    regimen: "Contribuyente ordinario",
    municipios: "Palavecino, Crespo",
    tamano: "Mediana ($10.000 - $50.000/mes)",
    moneda: "Bs",
    estado: "activo",
    city: "Cabudare",
    phone: "+58 251 262 3390",
    honorario: 12500,
    obligaciones: [
      "IVA — Declaración y pago mensual",
      "Retenciones de ISLR",
      "Seguro Social Obligatorio (IVSS)",
      "FAOV — Ahorro habitacional (BANAVIH)",
    ],
    notas: "Factura en bolívares por decisión del cliente.",
  },
  {
    name: "Textiles Mérida C.A.",
    rif: "J-28445901-7",
    industry: "Manufactura",
    regimen: "Contribuyente ordinario",
    municipios: "Iribarren, Torres",
    tamano: "Pequeña ($2.000 - $10.000/mes)",
    moneda: "USD",
    estado: "activo",
    city: "Barquisimeto",
    phone: "+58 251 715 2204",
    honorario: 320,
    obligaciones: [
      "IVA — Declaración y pago mensual",
      "Retenciones de ISLR",
      "Seguro Social Obligatorio (IVSS)",
      "Impuesto sobre Actividades Económicas",
    ],
  },
  {
    name: "Supermercados La Colina C.A.",
    rif: "J-30991244-0",
    industry: "Comercio",
    regimen: "Contribuyente especial",
    municipios: "Iribarren, Palavecino, Jiménez",
    tamano: "Grande (más de $50.000/mes)",
    moneda: "USD",
    estado: "activo",
    city: "Barquisimeto",
    phone: "+58 251 446 9012",
    contadorAnterior: "Lic. Ramón Perdomo",
    honorario: 1100,
    obligaciones: [
      "IVA — Sujetos pasivos especiales",
      "Retenciones de IVA",
      "Retenciones de ISLR",
      "Seguro Social Obligatorio (IVSS)",
      "FAOV — Ahorro habitacional (BANAVIH)",
      "INCES — Aporte trimestral",
      "Impuesto sobre Actividades Económicas",
    ],
    notas: "Tres sucursales; consolidan el IVA en la casa matriz.",
  },
  {
    name: "Agropecuaria El Tocuyo S.A.",
    rif: "J-31556677-4",
    industry: "Agropecuario",
    regimen: "Contribuyente ordinario",
    municipios: "Morán, Torres",
    tamano: "Mediana ($10.000 - $50.000/mes)",
    moneda: "USD",
    estado: "activo",
    city: "El Tocuyo",
    phone: "+58 253 663 1145",
    honorario: 380,
    obligaciones: [
      "IVA — Declaración y pago mensual",
      "Retenciones de ISLR",
      "Seguro Social Obligatorio (IVSS)",
      "FAOV — Ahorro habitacional (BANAVIH)",
    ],
  },
  {
    name: "Constructora Lara 2000 C.A.",
    rif: "J-29334455-9",
    industry: "Construcción",
    regimen: "Contribuyente especial",
    municipios: "Iribarren, Palavecino",
    tamano: "Grande (más de $50.000/mes)",
    moneda: "USD",
    estado: "activo",
    city: "Barquisimeto",
    phone: "+58 251 233 8877",
    honorario: 750,
    obligaciones: [
      "IVA — Sujetos pasivos especiales",
      "Retenciones de IVA",
      "Retenciones de ISLR",
      "Seguro Social Obligatorio (IVSS)",
      "FAOV — Ahorro habitacional (BANAVIH)",
      "INCES — Aporte trimestral",
    ],
    notas: "Obra pública: exigen solvencias al día para cada valuación.",
  },
  {
    name: "Farmacia Vida Plena C.A.",
    rif: "J-40667788-2",
    industry: "Salud",
    regimen: "Contribuyente ordinario",
    municipios: "Iribarren",
    tamano: "Micro (hasta $2.000/mes)",
    moneda: "USD",
    estado: "activo",
    city: "Barquisimeto",
    phone: "+58 251 251 6633",
    honorario: 190,
    obligaciones: [
      "IVA — Declaración y pago mensual",
      "Seguro Social Obligatorio (IVSS)",
      "Impuesto sobre Actividades Económicas",
    ],
  },
  {
    name: "Inversiones Río Claro C.A.",
    rif: "J-41223344-5",
    industry: "Servicios",
    regimen: "Contribuyente ordinario",
    municipios: "Iribarren",
    tamano: "Pequeña ($2.000 - $10.000/mes)",
    moneda: "USD",
    estado: "activo",
    city: "Barquisimeto",
    phone: "+58 251 808 2211",
    honorario: 240,
    obligaciones: ["IVA — Declaración y pago mensual", "Retenciones de ISLR"],
    notas: "Cliente nuevo: plan pausado hasta que entreguen la contabilidad anterior.",
  },
  // ── Sin plan todavía: el pipeline en marcha ──
  {
    name: "Panadería Trigo de Oro C.A.",
    rif: "J-42556677-1",
    industry: "Comercio",
    regimen: "Contribuyente ordinario",
    municipios: "Palavecino",
    tamano: "Micro (hasta $2.000/mes)",
    moneda: "USD",
    estado: "prospecto",
    city: "Cabudare",
    phone: "+58 251 262 7744",
    honorario: 0,
    obligaciones: [],
    notas: "Pidió propuesta por contabilidad + nómina de 8 empleados.",
  },
  {
    name: "Automotriz del Centro C.A.",
    rif: "J-30778899-3",
    industry: "Comercio",
    regimen: "Contribuyente especial",
    municipios: "Iribarren",
    tamano: "Mediana ($10.000 - $50.000/mes)",
    moneda: "USD",
    estado: "prospecto",
    city: "Barquisimeto",
    phone: "+58 251 442 5566",
    contadorAnterior: "Lic. Yajaira Colmenárez",
    honorario: 0,
    obligaciones: [],
    notas: "Viene de un contador que se jubiló. Urgente: tiene atrasos de IVA.",
  },
  {
    name: "Servicios Industriales Yaracuy C.A.",
    rif: "J-31889900-6",
    industry: "Servicios",
    regimen: "Contribuyente ordinario",
    municipios: "Urdaneta",
    tamano: "Pequeña ($2.000 - $10.000/mes)",
    moneda: "USD",
    estado: "lead",
    city: "Siquisique",
    phone: "+58 253 441 9922",
    honorario: 0,
    obligaciones: [],
  },
  {
    name: "Comercializadora Simón Planas C.A.",
    rif: "J-42998877-4",
    industry: "Distribución",
    regimen: "Contribuyente ordinario",
    municipios: "Simón Planas",
    tamano: "Pequeña ($2.000 - $10.000/mes)",
    moneda: "USD",
    estado: "perdido",
    city: "Sarare",
    phone: "+58 253 771 3344",
    honorario: 0,
    obligaciones: [],
    notas: "Se fue con un contador que cobra la mitad. Reintentar en seis meses.",
  },
];

// Contactos por cliente (índice del cliente → personas)
const CONTACTOS: [number, string, string, string, string][] = [
  [0, "Marisol", "Peraza", "Gerente de administración", "marisol.peraza@dalcentro.com"],
  [0, "Jesús", "Camacaro", "Analista de compras", "jcamacaro@dalcentro.com"],
  [1, "Yusmary", "Rondón", "Propietaria", "yusmary@ferrelosandes.com"],
  [2, "Dr. Alberto", "Guédez", "Director médico", "aguedez@clinicasantalucia.com"],
  [2, "Rosa", "Blanco", "Jefa de recursos humanos", "rblanco@clinicasantalucia.com"],
  [3, "Wilfredo", "Sequera", "Gerente general", "wsequera@carabobexpress.com"],
  [4, "Carmen", "Escalona", "Administradora", "carmen@textilesmerida.com"],
  [5, "Luis", "Mendoza", "Contralor", "lmendoza@lacolina.com.ve"],
  [5, "Andreína", "Suárez", "Coordinadora de nómina", "asuarez@lacolina.com.ve"],
  [6, "Pedro", "Álvarez", "Gerente de finanzas", "palvarez@agroeltocuyo.com"],
  [7, "Ing. Rafael", "Terán", "Director de obra", "rteran@constructoralara.com"],
  [8, "Nubia", "Rojas", "Regente farmacéutica", "nrojas@vidaplena.com"],
  [9, "Gustavo", "Linárez", "Socio", "glinarez@rioclaro.com"],
  [10, "Elena", "Pacheco", "Propietaria", "elena@trigodeoro.com"],
  [11, "Óscar", "Colmenares", "Gerente administrativo", "ocolmenares@automotrizcentro.com"],
  [12, "Freddy", "Aguilar", "Encargado", "faguilar@siyaracuy.com"],
  [13, "Zulay", "Barrios", "Administradora", "zbarrios@simonplanas.com"],
];

// Leads sueltos, sin empresa registrada todavía
const LEADS: [string, string, string, string, string][] = [
  ["Ramón", "Giménez", "ramon.gimenez@gmail.com", "Referido", "Tiene una bodega; pregunta por el RIF y el timbre fiscal."],
  ["Katiuska", "Mendez", "kmendez@outlook.com", "Sitio web", "Emprendimiento de cosméticos, quiere formalizarse."],
  ["Douglas", "Sivira", "dsivira@gmail.com", "Contador aliado", "Lo refiere un colega que no lleva contribuyentes especiales."],
  ["Mariana", "Ojeda", "mariana.ojeda@gmail.com", "Evento gremial", "Conocida en la feria de Fedecámaras Lara."],
];

async function main() {
  console.log("Limpiando la demo anterior del CRM…");
  // Solo datos de demostración: usuarios, reglas, catálogos, obligaciones,
  // calendario y feriados quedan intactos.
  await prisma.facturacion.deleteMany();
  await prisma.casoRecurrente.deleteMany();
  await prisma.planObligacion.deleteMany();
  await prisma.planServicio.deleteMany();
  await prisma.servicioIndividual.deleteMany();
  await prisma.followUp.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.task.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.company.deleteMany();
  await prisma.notification.deleteMany();

  const usuarios = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  const gerente = usuarios.find((u) => u.role === "admin") ?? usuarios[0];
  const supervisores = usuarios.filter((u) => u.role === "supervisor");
  const analistas = usuarios.filter((u) => u.role === "vendedor");
  // La cartera se reparte entre los analistas. Si la instalación tiene uno solo
  // (o ninguno), se suman los supervisores para que la demo muestre varias
  // carteras y el filtro por analista tenga sentido.
  const cartera =
    analistas.length >= 2 ? analistas : [...analistas, ...supervisores, gerente].filter(Boolean);
  const supervisor = supervisores[0] ?? gerente;

  const obligaciones = await prisma.obligacion.findMany({ where: { active: true } });
  const obligacionPorNombre = new Map(obligaciones.map((o) => [o.nombre, o]));
  if (obligaciones.length === 0) {
    console.warn("⚠ No hay obligaciones en el catálogo: corre antes prisma/seed-obligaciones.ts");
  }

  const stages = await prisma.pipelineStage.findMany({ orderBy: { order: "asc" } });
  const stagePorNombre = (n: string) => stages.find((s) => s.name === n) ?? stages[0];

  // ── Calendario del SENIAT (SOLO PARA LA DEMO) ─────────────────────────────
  // Sin él, las obligaciones «según terminación del RIF» quedarían sin fecha y
  // media demo se vería vacía. Estos días NO son la providencia real: hay que
  // reemplazarlos desde /configuracion cuando el SENIAT publique la del año.
  // Un valor por digito repetido en los 12 meses (la demo no necesita la
  // variación mes a mes de la providencia real, solo que haya fecha).
  const anioActual = HOY.getFullYear();
  const diasPorDigito = [20, 21, 22, 17, 18, 11, 12, 13, 14, 15];
  for (const obligacion of obligaciones.filter((o) => o.reglaTipo === "terminacion_rif")) {
    const yaHayCalendario = await prisma.calendarioSeniat.count({
      where: { anio: anioActual, obligacionId: obligacion.id },
    });
    if (yaHayCalendario > 0) continue;
    const quincenas = obligacion.periodicidad === "quincenal" ? [1, 2] : [0];
    for (const anio of [anioActual, anioActual + 1]) {
      for (const quincena of quincenas) {
        for (let mes = 1; mes <= 12; mes++) {
          for (let digito = 0; digito <= 9; digito++) {
            await prisma.calendarioSeniat.create({
              data: { anio, obligacionId: obligacion.id, mes, quincena, digito, diaDelMes: diasPorDigito[digito] },
            });
          }
        }
      }
    }
    console.log(
      `⚠ Calendario de EJEMPLO cargado para «${obligacion.nombre}» (${anioActual}-${anioActual + 1}) ` +
        "para que la demo muestre fechas. Reemplazarlo en /configuracion con la providencia real."
    );
  }

  // ── Clientes ──────────────────────────────────────────────────────────────
  console.log("Creando clientes…");
  const companies: Awaited<ReturnType<typeof prisma.company.create>>[] = [];
  for (let i = 0; i < CLIENTES.length; i++) {
    const c = CLIENTES[i];
    companies.push(
      await prisma.company.create({
        data: {
          name: c.name,
          rif: c.rif,
          industry: c.industry,
          regimenTributario: c.regimen,
          municipios: c.municipios,
          tamano: c.tamano,
          moneda: c.moneda,
          estadoCliente: c.estado,
          city: c.city,
          phone: c.phone,
          contadorAnterior: c.contadorAnterior ?? null,
          notes: c.notas ?? null,
          fechaCierre: c.estado === "activo" ? dias(-90 - i * 25) : null,
          analistaId: cartera[i % cartera.length].id,
          supervisorId: supervisor.id,
        },
      })
    );
  }

  // ── Contactos ─────────────────────────────────────────────────────────────
  console.log("Creando contactos…");
  const contacts: Awaited<ReturnType<typeof prisma.contact.create>>[] = [];
  for (const [idx, nombre, apellido, cargo, email] of CONTACTOS) {
    const empresa = companies[idx];
    contacts.push(
      await prisma.contact.create({
        data: {
          firstName: nombre,
          lastName: apellido,
          email,
          phone: empresa.phone,
          position: cargo,
          source: idx % 3 === 0 ? "Referido" : idx % 3 === 1 ? "Contador aliado" : "Sitio web",
          status: CLIENTES[idx].estado === "activo" ? "cliente" : "lead",
          companyId: empresa.id,
          ownerId: empresa.analistaId,
        },
      })
    );
  }
  for (const [nombre, apellido, email, origen, notas] of LEADS) {
    contacts.push(
      await prisma.contact.create({
        data: {
          firstName: nombre,
          lastName: apellido,
          email,
          source: origen,
          status: "lead",
          notes: notas,
          ownerId: cartera[contacts.length % cartera.length].id,
        },
      })
    );
  }

  // ── Pipeline ──────────────────────────────────────────────────────────────
  console.log("Creando oportunidades…");
  const dealsSeed: {
    title: string;
    amount: number;
    stage: string;
    company: number | null;
    contact: number;
    status: string;
    probability: number;
    dias?: number;
  }[] = [
    { title: "Outsourcing contable mensual", amount: 450, stage: "Ganado", company: 0, contact: 0, status: "won", probability: 100, dias: -95 },
    { title: "Outsourcing contable y nómina", amount: 900, stage: "Ganado", company: 2, contact: 3, status: "won", probability: 100, dias: -140 },
    { title: "Contabilidad multi-sucursal", amount: 1100, stage: "Ganado", company: 5, contact: 7, status: "won", probability: 100, dias: -160 },
    { title: "Outsourcing contable para constructora", amount: 750, stage: "Ganado", company: 7, contact: 10, status: "won", probability: 100, dias: -120 },
    { title: "Contabilidad y nómina de 8 empleados", amount: 260, stage: "Cierre", company: 10, contact: 13, status: "open", probability: 80, dias: 7 },
    { title: "Regularización de atrasos + outsourcing", amount: 620, stage: "Cierre", company: 11, contact: 14, status: "open", probability: 70, dias: 12 },
    { title: "Declaraciones de IVA y retenciones", amount: 310, stage: "Propuesta", company: 12, contact: 15, status: "open", probability: 50, dias: 21 },
    { title: "Asesoría tributaria mensual", amount: 200, stage: "Propuesta", company: null, contact: 18, status: "open", probability: 45, dias: 25 },
    { title: "Contabilidad para emprendedor", amount: 150, stage: "Diagnóstico", company: null, contact: 18, status: "open", probability: 30, dias: 30 },
    { title: "Constitución de empresa y registro fiscal", amount: 400, stage: "Diagnóstico", company: null, contact: 17, status: "open", probability: 35, dias: 28 },
    { title: "Outsourcing contable pyme", amount: 280, stage: "Calificación", company: null, contact: 19, status: "open", probability: 20, dias: 40 },
    { title: "Nómina y solvencias laborales", amount: 350, stage: "Calificación", company: 9, contact: 12, status: "open", probability: 25, dias: 45 },
    { title: "Contabilidad de bodega", amount: 120, stage: "Lead", company: null, contact: 16, status: "open", probability: 10, dias: 60 },
    { title: "Auditoría de inventarios", amount: 800, stage: "Perdido", company: 13, contact: 16, status: "lost", probability: 0, dias: -30 },
  ];

  const deals: Awaited<ReturnType<typeof prisma.deal.create>>[] = [];
  for (const d of dealsSeed) {
    const empresa = d.company !== null ? companies[d.company] : null;
    const contacto = contacts[d.contact];
    deals.push(
      await prisma.deal.create({
        data: {
          title: d.title,
          amount: d.amount,
          stageId: stagePorNombre(d.stage).id,
          companyId: empresa?.id ?? null,
          contactId: contacto?.id ?? null,
          ownerId: empresa?.analistaId ?? contacto?.ownerId ?? cartera[0].id,
          status: d.status,
          probability: d.probability,
          expectedCloseDate: d.status === "open" ? dias(d.dias ?? 30) : null,
          closedAt: d.status !== "open" ? dias(d.dias ?? -30) : null,
        },
      })
    );
  }

  // Una solicitud esperando al supervisor, para que la bandeja no esté vacía
  await prisma.deal.update({
    where: { id: deals[5].id },
    data: {
      pendingAction: "discount",
      pendingAmount: 520,
      pendingReason: "El cliente pide rebaja por pagar seis meses adelantados.",
      pendingAt: dias(-1),
      pendingById: cartera[0].id,
    },
  });

  // ── Planes de servicios ───────────────────────────────────────────────────
  console.log("Creando planes de servicios…");
  const planes = new Map<string, string>(); // companyId → planId
  for (let i = 0; i < CLIENTES.length; i++) {
    const c = CLIENTES[i];
    if (c.honorario <= 0) continue;
    // Río Claro (índice 9) queda pausado a propósito: la demo muestra los dos casos
    const estado = i === 9 ? "pausado" : "activo";
    const plan = await prisma.planServicio.create({
      data: {
        companyId: companies[i].id,
        honorarioMensual: c.honorario,
        moneda: c.moneda,
        estado,
        fechaInicio: dias(-90 - i * 25),
        notas: i === 2 ? "Incluye revisión de nómina quincenal." : null,
      },
    });
    planes.set(companies[i].id, plan.id);

    for (const nombre of c.obligaciones) {
      const obligacion = obligacionPorNombre.get(nombre);
      if (!obligacion) continue;
      await prisma.planObligacion.create({
        data: {
          planId: plan.id,
          obligacionId: obligacion.id,
          // Un par de clientes negociaron un día distinto al del catálogo
          diaLimiteOverride: i === 0 && nombre.startsWith("Retenciones de ISLR") ? 12 : null,
        },
      });
    }
  }

  // ── Casos recurrentes: cuatro períodos ────────────────────────────────────
  console.log("Abriendo casos de los últimos períodos…");
  const periodos = periodosRecientes(4);
  const ctxPorAnio = new Map<number, Awaited<ReturnType<typeof contextoFiscal>>>();
  let casosCreados = 0;

  for (const [indice, periodo] of periodos.entries()) {
    const esPeriodoEnCurso = indice === periodos.length - 1;
    const anio = Number(periodo.slice(0, 4));
    if (!ctxPorAnio.has(anio)) ctxPorAnio.set(anio, await contextoFiscal(anio));
    const ctx = ctxPorAnio.get(anio)!;

    for (let i = 0; i < CLIENTES.length; i++) {
      const planId = planes.get(companies[i].id);
      if (!planId) continue;
      const plan = await prisma.planServicio.findUnique({
        where: { id: planId },
        include: { obligaciones: { include: { obligacion: true } } },
      });
      if (!plan || plan.estado !== "activo") continue;

      for (const po of plan.obligaciones) {
        // Las quincenales y trimestrales usan su propio período
        const p =
          po.obligacion.periodicidad === "quincenal"
            ? `${periodo}-Q2`
            : po.obligacion.periodicidad === "trimestral" && !periodo.endsWith("-03") && !periodo.endsWith("-06") && !periodo.endsWith("-09") && !periodo.endsWith("-12")
              ? null
              : periodo;
        if (!p) continue;

        const v = vencimientoDelPlan(ctx, po.obligacion, po.diaLimiteOverride, p, companies[i].rif);

        // Estado según la antigüedad del período y algo de variedad realista
        let estado = "presentado";
        let fechaPresentacion: Date | null = null;
        let causaAtraso: string | null = null;
        if (esPeriodoEnCurso) {
          const r = (i + po.obligacion.nombre.length) % 5;
          estado = r === 0 ? "en_revision" : r === 1 ? "en_proceso" : r === 2 ? "en_proceso" : "pendiente_cliente";
        } else if (indice === periodos.length - 2 && (i + po.obligacion.nombre.length) % 7 === 0) {
          // Un puñado del mes pasado quedó sin presentar
          estado = "vencido";
          causaAtraso = "cliente";
        } else {
          fechaPresentacion = v.fecha ? new Date(v.fecha.getTime() - 86_400_000) : dias(-40);
        }

        await prisma.casoRecurrente.create({
          data: {
            companyId: companies[i].id,
            obligacionId: po.obligacionId,
            periodoFiscal: p,
            fechaLimite: v.fecha,
            estado,
            analistaId: companies[i].analistaId,
            supervisorId: companies[i].supervisorId,
            fechaSolicitudSoportes: v.fecha ? new Date(v.fecha.getTime() - 12 * 86_400_000) : null,
            fechaRecepcionCompleta:
              estado === "pendiente_cliente" ? null : v.fecha ? new Date(v.fecha.getTime() - 6 * 86_400_000) : null,
            fechaPresentacion,
            evidenciaUrl: fechaPresentacion
              ? `https://declaraciones.seniat.gob.ve/comprobante/${companies[i].rif?.replace(/-/g, "")}-${p}`
              : null,
            causaAtraso,
          },
        });
        casosCreados++;
      }
    }
  }

  // ── Servicios individuales ────────────────────────────────────────────────
  console.log("Creando servicios individuales…");
  const serviciosSeed: [number, string, string, number, string, number][] = [
    [11, "Regularización de atrasos", "Doce meses de IVA sin declarar", 1800, "en_ejecucion", -20],
    [2, "Auditoría", "Auditoría de nómina y pasivos laborales", 2400, "entregado", -8],
    [5, "Declaración especial", "Declaración informativa de precios de transferencia", 1500, "aprobado", 15],
    [7, "Trámite ante alcaldía", "Renovación de licencia de actividades económicas", 450, "facturado", -35],
    [0, "Asesoría tributaria", "Revisión de retenciones de IVA del ejercicio", 600, "cotizado", 25],
    [10, "Constitución de empresa", "Registro mercantil y RIF de la sociedad", 750, "en_ejecucion", 10],
    [3, "Registro ante el SENIAT", "Actualización de datos y domicilio fiscal", 220, "entregado", -3],
    [8, "Asesoría tributaria", "Plan de pagos por deuda de IVA", 380, "cotizado", 18],
  ];
  for (const [idx, tipo, descripcion, monto, estado, offset] of serviciosSeed) {
    await prisma.servicioIndividual.create({
      data: {
        companyId: companies[idx].id,
        tipo,
        descripcion,
        montoCotizado: monto,
        moneda: companies[idx].moneda,
        estado,
        responsableId: companies[idx].analistaId,
        fechaEntrega: dias(offset),
      },
    });
  }

  // ── Facturación ───────────────────────────────────────────────────────────
  console.log("Emitiendo la facturación de los períodos…");
  let facturas = 0;
  for (const [indice, periodo] of periodos.entries()) {
    const esPeriodoEnCurso = indice === periodos.length - 1;
    for (let i = 0; i < CLIENTES.length; i++) {
      const planId = planes.get(companies[i].id);
      if (!planId) continue;
      const plan = await prisma.planServicio.findUnique({ where: { id: planId } });
      if (!plan || plan.estado !== "activo" || plan.honorarioMensual <= 0) continue;

      // Lo viejo está cobrado; el mes en curso, pendiente; y un par vencidas
      const estadoPago = esPeriodoEnCurso ? "pendiente" : indice === periodos.length - 2 && i % 4 === 0 ? "vencido" : "pagado";
      const emision = fechaLocal(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)), 1);
      emision.setMonth(emision.getMonth() + 1);

      await prisma.facturacion.create({
        data: {
          companyId: companies[i].id,
          tipo: "honorario_fijo",
          origenId: plan.id,
          concepto: `Honorario mensual · ${periodo}`,
          monto: plan.honorarioMensual,
          moneda: plan.moneda,
          periodo,
          estadoPago,
          fechaEmision: emision,
          fechaPago: estadoPago === "pagado" ? new Date(emision.getTime() + 9 * 86_400_000) : null,
        },
      });
      facturas++;
    }
  }
  // Los servicios entregados o facturados también tienen su cobro
  const serviciosCobrables = await prisma.servicioIndividual.findMany({
    where: { estado: { in: ["entregado", "facturado"] } },
  });
  for (const s of serviciosCobrables) {
    await prisma.facturacion.create({
      data: {
        companyId: s.companyId,
        tipo: "servicio_individual",
        origenId: s.id,
        concepto: s.descripcion ? `${s.tipo} · ${s.descripcion}` : s.tipo,
        monto: s.montoCotizado,
        moneda: s.moneda,
        periodo: periodoActual("mensual", HOY),
        estadoPago: s.estado === "facturado" ? "pagado" : "pendiente",
        fechaEmision: dias(-5),
        fechaPago: s.estado === "facturado" ? dias(-2) : null,
      },
    });
    facturas++;
  }

  // ── Agenda ────────────────────────────────────────────────────────────────
  console.log("Creando tareas y actividades…");
  // Se referencian por apellido para que la tarea quede con la persona correcta
  const contactoPorApellido = (a: string) => contacts.find((c) => c.lastName === a);
  const tareasSeed: [string, string, string, number, boolean, boolean][] = [
    ["Peraza", "Pedir soportes de julio a Distribuidora", "Solicitud de soportes", 1, false, false],
    ["Blanco", "Revisar nómina de la clínica con RRHH", "Reunión", 2, true, false],
    ["Colmenares", "Llamar a Automotriz por los atrasos de IVA", "Llamada", 0, true, false],
    ["Pacheco", "Enviar propuesta a Panadería Trigo de Oro", "Email", 1, false, false],
    ["Sequera", "Conciliar retenciones de Carabobo Express", "Seguimiento", 3, false, false],
    ["Terán", "Visita a Constructora Lara por solvencias", "Reunión", 4, true, false],
    ["Rondón", "Confirmar pago del honorario de julio", "Llamada", -1, true, true],
    ["Suárez", "Cargar comprobante de IVSS de La Colina", "Seguimiento", -2, false, true],
    ["Rojas", "Cerrar declaración de IVA de Farmacia", "Seguimiento", -3, false, true],
    ["Mendoza", "Preparar informe de INCES del trimestre", "Nota", 6, false, false],
    ["Escalona", "Recordatorio: FAOV de Textiles Mérida", "Solicitud de soportes", 2, false, false],
    ["Colmenares", "Reunión de cierre con Automotriz del Centro", "Reunión", 5, true, false],
    ["Álvarez", "Revisar retenciones de Agropecuaria El Tocuyo", "Seguimiento", 8, false, false],
    ["Guédez", "Presentar informe trimestral de INCES", "Reunión", 9, true, false],
    ["Camacaro", "Solicitar facturas de compra pendientes", "Llamada", 2, true, false],
  ];
  for (const [i, [apellido, titulo, tipo, offset, conHora, hecha]] of tareasSeed.entries()) {
    const contacto = contactoPorApellido(apellido);
    const fecha = dias(offset);
    // Reparte las citadas entre las 8 y las 16 para que la agenda se vea poblada
    if (conHora) fecha.setHours(8 + (i % 8), 0, 0, 0);
    await prisma.task.create({
      data: {
        title: titulo,
        type: tipo,
        dueDate: fecha,
        hasTime: conHora,
        durationMin: conHora ? 60 : null,
        done: hecha,
        completedAt: hecha ? dias(offset) : null,
        ownerId: contacto?.ownerId ?? cartera[0].id,
        contactId: contacto?.id ?? null,
      },
    });
  }

  const actividadesSeed: [string, string, string][] = [
    ["Peraza", "llamada", "Se le recordó a Marisol el envío de las facturas de compra del período."],
    ["Peraza", "sistema", "IVA de sujetos pasivos especiales presentado ante el SENIAT."],
    ["Guédez", "reunion", "Reunión con el director médico: evalúan ampliar el servicio a nómina completa."],
    ["Blanco", "email", "Enviado el resumen de retenciones del mes a Rosa Blanco."],
    ["Mendoza", "nota", "El contralor pidió consolidar el IVA de las tres sucursales en la casa matriz."],
    ["Terán", "llamada", "Ing. Terán solicita las solvencias al día para la valuación de obra."],
    ["Pacheco", "email", "Enviada la propuesta de contabilidad + nómina para 8 empleados."],
    ["Colmenares", "llamada", "Óscar confirma que tiene doce meses de IVA sin declarar. Urgente."],
    ["Giménez", "nota", "Lead referido por un colega: solo necesita RIF y timbre fiscal."],
    ["Rondón", "sistema", "Retenciones de ISLR presentadas dentro del plazo."],
    ["Suárez", "nota", "Andreína envió la nómina quincenal completa y a tiempo."],
    ["Rojas", "llamada", "Nubia consulta por el régimen simplificado; se le explicó que no aplica."],
    ["Álvarez", "nota", "Pedro pide adelantar el cierre para la asamblea de socios."],
    ["Sequera", "email", "Enviadas las planillas de FAOV del período."],
    ["Linárez", "nota", "Pendiente que entreguen la contabilidad del contador anterior."],
  ];
  for (const [apellido, tipo, contenido] of actividadesSeed) {
    await prisma.activity.create({
      data: { type: tipo, content: contenido, contactId: contactoPorApellido(apellido)?.id ?? null },
    });
  }

  // ── Posventa ──────────────────────────────────────────────────────────────
  console.log("Creando seguimiento de posventa…");
  const ganadas = deals.filter((d) => d.status === "won");
  // Cuatro perfiles distintos para que el semáforo de salud muestre sus bandas:
  // al día, en seguimiento, con el contacto vencido y en riesgo real.
  const perfiles: { stage: string; satisfaction: number; proximo: number; notas: string }[] = [
    { stage: "fidelizado", satisfaction: 5, proximo: 7, notas: "Cliente conforme; renovó el plan sin objeciones." },
    { stage: "seguimiento", satisfaction: 4, proximo: 12, notas: "Todo en orden. Evalúan sumar el servicio de nómina." },
    { stage: "onboarding", satisfaction: 3, proximo: -12, notas: "Aún no terminan de entregar la contabilidad anterior; hay que insistir." },
    { stage: "riesgo", satisfaction: 2, proximo: -45, notas: "Se quejó por el atraso en la declaración de IVA del mes pasado. Contacto vencido hace más de un mes." },
  ];
  for (const [i, deal] of ganadas.entries()) {
    if (!deal.contactId) continue;
    const perfil = perfiles[i % perfiles.length];
    await prisma.followUp.create({
      data: {
        dealId: deal.id,
        contactId: deal.contactId,
        stage: perfil.stage,
        satisfaction: perfil.satisfaction,
        nextContactDate: dias(perfil.proximo),
        notes: perfil.notas,
      },
    });
    // La cuenta en riesgo además lleva tiempo sin interacción registrada
    if (perfil.stage === "riesgo") {
      await prisma.activity.updateMany({
        where: { contactId: deal.contactId },
        data: { createdAt: dias(-115) },
      });
    }
  }

  // Health Score de la cartera: se calcula con el motor real, no a mano
  const { recomputeAllHealth } = await import("../lib/health");
  const conSalud = await recomputeAllHealth();
  console.log(`Salud de la cartera calculada para ${conSalud} cuentas.`);

  // ── Campanita ─────────────────────────────────────────────────────────────
  await prisma.notification.createMany({
    data: [
      { title: "🧾 Factura emitida: Clínica Santa Lucía C.A.", body: "Honorario mensual · 900 USD", url: "/facturacion" },
      { title: "🚨 Vencido: Retenciones de ISLR de Textiles Mérida C.A.", body: "El período venció sin presentarse.", url: "/casos" },
      { title: "👀 Por revisar: IVA de Supermercados La Colina C.A.", body: "Listo para revisión del supervisor.", url: "/casos" },
      { title: "📄 Faltan soportes: Distribuidora Alimentos del Centro C.A.", body: "Vence en menos de diez días.", url: "/casos" },
    ],
  });

  // ── Resumen ───────────────────────────────────────────────────────────────
  const [nCompanies, nContacts, nDeals, nPlanes, nCasos, nServicios, nFacturas, nTareas] =
    await Promise.all([
      prisma.company.count(),
      prisma.contact.count(),
      prisma.deal.count(),
      prisma.planServicio.count(),
      prisma.casoRecurrente.count(),
      prisma.servicioIndividual.count(),
      prisma.facturacion.count(),
      prisma.task.count(),
    ]);

  console.log("\n── Demo contable lista ──────────────────────────────");
  console.log(`  Clientes:              ${nCompanies}`);
  console.log(`  Contactos:             ${nContacts}`);
  console.log(`  Oportunidades:         ${nDeals}`);
  console.log(`  Planes de servicios:   ${nPlanes}`);
  console.log(`  Casos (${periodos.join(", ")}): ${nCasos}`);
  console.log(`  Servicios individuales:${nServicios}`);
  console.log(`  Facturas:              ${nFacturas}`);
  console.log(`  Tareas:                ${nTareas}`);
  console.log(`  Casos creados en esta corrida: ${casosCreados} · facturas: ${facturas}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
