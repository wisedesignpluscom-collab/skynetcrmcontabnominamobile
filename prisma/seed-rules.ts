// Seed de reglas de demostración del Automation Engine (Fase 2).
// Solo toca las tablas de reglas — los datos del CRM no se modifican.
// Ejecutar con:  npx tsx prisma/seed-rules.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.rule.deleteMany(); // la cascada limpia grupos, condiciones y acciones

  // ── FORM RULE 1 (contacto): origen Referido → notas requeridas y resaltadas ──
  const fr1 = await prisma.rule.create({
    data: {
      name: "Referidos: exigir quién lo refirió",
      description:
        "Cuando el origen del lead es Referido, las notas se vuelven obligatorias, se resaltan y se explica qué anotar.",
      module: "contact",
      trigger: "form.change",
      priority: 1,
      actions: {
        create: [
          { type: "requerir", params: JSON.stringify({ target: "notes" }), order: 1 },
          { type: "resaltar_campo", params: JSON.stringify({ target: "notes" }), order: 2 },
          {
            type: "cambiar_placeholder",
            params: JSON.stringify({ target: "notes", value: "¿Quién refirió a este contacto?" }),
            order: 3,
          },
          {
            type: "cambiar_tooltip",
            params: JSON.stringify({ target: "notes", value: "Obligatorio para leads referidos" }),
            order: 4,
          },
          {
            type: "mostrar_mensaje",
            params: JSON.stringify({
              message: "💡 Los referidos convierten mejor: anota quién lo refirió para agradecerle.",
              tone: "info",
            }),
            order: 5,
          },
        ],
      },
    },
  });
  const g1 = await prisma.ruleGroup.create({ data: { ruleId: fr1.id, operator: "AND" } });
  await prisma.ruleCondition.create({
    data: { groupId: g1.id, field: "source", op: "eq", value: "Referido" },
  });

  // ── FORM RULE 2 (contacto): si ya es cliente, avisar que entra a posventa ──
  const fr2 = await prisma.rule.create({
    data: {
      name: "Aviso al registrar directamente un cliente",
      module: "contact",
      trigger: "form.change",
      priority: 2,
      actions: {
        create: [
          {
            type: "mostrar_mensaje",
            params: JSON.stringify({
              message:
                "⚠️ Estás registrando un cliente (no un lead): asegúrate de crear también su oportunidad ganada para que entre a posventa.",
              tone: "warning",
            }),
            order: 1,
          },
        ],
      },
    },
  });
  const g2 = await prisma.ruleGroup.create({ data: { ruleId: fr2.id, operator: "AND" } });
  await prisma.ruleCondition.create({
    data: { groupId: g2.id, field: "status", op: "eq", value: "cliente" },
  });

  // ── VALIDATION RULE 1 (contacto): leads del sitio web deben traer email ──
  const vr1 = await prisma.rule.create({
    data: {
      name: "Leads del sitio web requieren email",
      module: "contact",
      trigger: "form.validate",
      priority: 1,
      actions: {
        create: [
          {
            type: "validation_error",
            params: JSON.stringify({
              message: "Los leads con origen «Sitio web» deben registrarse con su email.",
            }),
            order: 1,
          },
        ],
      },
    },
  });
  const g3 = await prisma.ruleGroup.create({ data: { ruleId: vr1.id, operator: "AND" } });
  await prisma.ruleCondition.createMany({
    data: [
      { groupId: g3.id, field: "source", op: "eq", value: "Sitio web", order: 1 },
      { groupId: g3.id, field: "email", op: "is_empty", order: 2 },
    ],
  });

  // ── VALIDATION RULE 2 (oportunidad): monto obligatorio salvo para admins ──
  const vr2 = await prisma.rule.create({
    data: {
      name: "Oportunidades con valor (excepto admin)",
      description: "Un vendedor o supervisor no puede crear oportunidades sin valor estimado.",
      module: "deal",
      trigger: "form.validate",
      priority: 1,
      actions: {
        create: [
          {
            type: "validation_error",
            params: JSON.stringify({
              message: "Indica el valor estimado de la oportunidad (solo un admin puede omitirlo).",
            }),
            order: 1,
          },
        ],
      },
    },
  });
  const g4 = await prisma.ruleGroup.create({ data: { ruleId: vr2.id, operator: "AND" } });
  // NO es admin…
  await prisma.ruleCondition.create({
    data: { groupId: g4.id, field: "", op: "has_role", value: "admin", order: 1, value2: null },
  });
  // …ups: has_role admin haría aplicar la regla A los admin. La condición correcta:
  // (monto vacío O monto <= 0) AND rol distinto de admin. Como no hay operador
  // "not_has_role", se modela con dos grupos: raíz AND [montoInválido, esVendedorOSupervisor]
  await prisma.ruleCondition.deleteMany({ where: { groupId: g4.id } });

  const montoInvalido = await prisma.ruleGroup.create({
    data: { ruleId: vr2.id, parentId: g4.id, operator: "OR", order: 1 },
  });
  await prisma.ruleCondition.createMany({
    data: [
      { groupId: montoInvalido.id, field: "amount", op: "is_empty", order: 1 },
      { groupId: montoInvalido.id, field: "amount", op: "lte", value: "0", order: 2 },
    ],
  });
  const noAdmin = await prisma.ruleGroup.create({
    data: { ruleId: vr2.id, parentId: g4.id, operator: "OR", order: 2 },
  });
  await prisma.ruleCondition.createMany({
    data: [
      { groupId: noAdmin.id, field: "", op: "has_role", value: "vendedor", order: 1 },
      { groupId: noAdmin.id, field: "", op: "has_role", value: "supervisor", order: 2 },
    ],
  });

  // ── WORKFLOW 1 (contacto): lead referido → tarea de bienvenida + aviso ──────
  const wf1 = await prisma.rule.create({
    data: {
      name: "Bienvenida a leads referidos",
      description:
        "Al crear un contacto con origen Referido: tarea de llamada de bienvenida para mañana y aviso en la campanita.",
      module: "contact",
      trigger: "contact.created",
      priority: 1,
      actions: {
        create: [
          {
            type: "crear_tarea",
            params: JSON.stringify({
              titulo: "Llamada de bienvenida a {firstName} {lastName} (referido)",
              tipo: "Llamada",
              dias: 1,
            }),
            order: 1,
          },
          {
            type: "enviar_notificacion",
            params: JSON.stringify({
              titulo: "Nuevo lead referido: {firstName} {lastName}",
              mensaje: "Se agendó la llamada de bienvenida para mañana.",
              url: "/tareas",
            }),
            order: 2,
          },
        ],
      },
    },
  });
  const gw1 = await prisma.ruleGroup.create({ data: { ruleId: wf1.id, operator: "AND" } });
  await prisma.ruleCondition.create({
    data: { groupId: gw1.id, field: "source", op: "eq", value: "Referido" },
  });

  // ── WORKFLOW 2 (oportunidad): venta ganada → aviso + email de gracias +
  //    a los 30 días, tarea de pedir referidos ────────────────────────────────
  const wf2 = await prisma.rule.create({
    data: {
      name: "Venta ganada: gracias y referidos a los 30 días",
      description:
        "Al ganar una oportunidad: aviso en la campanita, email de agradecimiento al cliente y, 30 días después, tarea para pedirle referidos.",
      module: "deal",
      trigger: "deal.won",
      priority: 1,
      actions: {
        create: [
          {
            type: "enviar_notificacion",
            params: JSON.stringify({
              titulo: "🎉 Venta ganada: {title}",
              mensaje: "Cliente: {contact.firstName} {contact.lastName} · ${amount}",
              url: "/posventa",
            }),
            order: 1,
          },
          {
            type: "enviar_email",
            params: JSON.stringify({
              para: "{contact.email}",
              asunto: "¡Gracias por confiar en nosotros, {contact.firstName}!",
              cuerpo:
                "Hola {contact.firstName}:\n\nGracias por cerrar «{title}» con nosotros. En los próximos días te contactaremos para arrancar el onboarding.\n\nUn saludo.",
            }),
            order: 2,
          },
          { type: "esperar", params: JSON.stringify({ dias: 30 }), order: 3 },
          {
            type: "crear_tarea",
            params: JSON.stringify({
              titulo: "Pedir referidos a {contact.firstName} {contact.lastName} (ganó «{title}»)",
              tipo: "Llamada",
              dias: 0,
            }),
            order: 4,
          },
        ],
      },
    },
  });
  const gw2 = await prisma.ruleGroup.create({ data: { ruleId: wf2.id, operator: "AND" } });
  await prisma.ruleCondition.create({
    data: { groupId: gw2.id, field: "contact.email", op: "not_empty" },
  });

  // ── PIPELINE RULES (Fase 5): reglas ligadas a la etapa «Negociación» ─────────
  // Si la etapa no existe (pipeline personalizado), simplemente se omiten.
  const negociacion = await prisma.pipelineStage.findFirst({
    where: { name: "Negociación", type: "open" },
  });
  if (negociacion) {
    // Requisito: no se entra a Negociación sin valor
    const pr1 = await prisma.rule.create({
      data: {
        name: "Negociación exige valor",
        description: "Una oportunidad sin valor no puede entrar a Negociación.",
        module: "deal",
        trigger: "pipeline.requisito",
        stageId: negociacion.id,
        priority: 1,
        actions: {
          create: [
            {
              type: "bloquear_movimiento",
              params: JSON.stringify({
                message:
                  "«{title}» no tiene valor asignado. Ponle un monto antes de pasarla a Negociación.",
              }),
              order: 1,
            },
          ],
        },
      },
    });
    const gp1 = await prisma.ruleGroup.create({ data: { ruleId: pr1.id, operator: "AND" } });
    await prisma.ruleCondition.create({
      data: { groupId: gp1.id, field: "amount", op: "lte", value: "0" },
    });

    // Al entrar a Negociación: aviso en la campanita
    await prisma.rule.create({
      data: {
        name: "Aviso al entrar a Negociación",
        description: "Cada oportunidad que llega a Negociación avisa en la campanita.",
        module: "deal",
        trigger: "pipeline.entrada",
        stageId: negociacion.id,
        priority: 2,
        actions: {
          create: [
            {
              type: "enviar_notificacion",
              params: JSON.stringify({
                titulo: "🤝 «{title}» entró a Negociación",
                mensaje: "Valor: ${amount} · Contacto: {contact.firstName} {contact.lastName}",
                url: "/pipeline",
              }),
              order: 1,
            },
          ],
        },
      },
    });
  }

  // ══ El loop mensual de obligaciones (F4) ═══════════════════════════════════
  // Estas cuatro reglas son el diagrama del documento del cliente, hecho de
  // datos: ninguna es lógica especial del código.

  // 1) Al presentar un caso, se abre el del período siguiente. El clon nace en
  //    «pendiente_cliente», así que no vuelve a disparar esta regla.
  await prisma.rule.create({
    data: {
      name: "Loop mensual: abrir el caso del período siguiente",
      description:
        "Al presentar una obligación ante el ente, el sistema abre el caso del período que sigue con su fecha límite ya calculada.",
      module: "caso_recurrente",
      trigger: "caso.presentado",
      priority: 1,
      actions: {
        create: [
          {
            type: "crear_registro",
            params: JSON.stringify({ entidad: "caso_recurrente" }),
            order: 1,
          },
          {
            type: "crear_registro",
            params: JSON.stringify({
              entidad: "activity",
              datos: {
                content:
                  "{obligacion.nombre} de {periodoFiscal} presentada ante {obligacion.enteReceptor}.",
              },
            }),
            order: 2,
          },
        ],
      },
    },
  });

  // 2) A diez días del vencimiento, si el cliente todavía no entregó: tarea al
  //    analista y aviso. La revisión de tiempo corre una vez por hora y no
  //    repite sobre el mismo caso antes de 24 h (ver queue.ts).
  const r2 = await prisma.rule.create({
    data: {
      name: "Pedir soportes cuando faltan 10 días",
      description:
        "Los casos que siguen esperando al cliente y vencen en diez días o menos generan una tarea de solicitud de soportes.",
      module: "caso_recurrente",
      trigger: "tiempo.transcurrido",
      priority: 2,
      actions: {
        create: [
          {
            type: "crear_tarea",
            params: JSON.stringify({
              titulo: "Pedir soportes: {obligacion.nombre} de {company.name}",
              tipo: "llamada",
              dias: 1,
              descripcion:
                "{periodoFiscal} vence el {fechaLimite}. Solicitar los soportes al cliente para poder procesar la declaración.",
            }),
            order: 1,
          },
          {
            type: "enviar_notificacion",
            params: JSON.stringify({
              titulo: "📄 Faltan soportes: {company.name}",
              mensaje: "{obligacion.nombre} de {periodoFiscal} vence el {fechaLimite}.",
              url: "/casos",
            }),
            order: 2,
          },
        ],
      },
    },
  });
  const gc2 = await prisma.ruleGroup.create({ data: { ruleId: r2.id, operator: "AND" } });
  await prisma.ruleCondition.create({
    data: { groupId: gc2.id, field: "estado", op: "eq", value: "pendiente_cliente", order: 1 },
  });
  await prisma.ruleCondition.create({
    // «dentro de los próximos 10 días» — operador de fecha relativa del evaluador
    data: { groupId: gc2.id, field: "fechaLimite", op: "relative_date", value: "10", order: 2 },
  });

  // 3) Vencido sin presentar: el supervisor se entera. El barrido del sistema es
  //    el que marca el estado; qué hacer al respecto lo decide esta regla.
  await prisma.rule.create({
    data: {
      name: "Aviso de caso vencido",
      description:
        "Cuando un caso pasa su fecha límite sin presentarse, se avisa en la campanita y queda registrado en el historial del cliente.",
      module: "caso_recurrente",
      trigger: "caso.vencido",
      priority: 3,
      actions: {
        create: [
          {
            type: "enviar_notificacion",
            params: JSON.stringify({
              titulo: "🚨 Vencido: {obligacion.nombre} de {company.name}",
              mensaje: "{periodoFiscal} venció el {fechaLimite} sin presentarse.",
              url: "/casos",
            }),
            order: 1,
          },
          {
            type: "crear_registro",
            params: JSON.stringify({
              entidad: "activity",
              datos: {
                content:
                  "VENCIDO: {obligacion.nombre} de {periodoFiscal} no se presentó a tiempo ante {obligacion.enteReceptor}.",
              },
            }),
            order: 2,
          },
        ],
      },
    },
  });

  // 4) Listo para revisar: el supervisor asignado se entera.
  await prisma.rule.create({
    data: {
      name: "Aviso al supervisor cuando un caso entra en revisión",
      description:
        "Al pasar un caso a revisión, el supervisor recibe el aviso para validarlo antes de presentarlo.",
      module: "caso_recurrente",
      trigger: "caso.en_revision",
      priority: 4,
      actions: {
        create: [
          {
            type: "enviar_notificacion",
            params: JSON.stringify({
              titulo: "👀 Por revisar: {obligacion.nombre} de {company.name}",
              mensaje: "{periodoFiscal} está listo para revisión. Vence el {fechaLimite}.",
              url: "/casos",
            }),
            order: 1,
          },
        ],
      },
    },
  });

  // ══ Facturación (F6) ═══════════════════════════════════════════════════════
  // Emitir el cobro lo hace el sistema (el dinero no depende de un interruptor);
  // avisar de él sí es decisión configurable.
  await prisma.rule.create({
    data: {
      name: "Aviso de factura emitida",
      description:
        "Cada cobro que emite el sistema deja aviso en la campanita para que cobranza lo persiga.",
      module: "facturacion",
      trigger: "factura.emitida",
      priority: 1,
      actions: {
        create: [
          {
            type: "enviar_notificacion",
            params: JSON.stringify({
              titulo: "🧾 Factura emitida: {company.name}",
              mensaje: "{concepto} · {moneda} {monto}",
              url: "/facturacion",
            }),
            order: 1,
          },
        ],
      },
    },
  });

  const total = await prisma.rule.count();
  console.log(`Reglas de demostración creadas: ${total}`);
  console.log("  Form Rules (contact): Referidos exigen notas · Aviso de cliente directo");
  console.log("  Validation Rules: email para leads web (contact) · valor obligatorio salvo admin (deal)");
  console.log("  Workflows: bienvenida a referidos (contact.created) · gracias + referidos 30 días (deal.won)");
  console.log("  Pipeline Rules: Negociación exige valor (requisito) · aviso al entrar a Negociación");
  console.log(
    "  Loop mensual: clonar período al presentar · pedir soportes a T-10 · aviso de vencido · aviso al revisar"
  );
  console.log("  Facturación: aviso de factura emitida");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
