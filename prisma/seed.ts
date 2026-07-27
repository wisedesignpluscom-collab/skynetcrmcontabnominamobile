import { PrismaClient, type PipelineStage, type Deal } from "@prisma/client";
import { catalogosContables } from "./seed-catalogos-contables";

const prisma = new PrismaClient();

function daysFromNow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  // Limpiar datos previos (orden por dependencias). Los usuarios NO se tocan.
  await prisma.followUp.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.task.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.company.deleteMany();
  await prisma.pipelineStage.deleteMany();
  await prisma.catalogOption.deleteMany();

  // Catálogos configurables (el admin puede ampliarlos en /configuracion)
  // Este seed vacía CatalogOption, así que repone TODO: lo genérico del CRM y
  // los catálogos del negocio contable (municipios, régimen, tamaño, servicios).
  // «Referido» y «Sitio web» se conservan tal cual: las reglas semilla los usan
  // como condición.
  const catalogos: [string, string[]][] = [
    [
      "source",
      ["Referido de cliente", "Referido", "Contador aliado", "Sitio web", "Redes sociales", "Llamada", "Evento gremial", "Otro"],
    ],
    [
      "task_type",
      ["Llamada", "Email", "Reunión", "Solicitud de soportes", "Seguimiento", "Nota", "WhatsApp", "Otro"],
    ],
    [
      "industry",
      ["Comercio", "Servicios", "Manufactura", "Distribución", "Transporte", "Construcción", "Agropecuario", "Salud", "Educación", "Otro"],
    ],
    ...catalogosContables.filter(([categoria]) => categoria !== "industry"),
  ];
  for (const [category, labels] of catalogos) {
    for (let i = 0; i < labels.length; i++) {
      await prisma.catalogOption.create({
        data: { category, label: labels[i], order: i },
      });
    }
  }

  // Vendedor dueño de la cartera demo: el primer admin del sistema
  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  const ownerId = admin?.id ?? null;

  // Etapas del pipeline: el ciclo de venta del documento del cliente
  // (Lead → Calificación → Diagnóstico → Propuesta → Cierre).
  const stageNames: [string, string, string][] = [
    ["Lead", "#64748b", "open"],
    ["Calificación", "#3b82f6", "open"],
    ["Diagnóstico", "#8b5cf6", "open"],
    ["Propuesta", "#f59e0b", "open"],
    ["Cierre", "#f97316", "open"],
    ["Ganado", "#22c55e", "won"],
    ["Perdido", "#ef4444", "lost"],
  ];
  const stages: PipelineStage[] = [];
  for (let i = 0; i < stageNames.length; i++) {
    const [name, color, type] = stageNames[i];
    stages.push(
      await prisma.pipelineStage.create({
        data: { name, color, type, order: i },
      })
    );
  }
  const byName = (n: string) => stages.find((s) => s.name === n)!;

  // Empresas de demostración (clientes potenciales de un consultor empresarial)
  const empresas = await Promise.all(
    [
      { name: "Distribuidora Alimentos del Centro", industry: "Distribución", city: "Valencia", phone: "0241-555-1234" },
      { name: "Clínica Santa Lucía", industry: "Salud", city: "Caracas", phone: "0212-555-7890" },
      { name: "Ferretería Los Andes", industry: "Comercio", city: "San Cristóbal", phone: "0276-555-6789" },
      { name: "Transporte Carabobo Express", industry: "Logística", city: "Valencia", phone: "0241-555-9876" },
      { name: "Textiles Mérida C.A.", industry: "Manufactura", city: "Mérida", phone: "0274-555-3344" },
      { name: "Supermercados La Colina", industry: "Retail", city: "Barquisimeto", phone: "0251-555-2233" },
    ].map((data) => prisma.company.create({ data }))
  );

  // Contactos: gerentes y dueños que buscan mejorar su organización
  const contactos = await Promise.all(
    [
      { firstName: "Marianela", lastName: "Gómez", email: "mgomez@alimentosdelcentro.com", phone: "0412-555-1122", position: "Gerente General", source: "Sitio web", status: "cliente", companyId: empresas[0].id },
      { firstName: "Ricardo", lastName: "Blanco", email: "rblanco@clinicasantalucia.com", phone: "0414-555-3344", position: "Director", source: "Referido", status: "lead", companyId: empresas[1].id },
      { firstName: "Yusmary", lastName: "Rondón", email: "yrondon@ferreterialosandes.com", phone: "0424-555-5566", position: "Jefa de Administración", source: "Redes sociales", status: "lead", companyId: empresas[2].id },
      { firstName: "Henrique", lastName: "Da Silva", email: "hdasilva@carabobexpress.com", phone: "0412-555-7788", position: "Dueño", source: "Sitio web", status: "cliente", companyId: empresas[3].id },
      { firstName: "Carolina", lastName: "Paredes", email: "cparedes@textilesmerida.com", phone: "0416-555-9900", position: "Gerente de RRHH", source: "Evento", status: "lead", companyId: empresas[4].id },
      { firstName: "José", lastName: "Materán", email: "jmateran@lacolina.com", phone: "0414-555-2211", position: "Gerente de Operaciones", source: "Llamada", status: "lead", companyId: empresas[5].id },
      { firstName: "Adriana", lastName: "Sulbarán", email: "adriana.sulbaran@gmail.com", phone: "0424-555-8899", position: "Emprendedora", source: "Sitio web", status: "lead", companyId: null },
      { firstName: "Pedro", lastName: "Linares", email: "pedrolinares@hotmail.com", phone: "0412-555-6677", position: "Comerciante independiente", source: "Redes sociales", status: "lead", companyId: null },
    ].map((data) => prisma.contact.create({ data: { ...data, ownerId } }))
  );

  // Oportunidades: los servicios que vende la firma contable. El monto es el
  // honorario mensual propuesto, salvo los trabajos puntuales.
  const deals = [
    { title: "Outsourcing contable mensual", amount: 7500, stage: "Ganado", contact: 0, company: 0, status: "won", closedAt: daysFromNow(-3), probability: 100 },
    { title: "Outsourcing contable y de nómina", amount: 4800, stage: "Cierre", contact: 1, company: 1, status: "open", probability: 70, expectedCloseDate: daysFromNow(10) },
    { title: "Declaraciones de IVA y retenciones", amount: 9500, stage: "Propuesta", contact: 2, company: 2, status: "open", probability: 50, expectedCloseDate: daysFromNow(21) },
    { title: "Regularización de atrasos ante el SENIAT", amount: 3500, stage: "Ganado", contact: 3, company: 3, status: "won", closedAt: daysFromNow(-1), probability: 100 },
    { title: "Asesoría tributaria mensual", amount: 2400, stage: "Diagnóstico", contact: 4, company: 4, status: "open", probability: 30, expectedCloseDate: daysFromNow(30) },
    { title: "Contabilidad multi-sucursal", amount: 12000, stage: "Calificación", contact: 5, company: 5, status: "open", probability: 20, expectedCloseDate: daysFromNow(45) },
    { title: "Contabilidad para emprendedor", amount: 950, stage: "Lead", contact: 6, company: null, status: "open", probability: 10 },
    { title: "Constitución de empresa y registro fiscal", amount: 1800, stage: "Lead", contact: 7, company: null, status: "open", probability: 10 },
    { title: "Auditoría de inventarios", amount: 2800, stage: "Perdido", contact: 5, company: 5, status: "lost", closedAt: daysFromNow(-15), probability: 0 },
  ];

  const createdDeals: Deal[] = [];
  for (const d of deals) {
    createdDeals.push(
      await prisma.deal.create({
        data: {
          title: d.title,
          amount: d.amount,
          status: d.status,
          probability: d.probability,
          closedAt: d.closedAt ?? null,
          expectedCloseDate: d.expectedCloseDate ?? null,
          stageId: byName(d.stage).id,
          contactId: contactos[d.contact].id,
          companyId: d.company !== null ? empresas[d.company].id : null,
          ownerId,
        },
      })
    );
  }

  // Posventa para las ventas ganadas
  await prisma.followUp.create({
    data: {
      dealId: createdDeals[0].id,
      contactId: contactos[0].id,
      stage: "seguimiento",
      satisfaction: 5,
      nextContactDate: daysFromNow(5),
      notes: "Muy satisfecha con la reestructuración. Interesada en un programa de liderazgo para sus jefes de área.",
    },
  });
  await prisma.followUp.create({
    data: {
      dealId: createdDeals[3].id,
      contactId: contactos[3].id,
      stage: "onboarding",
      satisfaction: 4,
      nextContactDate: daysFromNow(2),
      notes: "Diagnóstico entregado. Agendar sesión para presentar el plan de mejoras a los coordinadores.",
    },
  });

  // Tareas pendientes
  await prisma.task.createMany({
    data: [
      { title: "Llamar a Ricardo para cerrar el programa de liderazgo", type: "Llamada", dueDate: daysFromNow(0), contactId: contactos[1].id, dealId: createdDeals[1].id },
      { title: "Enviar propuesta ajustada de rediseño de procesos", type: "Email", dueDate: daysFromNow(1), contactId: contactos[2].id, dealId: createdDeals[2].id },
      { title: "Sesión de diagnóstico con el equipo de RRHH", type: "Reunión", dueDate: daysFromNow(3), contactId: contactos[4].id, dealId: createdDeals[4].id },
      { title: "Seguimiento posventa: reestructuración administrativa", type: "Seguimiento", dueDate: daysFromNow(5), contactId: contactos[0].id, dealId: createdDeals[0].id },
      { title: "Primer contacto con lead de asesoría contable", type: "Llamada", dueDate: daysFromNow(0), contactId: contactos[6].id, dealId: createdDeals[6].id },
      { title: "Presentar plan de mejoras del diagnóstico", type: "Reunión", dueDate: daysFromNow(2), contactId: contactos[3].id, dealId: createdDeals[3].id },
      { title: "Responder consulta sobre plan de motivación", type: "Email", dueDate: daysFromNow(-1), contactId: contactos[7].id, dealId: createdDeals[7].id },
    ],
  });

  // Actividades (historial)
  await prisma.activity.createMany({
    data: [
      { type: "sistema", content: "Oportunidad ganada: Reestructuración administrativa y contable ($7.500)", contactId: contactos[0].id, dealId: createdDeals[0].id },
      { type: "Llamada", content: "Llamada con Ricardo: le interesa el programa de liderazgo pero pide incluir una sesión extra para coordinadores. Ajustar alcance.", contactId: contactos[1].id, dealId: createdDeals[1].id },
      { type: "Email", content: "Enviada propuesta de rediseño de procesos con cronograma de 12 semanas y manual de funciones incluido.", contactId: contactos[2].id, dealId: createdDeals[2].id },
      { type: "Reunión", content: "Reunión con Carolina: alta rotación de personal y roces entre producción y ventas. El taller de comunicación sería el primer paso.", contactId: contactos[4].id, dealId: createdDeals[4].id },
      { type: "Nota", content: "José mostró interés pero está cerrando el inventario anual. Retomar la próxima semana.", contactId: contactos[5].id, dealId: createdDeals[5].id },
      { type: "sistema", content: "Oportunidad ganada: Diagnóstico organizacional integral ($3.500)", contactId: contactos[3].id, dealId: createdDeals[3].id },
      { type: "Nota", content: "Lead entró por el formulario web pidiendo ayuda para ordenar la contabilidad de su emprendimiento.", contactId: contactos[6].id, dealId: createdDeals[6].id },
    ],
  });

  console.log("Base de datos poblada (nicho: consultoría empresarial):");
  console.log(`  ${stages.length} etapas de pipeline`);
  console.log(`  ${empresas.length} empresas`);
  console.log(`  ${contactos.length} contactos`);
  console.log(`  ${createdDeals.length} oportunidades`);
  console.log("  7 tareas, 7 actividades, 2 seguimientos posventa");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
