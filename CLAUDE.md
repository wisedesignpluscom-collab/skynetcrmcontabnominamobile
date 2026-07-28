# CLAUDE.md — Skynet CRM · Automation Engine

> Documento de arquitectura. Las secciones 1-6 son el plan original (Fase 0); el
> **estado real de implementación está en la sección 7** y el resumen del engine en
> la **sección 8**. El Automation Engine está **COMPLETO** (Fases 1-6 implementadas,
> probadas y verificadas E2E). La **sección 9** cubre los módulos posteriores
> (plantillas de correo, motor de envío SMTP, calendario de tareas y llamadas) y el
> paquete de despliegue (Netlify+Neon y servidor local Windows+Docker+PostgreSQL).
> Leer las secciones 7-9 antes de tocar el código correspondiente.
>
> **Mapa rápido de módulos** (todo en `~/Projects/skynet-crm`; local = SQLite,
> producción/servidor = PostgreSQL):
> - Automation Engine → `lib/engine/*`, `/automatizaciones` · §7-8
> - Plantillas de correo → `EmailTemplate`, `/plantillas`, `lib/email/variables` · §9
> - Envío SMTP → `nodemailer`, `AppSetting`, `lib/email/{smtp,mailer,scheduler}`, `instrumentation.ts` · §9
> - Calendario → `Task.{hasTime,durationMin,ownerId}`, `/calendario`, `components/calendar` · §9
> - Despliegue → `netlify.toml`+`DEPLOY.md` / `Dockerfile`+`docker-compose.yml`+`INSTALAR-SERVIDOR-WINDOWS.md` · §9

---

## 1. Stack y arquitectura actual detectada

| Capa | Tecnología | Detalle |
|---|---|---|
| Framework | Next.js 16 (App Router, Turbopack) | React 19, TypeScript estricto |
| Estilos | Tailwind CSS v4 | Paleta slate + acento teal; tema propio, responsive (drawer móvil) |
| ORM / BD | Prisma 6 | SQLite en desarrollo, PostgreSQL en producción (cambio solo por `DATABASE_URL`) |
| Mutaciones | **Server Actions** (`"use server"`) | No hay API REST salvo `app/api/alertas` (polling de la campanita). Patrón: `FormData` → validar → Prisma → `revalidatePath` |
| Auth | Propia: JWT (jose) en cookie httpOnly `skynet_session` | `proxy.ts` protege todo excepto `/login` y `/formulario`; sesión de 7 días; bcryptjs para contraseñas |
| Autorización | `lib/permissions.ts` centralizado | Roles: `admin` \| `supervisor` \| `vendedor`. Helpers: `canApprove`, `canDelete`, `canReassign`, `canManageUsers` |
| Estado global | Ninguno (por diseño) | Server Components leen Prisma directo; el único cliente con estado es el kanban y la campanita |

**Estructura de carpetas (convención por módulo):**

```
app/(crm)/<módulo>/page.tsx        ← vista (Server Component)
app/(crm)/<módulo>/actions.ts      ← mutaciones ("use server")
app/(crm)/<módulo>/[id]/page.tsx   ← detalle
components/                        ← UI compartida (Sidebar, PipelineBoard, NotificationsBell, WhatsAppButton)
lib/                               ← dominio compartido (prisma, session, permissions, deals, automations, catalog, whatsapp)
prisma/schema.prisma + seed.ts     ← modelo y datos demo (nicho consultoría)
```

**Convenciones establecidas:** UI y datos en español · acciones reciben `FormData` y verifican rol server-side · registros de sistema se escriben como `Activity { type: "sistema" }` · valores de selects vienen de `CatalogOption` (catálogos editables) · iconos SVG inline dibujados a mano · commits en español con push a GitHub al cierre de cada ronda.

**Modelos existentes (10):** `User`, `AutomationRule`, `CatalogOption`, `Company`, `Contact`, `PipelineStage`, `Deal`, `Task`, `Activity`, `FollowUp`.
**Agregados por el Engine:** `Rule`, `RuleGroup`, `RuleCondition`, `RuleAction`, `AutomationRun` (Fase 1) · `WorkflowJob`, `Notification`, `EmailOutbox` (Fase 3) · `RuleVersion` (Fase 6, versionado/auditoría). `Rule` ganó columnas opcionales `stageId` (Fase 5) y `updatedById` (Fase 6).

---

## 2. Inventario de módulos existentes reutilizables

| Existente | Dónde | Cómo lo reutiliza el Engine |
|---|---|---|
| **Motor de reglas v1** ⭐ | `lib/automations.ts` + tabla `AutomationRule` | **Es la semilla del Engine.** Ya tiene: 5 reglas nativas, activación/desactivación, parámetros (días/monto), barridos con marca de tiempo (`runSweeps`), y panel en Configuración. Se GENERALIZA, no se reemplaza |
| Puntos de evento ya instrumentados | `applyStageMove` y `applyDealUpdate` (`lib/deals.ts`), `updateFollowUp`, `createContact`, `createDeal`, `toggleTask`, `GET /api/alertas` (heartbeat) | Son los lugares exactos donde se insertará el dispatcher `emitEvent()`. No hay que "cablear" el CRM: ya está cableado |
| Sistema de aprobaciones | Campos `pending*` en `Deal` + bandeja `/aprobaciones` | Patrón probado de "acción diferida hasta visto bueno" → se convierte en un tipo de acción del Engine (Fase 5) |
| Permisos | `lib/permissions.ts` | Se agrega `canManageAutomations` (admin) y `canViewAutomationLog` (supervisor+) siguiendo el patrón actual |
| Catálogos configurables | `CatalogOption` + secciones CRUD en `/configuracion` | El Builder reutiliza el mismo patrón visual (lista + agregar + toggle + guardar) y los catálogos como fuentes de valores en condiciones |
| Notificaciones | `NotificationsBell` + `/api/alertas` | Nueva sección "automatización ejecutada/fallida" en el mismo panel; cero UI nueva de notificaciones |
| Auditoría | `Activity { type: "sistema" }` | Toda acción del Engine sigue dejando rastro en el historial del contacto, como hoy |
| UI reutilizable | `inputClass`, tarjetas `rounded-xl border-slate-200`, badges de estado, patrón toggle "● Activada", tablas responsive | El Builder se construye 100 % con estas piezas |
| Sesión | `getSession()` / `SessionUser` | Firmar quién creó/modificó cada automatización |

**Conclusión del inventario:** no existe ninguna funcionalidad que el Engine deba duplicar. Todo lo que necesita (eventos, permisos, notificaciones, auditoría, panel admin, patrón de aprobaciones) ya existe y se extiende.

---

## 3. Plan de integración — los 5 submódulos

**Principio arquitectónico:** un solo núcleo (Trigger → Condiciones → Acciones + Log de ejecución) y los 5 submódulos son *especializaciones* de ese núcleo, no sistemas aparte.

| Submódulo | Qué es en este CRM | Sobre qué se monta |
|---|---|---|
| **1. Workflow Automation** | "Cuando pase X, si se cumple Y, haz Z" (ej.: al ganar venta → crear tarea de referidos a los 30 días) | Generalización directa de `lib/automations.ts`; las 5 reglas actuales se migran como workflows de sistema |
| **2. Automation Builder** | UI en español para usuarios no técnicos: página `/automatizaciones` con constructor de 3 pasos (Cuándo / Si / Entonces), sin JSON visible | Patrón visual de `/configuracion`; selects alimentados por catálogos, etapas y usuarios reales |
| **3. Validation Rules** | Reglas declarativas por entidad: campo obligatorio, formato (email/teléfono), rango de monto, unicidad | Se evalúan dentro de las server actions existentes ANTES de persistir; mensajes de error con `useActionState` (patrón ya usado en login) |
| **4. Form Rules** | Comportamiento de formularios: valores por defecto, normalización (ej. teléfonos a +58), campos de solo lectura por rol | Se aplican en las mismas actions + hints en los formularios existentes; no se crean formularios nuevos |
| **5. Pipeline Rules** | Reglas por etapa: requisitos para avanzar (ej. "no pasar a Negociación sin valor > 0"), acciones al entrar a etapa, aprobaciones | Extiende `applyStageMove`; las aprobaciones de pérdida/descuento actuales se vuelven instancias configurables de este tipo de regla |

---

## 4. Modelo de datos propuesto

**Regla de oro: ninguna tabla existente sufre cambios destructivos.** Solo columnas nuevas opcionales y tablas nuevas.

```prisma
// AMPLIAR (columnas nullable — retrocompatible):
model AutomationRule {
  // …campos actuales intactos (key, enabled, days, amount, lastRunAt)
  name        String?   // nombre visible en el Builder
  trigger     String?   // "deal.stage_changed" | "contact.created" | "followup.saved" | "sweep.daily" | "form.lead_received"…
  conditions  String?   // JSON serializado (SQLite no tiene tipo Json): [{campo, operador, valor}]
  actions     String?   // JSON: [{tipo, params}] — crear_tarea | mover_etapa | cambiar_campo | notificar | registrar_actividad | requerir_aprobacion
  createdById String?   // FK User — quién la creó
  isSystem    Boolean @default(false) // las 5 reglas v1 migran con isSystem=true
}

// NUEVAS:
model AutomationRun {      // auditoría de cada ejecución (visible en el Builder)
  id, ruleId FK→AutomationRule, trigger, entity, entityId,
  status ("ok"|"skipped"|"error"), detail String?, createdAt
}
model ValidationRule {     // submódulo 3
  id, entity ("contact"|"company"|"deal"|"task"|"followup"), field,
  kind ("required"|"format"|"min"|"max"|"unique"), param String?, message, enabled, order
}
model StageRule {          // submódulo 5 — ligada por ID (no por nombre) a la etapa
  id, stageId FK→PipelineStage (onDelete: Cascade), kind
  ("require_field"|"require_open_tasks_done"|"approval"|"on_enter_action"),
  params String? /*JSON*/, enabled
}
```

- **Form Rules** no necesita tabla propia en v1: son `AutomationRule` con trigger `form.*` y acciones de normalización/default.
- Relaciones con existentes: FKs solo hacia `PipelineStage` y `User`. `Deal`, `Contact`, `Task`, `Activity`, `FollowUp` no cambian.

---

## 5. Fases de construcción y criterios de «hecho»

| Fase | Contenido | Está «hecho» cuando… |
|---|---|---|
| **0. Análisis** | Este documento | Lo apruebas |
| **1. Núcleo del Engine** | Ampliar `AutomationRule`, crear `AutomationRun`, dispatcher `emitEvent()` insertado en los puntos ya instrumentados, migrar las 5 reglas v1 como `isSystem` | Las 5 reglas funcionan **idéntico** que hoy pero pasando por el dispatcher; cada ejecución queda en `AutomationRun`; pruebas tsx en verde; demo intacta |
| **2. Workflow Automation** | Catálogo de triggers (6) y acciones (6) genéricos, evaluador de condiciones, guard anti-bucles | Un workflow creado solo con datos (sin tocar código) se ejecuta y se registra; el formulario público pendiente se integra como trigger `form.lead_received` |
| **3. Automation Builder** | Página `/automatizaciones` (admin), constructor Cuándo/Si/Entonces en español, log de ejecuciones, duplicar/activar/desactivar | El admin crea, edita y desactiva un workflow completo desde el navegador; verificado end-to-end; enlace desde Configuración |
| **4. Validation + Form Rules** | Tabla `ValidationRule`, evaluador en las actions de contactos/empresas/pipeline/tareas, mensajes de error visibles, sección en el Builder | Una regla "email obligatorio en contactos" bloquea el guardado con mensaje claro y desaparece al desactivarla |
| **5. Pipeline Rules** | Tabla `StageRule`, requisitos por etapa en `applyStageMove`, migrar aprobaciones de pérdida/descuento a instancias configurables | Regla por etapa creada desde el Builder bloquea/permite el arrastre en el kanban; la bandeja de aprobaciones sigue funcionando sin cambios visibles |
| **6. Endurecimiento** | Límites anti-bucle definitivos, permisos finos, exportar/importar automatizaciones (JSON), documentación de usuario, build de producción | Build limpio, pruebas completas, push a GitHub, demo preparada |

Cada fase cierra con: pruebas con datos reales + restauración de la demo + commit + push. **Nunca se avanza a la siguiente fase sin tu aprobación** (regla de trabajo ya establecida en este proyecto).

---

## 6. Riesgos técnicos y compatibilidad hacia atrás

| Riesgo | Mitigación |
|---|---|
| **Bucles infinitos** (una acción dispara el trigger de otra automatización) | Contexto de ejecución con profundidad máx. 3; una misma regla no puede re-dispararse sobre la misma entidad dentro de una cadena; guard probado en Fase 2 antes de abrir el Builder |
| SQLite no tiene tipo `Json` | Condiciones/acciones como `String` con JSON serializado + parse defensivo; en PostgreSQL se puede migrar a `Json` sin tocar código de negocio |
| Server actions síncronas: acciones lentas alargarían el guardado | Solo acciones internas rápidas en v1 (tareas, campos, notificaciones); acciones externas futuras (email/WhatsApp API) irán a un patrón de cola en fase posterior |
| Reglas ligadas a nombres de etapa editables (la regla v1 de propuestas usa `contains "propuesta"`) | En Fase 5 las reglas de etapa pasan a FK `stageId`; la v1 se migra automáticamente |
| Regresión en las 5 reglas v1 durante la migración | `isSystem=true` conserva su comportamiento; la suite tsx de la Fase 1 replica exactamente las pruebas que ya pasaron hoy |
| Demo del cliente (consultor) durante el desarrollo | Los datos demo nunca se tocan sin restaurar; producción solo se recompila al cierre de cada fase |
| Cambio en vuelo pendiente | `proxy.ts` ya expone `/formulario` (público); la página aún no existe — es inocuo y se completa en Fase 2 como trigger del Engine |

---

## 7. Estado de implementación

### ✅ Fase 1 — Rule Engine central (implementada)

**Modelo de datos** (aprobación del plan ajustó el diseño: relacional explícito en lugar de JSON en `AutomationRule`):

- `Rule` — regla con `module` (contact | company | deal | task | followup | form | pipeline), `trigger` opcional (se cablea en Fase 2), `enabled`, `isSystem`, `priority`, `createdBy` (FK a `User` existente).
- `RuleGroup` — árbol de condiciones anidadas vía auto-relación `parentId` (raíz = `parentId null`), operador `AND` | `OR`, borrado en cascada.
- `RuleCondition` — hoja: `field` (ruta con puntos, ej. `contact.email`), `op` (código de operador), `value`, `value2` (para `between`).
- `RuleAction` — `type` + `params` (JSON serializado; SQLite no tiene tipo Json) + `order`. Ejecutores en Fase 2.
- `AutomationRule` conserva las 5 reglas v1 intactas (+ columnas opcionales `name`, `trigger`, `isSystem`); `AutomationRun` lista para el log de ejecuciones.

**Evaluador puro** — `lib/engine/evaluator.ts` (cero dependencias: sin Prisma, sin Next):

- 18 operadores con metadatos en español para el futuro Builder (`OPERATORS`): `eq, neq, gt, lt, gte, lte, contains, not_contains, starts_with, ends_with, is_empty, not_empty, between, relative_date, is_current_user, has_role, in_pipeline, in_stage`.
- Comparación con coerción (numérica → fecha → texto normalizado sin acentos/mayúsculas).
- `RuleContext = { record, user, pipeline, now? }` — `now` inyectable para tests; `user` con el mismo shape de `SessionUser` (reutiliza la sesión existente, sin auth paralela).
- `evaluateCondition` / `evaluateGroup` (AND/OR recursivo; grupo vacío = verdadero) / `evaluateRule` / `evaluateRules` (ordena por prioridad, filtra las que aplican, devuelve acciones ordenadas).

**Cargador** — `lib/engine/load.ts`: `loadRules({module?, trigger?})` lee las tablas planas y ensambla el árbol en memoria (sin includes recursivos, compatible SQLite/PostgreSQL).

**Pruebas** — `tests/evaluator.test.ts` (node:test, `npx tsx tests/evaluator.test.ts`): **15/15 en verde**, incluyendo AND/OR anidado a 3 niveles con caso negativo por cambio de usuario, coerción, fechas relativas, operadores de contexto y prioridad. Prueba de integración adicional del cargador (regla anidada real creada → cargada → evaluada → borrada en cascada) ejecutada con éxito. `tsc --noEmit` limpio.

**Sin UI y sin cableado a runtime todavía** (según alcance aprobado). Las 5 reglas v1 siguen operando por su camino actual sin cambios.

### ✅ Fase 2 — Form Rules y Validation Rules (implementada)

**Convención de triggers:** `form.change` = Form Rules (efectos sobre campos) · `form.validate` = Validation Rules (bloquean el guardado).

**Módulo puro** — `lib/engine/formRules.ts` (corre idéntico en servidor y cliente):

- `applyFormRules(rules, ctx) → FormEffects` con las 12 acciones: `mostrar, ocultar, requerir, quitar_requerido, bloquear, desbloquear, cambiar_valor, limpiar_valor, calcular_valor, mostrar_mensaje, resaltar_campo, cambiar_placeholder, cambiar_tooltip`. Efectos escalares: gana la regla de mayor prioridad; mensajes se acumulan.
- `computeFormula` — calculadora aritmética segura sin `eval` (números, referencias `{campo}`, `+ - * /`, paréntesis; entradas inválidas → `null`).
- `computeValidationErrors(validationRules, formRules, ctx)` — errores de reglas `validation_error` + campos que las Form Rules marcaron requeridos-y-visibles pero llegaron vacíos (la exigencia del cliente se re-verifica en servidor).

**Server-side (obligatorio)** — `lib/engine/validate.ts`: `validateForm(module, ctx)` carga reglas y delega en el módulo puro; `formDataToRecord` convierte el `FormData` de las actions. Integrado en:
- `createContact` (contactos) — ahora devuelve `{errors}` y el formulario los muestra con `useActionState` (patrón del login).
- `createDeal` (pipeline) — valida y redirige con `?error=` mostrado en la página (integración server-only, sin convertir el formulario a cliente).

**Cliente (feedback inmediato)** — `components/RuleForm.tsx`: envuelve el formulario existente sin re-renderizarlo; escucha `input`/`change`, evalúa con el MISMO evaluador puro y aplica efectos por DOM (envoltorios `data-field="nombre"`, mensajes en `[data-rule-messages]` construidos con `textContent`, nunca HTML crudo; no toca el campo con foco para no pelear con el usuario). Piloto integrado: **Nuevo contacto** (`components/forms/ContactoNuevoForm.tsx` — mismo markup movido a componente cliente, no duplicado).

**Reglas demo en BD** — `prisma/seed-rules.ts` (no toca datos del CRM): 2 Form Rules (Referido → notas requeridas/resaltadas/placeholder/tooltip/mensaje · cliente directo → aviso) y 2 Validation Rules (lead web sin email → bloquea · deal sin valor → bloquea salvo rol admin, modelada con OR anidados).

**Pruebas:** `tests/form-rules.test.ts` 8/8 + `tests/evaluator.test.ts` 15/15 · integración server-side contra reglas reales: 6/6 casos (bloqueos, excepción por rol, requerido de Form Rule aplicado en servidor) · `tsc --noEmit` limpio · verificación estructural del formulario renderizado (9 `data-field`, reglas serializadas, zona de mensajes).

**Sin editor visual todavía** (según alcance): las reglas se crean por seed/BD. El editor llega en la fase del Builder.

### ✅ Fase 3 — Workflow Engine (implementada)

Corre por **evento** y de forma **asíncrona** (cola), a diferencia de Form/Validation Rules
que corren en tiempo real de UI. Sin infraestructura externa (mismo espíritu que `runSweeps`).

**Sistema de eventos** — `lib/engine/events.ts` (el CRM no tenía uno formal; se creó):

- `emitEvent(evento)`: carga las `Rule` con `trigger` = tipo de evento, evalúa condiciones
  con el evaluador de la Fase 1 y **encola** las acciones como `WorkflowJob` (solo inserts,
  nunca bloquea la respuesta). Catálogo `EVENT_TYPES` con etiquetas en español para el Builder.
- Eventos cableados: `contact.created/deleted`, `company.created/deleted`, `deal.created/
  updated/stage_changed/won/lost/deleted`, `task.created/completed`, `followup.saved` y
  `tiempo.transcurrido` (barrido periódico por módulo). Cableado en las server actions de
  contactos/empresas/pipeline/tareas/posventa y en `applyStageMove`/`applyDealUpdate`
  (siempre con el registro final, después de las reglas v1).
- «esperar» se consume al **planificar** (`planJobs`): desplaza el `runAt` de las acciones
  siguientes; las condiciones se evalúan al momento del trigger, no al ejecutar.

**Cola de ejecución** — `lib/engine/queue.ts` + tabla `WorkflowJob` (la fila del job ES el
log: status `pending|running|ok|error`, attempts, lastError, detail, snapshot `payload`):

- `emitEventAndProcess()` (entrada para las server actions): encola y dispara `processQueue()`
  sin await; jamás tumba la operación del CRM que lo originó.
- `processQueue()`: reclamo atómico (`updateMany` condicionado), reintentos con backoff
  (1/5/15/60 min) hasta `maxAttempts` (3); `NonRetryableError` muere al primer intento.
- `runEngineTick()` (heartbeat desde `GET /api/alertas`): procesa esperas/reintentos vencidos
  siempre, y barre los triggers `tiempo.transcurrido` como mucho 1 vez/hora (marker en
  `AutomationRule`, patrón de `runSweeps`) con dedupe de 24 h por regla+entidad.
- **Guards anti-bucle**: profundidad máx. 3 (`depth`) + una regla no se re-dispara sobre la
  misma entidad dentro de una cadena (`chain`). Probado con una regla que se auto-dispara.

**Acciones** — `lib/engine/actions.ts` (`WORKFLOW_ACTIONS` con etiquetas para el Builder);
plantillas `{campo}` / `{contact.email}` resueltas contra el registro del evento:

- `crear_registro` (activity | contact | deal — deal resuelve etapa por nombre o primera abierta)
- `actualizar_campos` — **lista blanca por entidad** (`UPDATABLE`); amount/stageId/ownerId
  excluidos a propósito (pasan por aprobaciones/applyStageMove/reasignación); fechas relativas `"+30d"`
- `crear_tarea` (se cuelga del contacto/deal del evento + Activity de auditoría)
- `enviar_notificacion` → tabla `Notification` + sección 📣 en la campanita (`/api/alertas`
  GET la incluye; POST marca leída al hacer clic)
- `enviar_email` → tabla `EmailOutbox` (compone y encola; el envío SMTP real es de la fase email)
- `esperar` (días/horas/minutos) · `llamar_webhook` (POST/GET JSON, timeout 10 s, no-2xx reintenta)

**Demo** — `prisma/seed-rules.ts` agrega 2 workflows: bienvenida a referidos
(`contact.created`) y venta ganada → aviso + email + tarea de referidos a los 30 días
(`deal.won`, con `esperar`).

**Pruebas** — `tests/workflow.test.ts` (10/10): corre contra una **copia** de la BD
(`cp prisma/dev.db /tmp/skynet-test.db && DATABASE_URL="file:/tmp/skynet-test.db" npx tsx
tests/workflow.test.ts` — el test se niega a correr si la URL no contiene "test").
Cubre planificación con esperas, plantillas, workflow completo, webhook con reintentos/backoff
hasta morir, email no-reintentable + bandeja, lista blanca, bucle acotado y trigger de tiempo
con dedupe. Suites previas intactas (evaluator 15/15, form-rules 8/8), `tsc --noEmit` limpio.
Verificado E2E en navegador: contacto Referido → tarea + aviso en campanita + marcado leído
(datos demo restaurados después).

### ✅ Fase 4 — Automation Builder visual (implementada)

Página `/automatizaciones` (admin) con constructor **tipo diagrama de flujo**
(Inicio → Condición → ramas Sí/No → Acciones → Fin, estilo Power Automate).
**Sin dependencias nuevas**: como el modelo del engine es trigger → árbol de
condiciones → lista ordenada de acciones, la topología del diagrama es fija y
se dibuja con CSS/SVG propio (no hace falta canvas de nodos libres). El Builder
edita las MISMAS tablas de las Fases 1-3 (`Rule`+`RuleGroup`+`RuleCondition`+
`RuleAction`) — cero formato paralelo.

**Catálogos del Builder** — `lib/engine/builder.ts` (módulo PURO, importable
desde el cliente): `EVENT_TYPES` y `WORKFLOW_ACTIONS` se **movieron aquí**
(re-exportados desde `events.ts`/`actions.ts` para no romper consumidores) y se
ampliaron con `ParamSpec` (inputs que pide cada acción). Además: `MODULES`,
`FORM_ACTIONS` (12 efectos de Fase 2), `VALIDATION_ACTIONS`, `RULE_KINDS`
(workflow | form | validation, deducido con `kindOfTrigger`), `FIELDS` (campos
por módulo con tipo y opciones para condiciones/targets), `RuleDraft` (el
borrador: `root` es literalmente un `GroupDef` del evaluador) y
`validateDraft` (validación en español, corre en cliente y servidor).

**Persistencia** — `lib/engine/persist.ts`: `saveDraft` (transacción: upsert de
`Rule` + reemplazo completo del árbol y acciones; firma `createdById`) y
`loadDraft` (tablas → borrador, mismo ensamblaje que `load.ts`). Server actions
en `app/(crm)/automatizaciones/actions.ts` (guardar/activar/eliminar/duplicar;
duplicados nacen desactivados; `isSystem` no se elimina; permisos con
`canManageAutomations`/`canViewAutomationLog` nuevos en `lib/permissions.ts`).

**UI** — `components/automations/`: `RuleBuilder.tsx` (canvas del flujo +
panel de edición del nodo seleccionado + guardado con `useTransition`),
`ConditionGroupEditor.tsx` (**grupos anidados AND/OR** recursivos hasta 5
niveles, operadores filtrados por tipo de campo, pseudo-campo «Rol del
usuario», valores con selects de catálogos/etapas/usuarios reales) y
`ActionEditor.tsx` (formulario por `ParamSpec`; targets de Form Rules =
campos con `form: true`). Opciones dinámicas del servidor en
`app/(crm)/automatizaciones/data.ts`. Lista agrupada por tipo + **log de
ejecuciones** (últimos 30 `WorkflowJob`) en la página principal; entrada
«Automatizaciones» en el Sidebar (admin) y enlace desde Configuración.

**Pruebas** — `tests/builder.test.ts` (9/9, contra copia de BD como las de
workflow): validación pura + round-trip borrador→tablas→borrador (árbol
anidado OR/AND con between incluido) + el cargador y evaluador de Fase 1 ven
y ejecutan la regla guardada + edición reemplaza sin dejar residuos. Suites
previas intactas (evaluator 15/15, form-rules 8/8, workflow 10/10),
`tsc --noEmit` limpio. Verificado E2E en navegador: crear workflow con
condición y acción desde el canvas → estructura correcta en BD firmada por el
usuario → editar recarga el borrador → eliminar desde la lista (demo intacta:
las 6 reglas seed quedaron igual). Nota: quedan 2 avisos de lint
**preexistentes** (setState en efecto de `Sidebar.tsx` y variable sin uso en
`configuracion/page.tsx`), anteriores a esta fase.

### ✅ Fase 5 — Pipeline Rules (implementada)

Reglas que gobiernan la transición entre etapas del pipeline. **Sin tabla nueva**:
en lugar del `StageRule` del plan original, se extendió el modelo `Rule` de las
Fases 1-4 con una columna opcional `stageId` (FK a `PipelineStage`,
onDelete: Cascade — Configuración solo permite eliminar etapas vacías). La regla
queda ligada a la etapa **por ID**, así sobrevive a los renombres (riesgo que el
plan señalaba en las reglas v1). El Builder las edita con las mismas tablas.

**Triggers nuevos** (catálogo `PIPELINE_TRIGGERS` en `lib/engine/builder.ts`;
`kindOfTrigger` los clasifica como kind `pipeline`, siempre módulo `deal`):

- `pipeline.requisito` — corre **síncrono** dentro de `applyStageMove` ANTES de
  aplicar el movimiento (única pieza del engine que puede frenar una operación,
  como las Validation Rules al guardar). Si la condición se cumple, la acción
  `bloquear_movimiento` (única permitida en este trigger — `actionsForTrigger`)
  devuelve su mensaje (admite plantillas `{title}`) y el movimiento no ocurre.
- `pipeline.entrada` / `pipeline.salida` — asíncronos vía la cola de la Fase 3
  con las acciones de workflow normales. `emitEvent` filtra por etapa: una regla
  con `stageId` solo aplica si `evt.pipeline.stageId` coincide.

**Integración en `lib/deals.ts`:**

- `applyStageMove` ahora devuelve `StageMoveResult` (`{status}` con variante
  `blocked` + `messages[]`). El kanban (`PipelineBoard`) revierte la tarjeta y
  muestra los mensajes en un alert; `checkStageRequirements` exportada para tests.
- **Guard de misma etapa**: reordenar una tarjeta dentro de su columna ya NO
  re-dispara nada (antes emitía `deal.stage_changed` duplicado en cada reorden).
- `emitStageEvents(dealId, from, to, session)` centraliza la emisión
  (`deal.stage_changed`/`won`/`lost` + `pipeline.salida`/`entrada`) para que cada
  movimiento emita cada evento exactamente una vez. La bandeja de aprobaciones la
  reutiliza: una **pérdida aprobada ahora sí emite `deal.lost` y los eventos de
  pipeline** (antes no emitía ninguno — hueco corregido, sin cambios visibles).
  La solicitud del vendedor (pending) sigue sin mover ni disparar nada; el
  supervisor que aprueba no re-verifica requisitos (override deliberado).

**Builder:** tipo «Regla de pipeline» con selector de disparador
(requisito/entrada/salida), selector de etapa (`stage_id` en las opciones
dinámicas — value=ID, label=nombre) y módulo fijado a Oportunidades. Al cambiar
entre requisito ↔ entrada/salida se resetean las acciones incompatibles.
`RuleDraft.stageId` viaja por `saveDraft`/`loadDraft`; `saveAutomation` verifica
que la etapa siga existiendo. La lista agrupa la sección «Reglas de pipeline»
mostrando etiqueta + etapa.

**No-conflicto verificado** (pedido explícito de la fase): un movimiento de
etapa dispara `pipeline.entrada` y `deal.stage_changed` exactamente 1 vez cada
uno; Form/Validation Rules del módulo deal NO corren por cambios de etapa (solo
por `form.change`/`form.validate` en las actions de formularios); la regla v1 de
propuestas no duplica su tarea al re-entrar (guard `yaExiste`); un movimiento
bloqueado no encola nada.

**Demo** — `prisma/seed-rules.ts` (+2, total 8): «Negociación exige valor»
(requisito, amount ≤ 0 bloquea) y «Aviso al entrar a Negociación» (entrada →
campanita).

**Pruebas** — `tests/pipeline-rules.test.ts` (10/10, contra copia de BD):
bloqueo con mensaje renderizado y sin encolar, paso cuando no aplica, requisito
por rol (has_role), entrada/salida solo para SU etapa y solo una vez,
no-duplicación entre motores, reorden en la misma columna sin efectos, v1 sin
duplicar, solicitud de pérdida intacta y pérdida aprobada emitiendo eventos.
Suites previas intactas (evaluator 15/15, form-rules 8/8, workflow 10/10,
builder 9/9 — ahora con los triggers pipeline en `kindOfTrigger`),
`tsc --noEmit` limpio. Verificado E2E en navegador: regla creada **desde el
Builder** (tipo pipeline → etapa Diagnóstico → mensaje) bloquea el arrastre en
el kanban con su mensaje y la tarjeta se revierte; con valor corregido el
movimiento pasa y la regla de entrada deja notificación en campanita + job `ok`
en el log. Datos demo restaurados después (8 reglas seed, 3 usuarios).

### ✅ Fase 6 — Endurecimiento para producción (implementada)

Versionado + auditoría + permisos + import/export + performance. **Sin sistemas
paralelos**: reutiliza el modelo `Rule`, el patrón de server actions, los helpers
de permisos y la sesión existentes.

**Modelo (aditivo):** tabla nueva `RuleVersion` (snapshot JSON del `RuleDraft` por
cada cambio, `version` incremental por regla, `action`, `authorId` + `authorName`
congelado, `@@unique([ruleId, version])`, cascade con la regla) y columna
`Rule.updatedById` (FK a User). Ninguna tabla existente sufre cambios destructivos.

**Versionado y rollback** (`lib/engine/versions.ts` + `persist.ts`):
- `saveDraft` graba una `RuleVersion` **dentro de la misma transacción** que
  escribe la regla (estado e historial no pueden divergir) y setea `updatedById`.
  La firma cambió de `userId` a `author: {id,name} | null` + `action?`.
- `writeVersion`/`listVersions`/`getVersionSnapshot` son primitivas puras (no
  importan persist → sin ciclos). `restoreVersion(ruleId, versionId, author)`
  reescribe la regla con el snapshot y añade una versión `restored` (el rollback
  también queda auditado y es reversible; rechaza reglas de sistema).
- Los toggles pasan por `saveDraft` con acción `activated`/`deactivated`, así el
  cambio de estado también se versiona.

**Auditoría:** cada versión guarda quién y cuándo. La lista y la página de edición
muestran «Creada por X · Editó Y»; `/automatizaciones/[id]` tiene sección
**Historial de cambios** (`HistoryPanel`) con autor, fecha, etiqueta de acción y
botón Restaurar.

**Permisos (reutiliza `lib/permissions.ts`, sin roles nuevos):** mutaciones
(crear/editar/activar/eliminar/importar/restaurar) = `canManageAutomations`
(admin); ver lista + auditoría + exportar = `canViewAutomationLog` (supervisor+).
La página de lista se abrió a supervisor en **solo lectura** (banner + controles
de gestión ocultos vía `isAdmin`); la edición sigue admin-only.

**Import/export** (`lib/engine/portable.ts`): bundle `skynet-automations/v1`. Clave
del diseño cross-ambiente: la **etapa se serializa por NOMBRE** (los IDs difieren
entre dev y prod) y se descartan todos los ids. Al importar, la etapa se
re-resuelve por nombre; las Pipeline Rules cuya etapa no exista se **omiten con
motivo**. Empareja por nombre: reescribe las que existan (versión `imported`),
crea las nuevas; nunca sobreescribe reglas de sistema. UI: `ImportExportBar`
(exportar descarga JSON; importar pega/sube y muestra resumen creadas/actualizadas/
omitidas).

**Performance** (`lib/engine/load.ts` + `evaluator.ts`):
- Caché en memoria de `RuleDef[]` por combinación de filtro; toda mutación llama a
  `invalidateRulesCache()` (frescura inmediata) + TTL de 30 s como red de
  seguridad si corrieran varios procesos. `loadRules` ya filtraba por
  `trigger`+`enabled` (no evalúa reglas de otros eventos ni desactivadas).
- Límites de recursión: `evaluateGroup` corta en `MAX_EVAL_DEPTH` (25) y el
  cargador poda subárboles más profundos de 20 niveles (defensa ante datos
  cíclicos/malformados; el Builder ya limita la entrada a 5).

**Pruebas** — `tests/hardening.test.ts` (11/11, contra copia de BD): versión
incremental con autor/acción, autor congelado, rollback que audita y rechaza
sistema, **caché sirviendo valor previo sin invalidar + refresco al invalidar**,
export por nombre + import re-resolviendo la etapa, import que actualiza (no
duplica) y omite etapa inexistente, rechazo de formato desconocido, guarda de
recursión sin reventar, y matriz de permisos. Toda la batería en verde:
evaluator 15/15, form-rules 8/8, workflow 10/10, builder 9/9, pipeline-rules
10/10, hardening 11/11 (**63/63**); `tsc --noEmit` y ESLint limpios. Verificado
E2E en navegador: crear regla → v1 «Creada»; editar → v2 «Editada»; **rollback a
v1** → v3 «Restaurada» y la descripción vuelve a vacío tras recargar; línea de
auditoría con el autor; export/import (creó «Regla Importada E2E»); y **vista de
solo lectura del supervisor** (sin crear/editar/eliminar/importar, exportar sí).
Los tests que crean reglas por Prisma directo llaman `invalidateRulesCache()` en
sus helpers (espejo de lo que hace producción en cada mutación). Datos demo
restaurados (8 reglas seed, 3 usuarios, sin huérfanos).

---

## 8. Estado final: Automation Engine COMPLETO ✅

Las 6 fases están implementadas, probadas y verificadas E2E. El Automation Engine
cubre: motor de reglas genérico (condiciones AND/OR anidadas, 18 operadores) ·
Form Rules y Validation Rules · Workflow Engine con cola, reintentos y guards
anti-bucle · Automation Builder visual · Pipeline Rules · y el endurecimiento para
producción (versionado, auditoría, permisos, import/export, caché y límites de
recursión). Todo sobre las mismas tablas `Rule`/`RuleGroup`/`RuleCondition`/
`RuleAction` (+ `WorkflowJob`, `RuleVersion`), sin dependencias nuevas.

**Trabajo futuro (fuera del Engine):** migrar las 5 reglas v1 (`AutomationRule`)
al engine como reglas `isSystem`. Nota técnica: Next 16 avisa que `middleware.ts`
pasará a llamarse `proxy.ts`.

---

## 9. Módulos adicionales (correo y agenda) — 2026-07-12

Tres módulos nuevos, construidos sobre la base existente y sin dependencias salvo
`nodemailer` para el SMTP.

**M1 · Plantillas de correo** ✅ — modelo `EmailTemplate` (asunto + cuerpo HTML +
`module`). Sección `/plantillas` (admin) con editor propio (`contentEditable` +
barra de formato + inserción de variables mapeadas desde `FIELDS` + vista previa
con datos de ejemplo). La acción `enviar_email` del Builder gana un select de
plantilla (`email_template` en las opciones dinámicas); el ejecutor la resuelve
con `renderTemplate` contra el registro del evento. Verificado E2E.

**M2 · Motor de envío SMTP** ✅ — `nodemailer` + tabla `AppSetting` (clave/valor)
para el SMTP editable desde la UI. `lib/email/`: `smtp` (config, clave
write-only), `mailer` (envío + drenado de `EmailOutbox` con reclamo atómico,
reintentos hasta 3 y respeto de `scheduledFor`), `scheduler` (motor de fondo cada
60 s arrancado por `instrumentation.ts` → correo programado y automatizaciones por
tiempo corren 24/7 en el servidor persistente; el heartbeat `/api/alertas` también
drena). Panel «Correo saliente (SMTP)» en `/configuracion` con preset de Gmail,
correo de prueba y bandeja reciente. Botón «Enviar correo» en la ficha del
contacto (plantilla o manual, ahora o programado). `EmailOutbox` ganó
`scheduledFor` + `attempts`. Verificado a nivel de motor (filtro por hora,
reclamo, reintentos hasta error). Falta un envío REAL (requiere Gmail con
contraseña de aplicación).

**M3 · Calendario de tareas y llamadas** ✅ — `Task` ganó `hasTime`, `durationMin`
y `ownerId` (responsable). Página `/calendario` (`components/calendar/CalendarView`)
con vistas **Mes / Semana / Día**, agenda por horas (07–21), eventos coloreados
por tipo, crear/editar/completar/eliminar desde un modal, y filtro por responsable
(admin/supervisor ven todo; vendedor, lo suyo). Sin dependencias (cuadrícula y
agenda con CSS). Verificado: render SSR con tareas y horas reales.

**Despliegue:** `netlify.toml` + Neon (pruebas) y paquete Docker para servidor
local Windows (`Dockerfile`, `docker-compose.yml`, `INSTALAR-SERVIDOR-WINDOWS.md`)
con PostgreSQL; cookie de sesión configurable (`COOKIE_SECURE`) para HTTP en LAN.

---

## 10. Visibilidad por vendedor (alcance de datos por rol) — 2026-07-18

Cada usuario `vendedor` ve **solo los registros asignados a su perfil**;
`admin` y `supervisor` ven todo y son los únicos que pueden **reasignar**. Sin
cambios de esquema: el alcance se deriva del dueño existente (`ownerId` en
`Contact`/`Deal`/`Task`) o por relación (empresas, posventa).

**Núcleo — `lib/permissions.ts`** (fragmentos `where` de Prisma; `{}` = sin
filtro para admin/supervisor):
- `dealScope`, `contactScope`, `taskScope` — ya existían (deal/contacto por
  `ownerId`; tarea propia o de un contacto suyo).
- `companyScope` — empresa donde el vendedor tiene ≥1 contacto u oportunidad
  (`Company` no tiene dueño propio; se filtra por relación `contacts`/`deals`).
- `followUpScope` / `activityScope` — posventa y actividad cuya cuenta
  (contacto u oportunidad) es del vendedor.
- `ownsOrCanSeeAll(session, ownerId)` — guarda de propiedad para detalles.

**Listas filtradas server-side:** contactos, empresas (+ conteos internos solo
de lo suyo), calendario (**cerró una fuga**: antes cargaba todas las tareas al
cliente y filtraba en el navegador), posventa, y los KPIs/tareas/actividad/salud
del **dashboard** (`app/(crm)/page.tsx`). Pipeline, tareas y reportes ya
filtraban desde antes.

**Detalles y formularios protegidos por URL directa** (`contactos/[id]`,
`contactos/[id]/editar`, `empresas/[id]`, `pipeline/[id]`): un vendedor que no
sea dueño recibe `notFound()`. Los selectores de contacto (nueva oportunidad)
también se filtran con `contactScope` para no exponer nombres ajenos.

**Guardas de propiedad en mutaciones** — `lib/ownership.ts` (server-only, sí
consulta Prisma; separado de `permissions.ts` que es puro): `canAccessContact`
/ `canAccessDeal` (admin/supervisor siempre; vendedor solo si es el dueño).
Aplicadas en `updateContact`, `addActivity`, `updateDeal`, `requestDealDeletion`,
`createDeal` (contacto adjunto) y `moveDeal` (arrastre en kanban), para que un
vendedor no pueda editar/mover/anotar registros del administrador ni por POST
directo.

**Reasignación (solo admin/supervisor):** contactos ya lo restringía (UI
`canReassign` + server action). El calendario se endureció: el selector
«Responsable» del modal queda deshabilitado para vendedor y
`app/(crm)/calendario/actions.ts` fuerza el dueño al propio vendedor y bloquea
editar/completar/eliminar tareas ajenas (`canSellerTouchTask`).

Verificado con conteos contra la BD real (casos positivo/negativo/admin);
`tsc --noEmit` limpio. Commit `e749ee8`.

---

## 11. Adaptación a outsourcing contable — F1: esquema y ficha del cliente — 2026-07-27

El CRM se está adaptando de CRM de ventas genérico a la operación de una **firma
de outsourcing contable en Venezuela** (obligaciones ante SENIAT, IVSS, BANAVIH y
alcaldías). Plan completo de 7 fases en
`~/.claude/plans/harmonic-finding-pretzel.md`. Principio rector: **adaptar, no
reescribir** — `Company` = el cliente contable, `User` = el Profesional,
`Deal`+`PipelineStage` = el ciclo de venta, y el Automation Engine (§7-8) será el
motor del loop mensual de obligaciones.

**Modelo (solo columnas nuevas opcionales, cero cambios destructivos):**

- `Company` — `rif` (`@unique`), `regimenTributario`, `municipios`, `tamano`,
  `moneda` (default `USD`), `estadoCliente` (default `lead`), `fechaCierre`,
  `contadorAnterior`, `analistaId`/`supervisorId` (FK→`User`, relaciones
  `CompanyAnalista`/`CompanySupervisor`, `onDelete: SetNull`). `name` es la razón
  social e `industry` el sector económico (catálogo existente).
- `User` — `especialidad` (multi-valor) y `capacidadMaxima` (para el balanceo de
  cartera de fases posteriores).

**Módulos puros nuevos** (sin Prisma ni Next, testeables como el evaluador):

- `lib/rif.ts` — `parseRif` / `isRifValido` / `normalizeRif` (canoniza
  `j401234567` → `J-40123456-7`) / `ultimoDigito`. El último dígito vive aquí
  porque es la entrada del **calendario del SENIAT** que consumirá F2.
- `lib/multivalor.ts` — SQLite no tiene arrays: los campos multi-valor se guardan
  como texto separado por comas. `parseMulti`/`serializeMulti` (descarta vacíos y
  duplicados) / `hasValue` (compara sin acentos ni mayúsculas) / `formatMulti`.
- `lib/clientes.ts` — `ESTADOS_CLIENTE` + etiquetas, `esEstadoCliente` (solo
  entran los estados del catálogo), `facturaRecurrente` (solo el cliente
  **activo** entra en la facturación de F6) y `formatMonto` (USD/Bs).

**Catálogos** — `lib/catalog.ts` suma `municipio`, `regimen_tributario` y
`tamano_empresa` (editables desde `/configuracion`, mismo patrón que los
existentes); `industry` se reetiquetó a «Sectores económicos». Semilla en
`prisma/seed-catalogos-contables.ts` (municipios de Lara, regímenes SENIAT y
rangos de facturación) — **no toca datos del CRM**.

**UI** — `components/forms/ClienteForm.tsx`: un solo formulario cliente para
crear y editar (patrón de `ContactoNuevoForm`: `RuleForm` aplica las Form Rules y
`useActionState` muestra los errores del servidor), con tres bloques
(Identificación / Relación comercial / Datos de contacto). Nueva ruta
`empresas/[id]/editar` (**faltaba `updateCompany`**: la acción solo tenía
create/delete). La lista y la ficha muestran RIF, estado, analista y municipios.
El Sidebar dice «Clientes».

**Validación** — el formato del RIF se valida siempre en servidor
(`MENSAJE_RIF_INVALIDO`) y el choque de unicidad de Prisma (`P2002`) se traduce a
«Ya existe un cliente con ese RIF» en vez de reventar la acción. Las
`ValidationRule` configurables del engine siguen corriendo por encima
(`validateForm("company", …)`). Las fechas de `<input type="date">` se guardan a
**mediodía local** (`T12:00:00`, convención ya usada en tareas) para que el día
elegido no se corra al anterior en la zona horaria de Venezuela.

**Alcance por rol** — `companyScope` (§10) ahora es
`OR: [analistaId, supervisorId, contacts.some(ownerId), deals.some(ownerId)]`: la
asignación directa es el camino principal y la relación queda como respaldo para
cuentas sin analista. Nueva guarda `canAccessCompany` en `lib/ownership.ts`
(espeja el scope) aplicada en `updateCompany`; reasignar analista/supervisor solo
lo puede hacer quien pasa `canReassign` (el select queda deshabilitado y el
servidor conserva la asignación existente si el analista manipula el formulario).

**Pruebas** — `tests/contable.test.ts` (13/13, módulos puros: RIF válido/inválido/
normalizado/último dígito, multi-valor ida y vuelta con comas internas, estados y
montos). Batería completa en verde: evaluator 15/15, form-rules 8/8, contable
13/13, workflow 10/10, builder 9/9, pipeline-rules 10/10, hardening 11/11
(**76/76**); `tsc --noEmit` limpio. Verificado E2E en navegador: RIF inválido
bloqueado con su mensaje · cliente creado con RIF normalizado, municipios,
analista y fecha correcta · ficha y edición precargan todo · RIF duplicado
rechazado · alcance por rol comprobado con las funciones reales (analista ve 5 de
7 clientes, `canAccessCompany` niega el ajeno). Datos demo restaurados (6
empresas). Nota: sigue el aviso **preexistente** de ESLint en `Sidebar.tsx:175`
(setState en efecto), anterior a esta fase.

---

## 12. Adaptación contable — F2: motor de vencimientos fiscales — 2026-07-27

El sistema calcula por sí solo la fecha límite de cada obligación. **Módulo puro**
`lib/fiscal/vencimientos.ts` (sin Prisma ni Next, como `lib/engine/evaluator.ts`)
+ el puente `lib/fiscal/data.ts` que le carga los datos del año.

**Tres convenciones que simplifican todo lo que viene después (F3-F6):**

1. El **período fiscal se identifica por su mes de cierre**: `"2026-07"` es julio
   (mensual), el trimestre que cierra en julio (trimestral) o el ejercicio que
   cierra en julio (anual). Lo quincenal se escribe `"2026-07-Q1"` / `"2026-07-Q2"`.
2. La obligación **vence en el mes siguiente al de cierre**. Única excepción: la
   primera quincena, que vence dentro de su propio mes contando desde el día 16.
3. Todas las fechas se construyen a **mediodía local** (misma convención que las
   tareas y la ficha del cliente), así ningún cambio de zona horaria corre el día.

**Modelos nuevos (aditivos, ninguna tabla existente cambia):**

- `Obligacion` — catálogo maestro con el patrón de `Service`: `nombre`,
  `jurisdiccion` (nacional|municipal), `periodicidad`, `enteReceptor`
  (SENIAT|IVSS|BANAVIH|Alcaldía|otro), `reglaTipo`, `reglaParam`, `municipio`,
  `notas`, `active`, `order`.
- `CalendarioSeniat` — `@@unique([anio, periodicidad, digito])`: el día del mes
  que le toca a cada terminación de RIF según la providencia del año.
- `DiaNoHabil` — `@@unique([fecha, municipio])`; `municipio` vacío = feriado
  nacional (se usa cadena vacía en vez de `null` porque en SQLite dos NULL no
  chocan y se colarían duplicados).

**Las 4 reglas de vencimiento** (`REGLAS_VENCIMIENTO`, con etiqueta y ayuda en
español para la UI):

| `reglaTipo` | Qué hace |
|---|---|
| `dias_habiles` | N-ésimo día hábil desde el inicio de la ventana, saltando fines de semana y feriados |
| `dia_fijo` | Día N del mes de vencimiento; recorta al último día del mes (31 → 30) y si cae en no hábil pasa al siguiente hábil |
| `terminacion_rif` | Busca en `CalendarioSeniat` por año + periodicidad + último dígito del RIF |
| `manual` | No calcula: la fija el analista |

**Principio: nunca se inventa una fecha.** Si falta el calendario del año, el RIF
no es válido o la obligación está mal configurada, `calcularVencimiento` devuelve
`fecha: null` **con el motivo en español** para mostrárselo al analista. Por eso
la semilla deja `CalendarioSeniat` **vacío**: sus días los publica el SENIAT cada
año y se cargan desde `/configuracion`.

**API del módulo puro:** `addMonths` (recorta al último día del mes destino — el
engine solo tenía `addDays`/`+30d`, inútil para períodos fiscales),
`parsePeriodo`/`formatPeriodo`/`etiquetaPeriodo`, `periodoSiguiente` (base del
auto-clonado de F4), `esDiaHabil`/`siguienteDiaHabil`/`nDiaHabil`,
`calcularVencimiento`. En `lib/fiscal/data.ts`: `contextoFiscal(anio)` carga
feriados y calendario **una sola vez** (incluye el año siguiente, porque
diciembre vence en enero) y `conContexto` calcula muchos vencimientos con él;
`periodoActual` da el período en curso.

**UI** — `components/fiscal/FiscalSettings.tsx` en `/configuracion` (admin), con
el patrón de «Servicios y precios»: catálogo de obligaciones con alta/edición/
activar, carga del calendario del SENIAT (los 10 dígitos de una vez, como llega
la providencia; en blanco borra la fila) y ABM de días no hábiles. Cada
obligación muestra una **vista previa** de cómo queda su fecha límite del período
en curso con los datos cargados hoy — o el aviso de qué falta. Server actions en
`app/(crm)/configuracion/fiscal-actions.ts` (solo admin, valores validados contra
los catálogos del módulo puro).

**Semilla** — `prisma/seed-obligaciones.ts` (idempotente, no toca datos del CRM):
9 obligaciones típicas (IVA ordinario y especiales, retenciones de IVA e ISLR,
ISLR definitiva, IVSS, FAOV, INCES, impuesto municipal) y los feriados nacionales
del año en curso y el siguiente, con Carnaval y Semana Santa **calculados** desde
el domingo de Pascua (algoritmo de Gauss/Meeus) en vez de escritos a mano.

**Pruebas** — `tests/fiscal.test.ts` (21/21): aritmética de meses con recorte y
cruce de año, períodos y `periodoSiguiente` en las 4 periodicidades, días hábiles
con feriados, las 4 reglas, quincena Q1 vs Q2, día 31 en meses de 30, RIF
inválido, calendario ausente y obligación mal configurada. Batería completa:
evaluator 15, form-rules 8, contable 13, fiscal 21, workflow 10, builder 9,
pipeline-rules 10, hardening 11 (**97/97**); `tsc --noEmit` limpio y ESLint sin
avisos en lo nuevo. Verificado E2E en navegador: las 9 obligaciones muestran su
vencimiento calculado (día fijo 15 → 17-ago porque el 15 es sábado; 10 días
hábiles → 14-ago; anual → «la fija el analista»); al cargar el calendario del
SENIAT las de terminación de RIF pasan del aviso a la fecha; un feriado agregado
el 5-ago corre las de 5 días hábiles de 7 a 10-ago y al quitarlo vuelven; edición
de obligación persistida. Datos demo restaurados (calendario de ejemplo borrado,
seed reaplicado).

---

## 13. Adaptación contable — F3: plan de servicios y servicios individuales — 2026-07-27

Qué le lleva la firma a cada cliente y por cuánto. Todo vive **dentro de la ficha
del cliente** (`empresas/[id]`), no en páginas aparte, y consume el motor de F2
para mostrar la próxima fecha límite de cada obligación contratada.

**Modelos nuevos:**

- `PlanServicio` — `companyId` **@unique** (uno por cliente: si se renegocia se
  edita, no se acumulan planes), `honorarioMensual`, `moneda`, `fechaInicio`,
  `estado` (activo|pausado|cancelado), `notas`. Cascade con el cliente.
- `PlanObligacion` — N:M plan ↔ catálogo, `@@unique([planId, obligacionId])`.
- `ServicioIndividual` — trabajo puntual fuera del plan: `tipo` (catálogo
  `tipo_servicio`, nuevo), `descripcion`, `montoCotizado`, `moneda`, `estado`,
  `responsableId` (FK→User, `onDelete: SetNull`), `fechaEntrega`.

**Desvío deliberado del plan original:** el override del plan es
`diaLimiteOverride` (**día del mes**, 1-31) y no el `fechaLimiteOverride` (fecha
suelta) que decía el documento. Una obligación se repite todos los períodos, así
que una fecha fija solo serviría para uno; el día del mes sí se aplica a todos.
`vencimientoDelPlan` (`lib/fiscal/data.ts`) lo trata como `dia_fijo` — incluido
el corrimiento al siguiente día hábil — y si viene fuera de rango lo ignora y
vale la regla del catálogo.

**Vocabulario del dominio** — `lib/planes.ts` (puro): estados del plan con
etiquetas/clases, `planProduceTrabajo` (**solo el plan activo** genera casos de
período en F4 y factura en F6), el flujo de 5 estados del servicio individual
(`ESTADOS_SERVICIO`, cuyo **orden ES el flujo**), `siguienteEstadoServicio`,
`servicioFacturable` (entregado = disparador de la factura de F6) y
`totalPorMoneda`/`formatTotales` — los montos se suman **por moneda**, porque un
cliente puede tener el plan en USD y un servicio en Bs y sumarlos sería mentir.

**UI** — `components/clientes/PlanServicioPanel.tsx` (alta del plan si no existe;
si existe: honorario editable, activar/pausar/cancelar, obligaciones cubiertas
con su vencimiento calculado o el motivo por el que falta, día acordado por
obligación y alta desde el catálogo filtrando las ya cubiertas) y
`components/clientes/ServiciosPanel.tsx` (alta, edición, botón que avanza al
siguiente paso del flujo y total sin facturar). Server actions en
`app/(crm)/empresas/plan-actions.ts`: quien puede ver el cliente
(`canAccessCompany`) gestiona su plan; **eliminar** un servicio sigue siendo de
gerencia/supervisión (`canDelete`). El plan se graba con `upsert` para que dos
guardados seguidos no creen dos planes.

**Pruebas** — `tests/planes.test.ts` (11/11): estados válidos, solo el activo
produce trabajo, el flujo recorre los 5 estados sin saltarse ninguno, totales por
moneda, y la precedencia del día acordado (manda sobre la regla, corre al hábil
siguiente, se ignora fuera de rango). Batería completa: evaluator 15, form-rules
8, contable 13, fiscal 21, planes 11, workflow 10, builder 9, pipeline-rules 10,
hardening 11 (**108/108**); `tsc --noEmit` y ESLint limpios en lo nuevo.
Verificado E2E en navegador sobre un cliente demo: plan de 350 USD creado →
agregadas 2 obligaciones → Retenciones de ISLR calcula **14-ago** (10 días
hábiles) y la de terminación de RIF avisa que **ese cliente no tiene RIF**
(integración real con F1) → día acordado 25 la mueve a **25-ago** → servicio
«Auditoría» 1.200 USD creado con responsable y entrega, avanzado de cotizado a
aprobado → plan pausado muestra que no genera casos ni factura. Datos de prueba
borrados después (0 planes, 0 servicios, 6 empresas demo intactas).

---

## 14. Adaptación contable — F4: caso recurrente y el loop mensual — 2026-07-27

El corazón del negocio: cada obligación de cada cliente en cada período fiscal es
un **caso**, y al presentarlo el sistema abre solo el del período siguiente. Todo
lo construido en F1-F3 (RIF, motor de vencimientos, plan de servicios) entra aquí
a trabajar. **El loop no es código especial: son cuatro reglas del Automation
Engine hechas de datos.**

**Modelo** — `CasoRecurrente`: `companyId`, `obligacionId`, `periodoFiscal`,
`fechaLimite` (nullable: la obligación manual o la falta de calendario la dejan
al analista), `estado`, `analistaId`/`supervisorId`, los hitos del ciclo
(`fechaSolicitudSoportes`, `fechaRecepcionCompleta`, `fechaPresentacion`),
`evidenciaUrl`, `causaAtraso` y `notas`. La barrera contra duplicados es
**`@@unique([companyId, obligacionId, periodoFiscal])`** — no la lógica: aunque
dos caminos intenten abrir el mismo caso, la base solo deja uno.

**Vocabulario** — `lib/casos.ts` (puro): `ESTADOS_CASO` cuyo orden ES el ciclo
(`pendiente_cliente → en_proceso → en_revision → presentado`); **`vencido` queda
fuera del arreglo a propósito** porque no es un paso más sino donde cae lo que se
pasó de fecha, y `siguienteEstadoCaso("vencido")` devuelve `en_proceso`:
vencerse no exime de presentar. Semáforo por proximidad (`vencido | hoy |
urgente ≤3d | proximo ≤10d | tranquilo | sin_fecha`) con `diasHasta` comparando
**por día calendario, no por horas** — un caso que vence hoy a las 8am no está
vencido.

**Servicio del loop** — `lib/fiscal/casos.ts` (servidor):
- `generarCasosDelPeriodo` abre los casos del período en curso desde los planes
  **activos**, con la fecha del motor de F2 y el analista/supervisor del cliente.
  Idempotente.
- `clonarSiguientePeriodo` abre el período que sigue al presentar. Se detiene
  solo si el plan se pausó/canceló o la obligación salió del plan.
- `marcarVencidos` pasa a `vencido` lo que se le fue la fecha; devuelve los
  cambios para que `queue.ts` emita `caso.vencido` (evita el ciclo de imports).

**Extensión del Automation Engine** (entradas de catálogo, no lógica nueva):
- `builder.ts`: módulo `caso_recurrente`, eventos `caso.creado`,
  `caso.en_revision`, `caso.presentado`, `caso.vencido`, 17 campos para
  condiciones (incluidos `obligacion.*` y `company.*`) y `caso_recurrente` como
  opción de `crear_registro`.
- `actions.ts`: `loadEntity` resuelve además **un contacto de la empresa** para
  que las tareas del workflow queden colgadas de alguien con quien hablar;
  `UPDATABLE.caso_recurrente` deja fuera `fechaLimite` (la calcula el motor) y la
  asignación; y `crear_registro caso_recurrente` **no recibe datos**: el período
  y la fecha salen del motor, no de lo que escriba quien arma la regla.
- `queue.ts`: barrido de tiempo sobre casos no presentados y `sweepCasosVencidos`
  dentro de `runEngineTick`. Que un caso vencido figure como vencido es del
  sistema; **qué hacer al respecto lo deciden las reglas**.
- `recurringCaseScope` en `lib/permissions.ts` (asignados + cartera del analista).

**Guard anti-bucle:** el clon **nace en `pendiente_cliente`, nunca en
`presentado`**, así no vuelve a disparar el clonado. Ese es el guard real del
loop; `MAX_EVENT_DEPTH=3` es solo la red adicional.

**Reglas semilla** (`prisma/seed-rules.ts`, +4 → 12 en total): clonar el período
al presentar (+ actividad en el historial) · pedir soportes a T-10 con tarea y
aviso (condición: `estado = pendiente_cliente` Y `fechaLimite` dentro de 10 días)
· aviso de caso vencido · aviso al supervisor al entrar en revisión.

**Bandeja `/casos`** — filtros por período, estado, ente y analista; KPIs de
vencidos/urgentes/abiertos/presentados; semáforo por fila y avance de estado en
un clic. `components/casos/CasoRow.tsx` usa `<details>` nativo para el detalle
(hitos, comprobante, causa de atraso, reasignación) sin convertir la lista en
componente cliente. Entrada «Casos» en el Sidebar.

**Pruebas** — `tests/casos.test.ts` (17/17, contra copia de BD): semáforo y ciclo
de vida, generación idempotente, plan pausado que no genera trabajo, obligación
sin fecha calculable que abre el caso igual avisando, día acordado del plan,
clonado con fecha recalculada, doble clonado que no duplica, loop detenido al
pausar el plan o sacar la obligación, **el loop completo por el engine** (presentar
→ un solo caso nuevo, job `ok`), **tres pasadas de cola sin cadena infinita**, y
el barrido de vencidos que respeta lo presentado. Batería: evaluator 15,
form-rules 8, contable 13, fiscal 21, planes 11, workflow 10, builder 9,
pipeline-rules 10, hardening 11, casos 17 (**125/125**); `tsc` y ESLint limpios.
Verificado E2E en navegador: plan con «Retenciones de ISLR» → «Abrir casos del
período» abre julio con vencimiento **14-ago** (10 días hábiles) → a revisión
dispara el aviso al supervisor en la campanita → presentado con comprobante
**abre agosto con vencimiento 14-sep** y deja la actividad en el historial →
volver a pulsar «Abrir casos» no duplica nada. Datos de prueba borrados (0 casos,
0 planes, 6 empresas demo, 12 reglas seed).

---

## 15. Adaptación contable — F5: calendario fiscal — 2026-07-27

Los vencimientos de los casos (F4) aparecen en `/calendario` junto a las tareas.
Fase corta porque `CalendarView` ya era agnóstico de la fuente: consume
`CalEvent[]`, no `Task[]`. **Cero cambios en `MonthGrid`/`TimeGrid`.**

- `CalEvent` gana el discriminador **`kind: "task" | "obligacion"`** y `href`.
- `app/(crm)/calendario/page.tsx` suma una segunda consulta de `CasoRecurrente`
  con **`recurringCaseScope`** (el mismo alcance por rol que la bandeja) y la
  mapea: `dueDate` = `fechaLimite`, `hasTime: false`, `ownerId` = analista,
  `contactName` = razón social. El `id` va prefijado `caso-…` para que no se
  confunda con el de una tarea.
- **`done` = caso presentado**: reutiliza el tachado que el calendario ya hacía
  con las tareas cumplidas, sin agregar una variante visual nueva.
- Color propio en `typeStyle` (rosa) y entrada «Obligación fiscal» en la leyenda.
- **El clic no abre el `EventModal`** — ese modal es CRUD de `Task` y una
  obligación no se edita ahí: `openEvent` navega a `/casos?periodo=…` (el período
  fiscal del caso, no el mes en que vence) para trabajarlo en la bandeja.
- El filtro por responsable que ya existía funciona igual: el dueño de un
  vencimiento es su analista.

**Pruebas** — `tests/casos.test.ts` sube a 18 con el alcance por rol
(`recurringCaseScope`) verificado contra la BD: el analista no ve el caso ajeno,
el admin ve todo, y al asignárselo entra en su alcance — el riesgo real de sumar
una segunda fuente al calendario es la fuga, no el render. Batería **126/126**;
`tsc` y ESLint limpios. Verificado E2E en navegador: el vencimiento del 14-ago
aparece en la vista **mes** (agosto) y en la de **semana** (10-16 ago) con su
color rosa, y al hacer clic navega a `/casos?periodo=2026-07` **sin abrir el
modal de tareas**. Datos de prueba borrados.

---

## 16. Adaptación contable — F6: facturación automática — 2026-07-27

El honorario de cada plan activo se emite solo cada mes y el servicio individual
al entregarse. `/facturacion` lleva la cobranza.

**Desvío deliberado del plan original.** El plan planteaba la facturación como
una **regla semilla** del Builder sobre `tiempo.transcurrido`. Se implementó como
**barrido del sistema** (`sweepFacturacion` en `runEngineTick`) porque *el dinero
no puede depender de un interruptor*: si alguien desactiva la regla desde
`/automatizaciones`, la firma deja de facturar y nadie se entera. La división es
la misma que en F4 con los casos vencidos: **emitir el cobro es del sistema;
avisar de él lo deciden las reglas** (evento `factura.emitida` + regla semilla
que notifica, ahora 13 en total).

**Modelo `Facturacion`** — `companyId`, `tipo` (honorario_fijo |
servicio_individual), `origenId` (id del plan o del servicio; **no es FK** porque
el origen sale de dos tablas), `concepto`, `monto`, `moneda`, `periodo`,
`estadoPago`, `fechaEmision`, `fechaPago`, `notas`.

**El índice único lleva `origenId`** — `@@unique([companyId, periodo, tipo,
origenId])` — y no las tres columnas que decía el plan: un cliente sí puede tener
**dos servicios individuales facturados en el mismo mes**, y el unique de tres
lo habría bloqueado. Para el honorario el `origenId` es siempre el mismo planId,
así que sigue siendo uno por período.

**`lib/facturacion.ts`** (puro): tipos y estados con etiquetas,
`facturaVencida` (pendiente + `DIAS_PARA_VENCER`=30 desde la emisión; lo cobrado
no vence), y totales **por estado y por moneda** reutilizando `totalPorMoneda` de
F3. `porCobrar` = pendiente + vencido (lo cobrado ya no se persigue).

**`lib/fiscal/facturacion.ts`** (servidor): `facturarHonorariosDelPeriodo`
(idempotente; **un plan con honorario 0 no genera cobro** — hay clientes en
cortesía y una factura de cero solo ensucia la bandeja),
`facturarServicioEntregado` (lo llama `cambiarEstadoServicio` al llegar a
*entregado*; el índice único impide cobrar dos veces si el estado va y viene) y
`marcarFacturasVencidas`.

**Engine:** módulo `facturacion`, eventos `factura.emitida` / `factura.pagada`,
10 campos para condiciones, `loadEntity`, barrido de tiempo sobre lo no cobrado y
`UPDATABLE` que **deja fuera monto y período** (los emite el sistema) pero
permite anotar y marcar el cobro. El barrido corre en cada tick: al ser
idempotente no duplica, y además factura al día un plan dado de alta a mitad de
mes.

**UI** — `/facturacion` (entrada en el Sidebar): KPIs de total por cobrar /
pendiente / cobrado / vencida, filtros por período y estado, marcar cobrada (y
revertir), nota de cobranza y botón «Correr facturación del mes» para no esperar
al barrido. La cobranza es de gerencia y supervisión (`canReassign`); el analista
ve la de su cartera (`companyScope`) en solo lectura. **No se crean ni borran
facturas a mano**: el origen siempre es un plan activo o un servicio entregado.

**Pruebas** — `tests/facturacion.test.ts` (14/14): vencimiento por plazo, totales
por estado y moneda sin mezclar, emisión mensual idempotente, mes siguiente que
sí cobra, plan pausado/cancelado/sin honorario que no factura, servicio entregado
que factura una sola vez, **dos servicios distintos del mismo mes que sí
conviven** (la razón del `origenId` en el unique), honorario y servicio juntos, y
el barrido de vencidas que respeta lo cobrado. Batería **140/140**; `tsc` y
ESLint limpios. Verificado E2E en navegador: «Correr facturación del mes» emite
el honorario de 350 USD con su aviso en la campanita → pasar el servicio a
*entregado* emite su factura de 1.200 USD → total por cobrar 1.550 USD → marcar
cobrada mueve 1.200 a «Cobrado» y sella la fecha de pago. Datos de prueba
borrados (6 empresas demo, 13 reglas seed).

---

## 17. Adaptación contable — F7: reetiquetado y flujo de venta — 2026-07-27

Última fase: el sistema habla el idioma de la firma.

**Roles Gerente / Supervisor / Analista** — `roleLabels` en `lib/permissions.ts`.
**Las claves `admin | supervisor | vendedor` NO cambian**: tocarlas obligaría a
reescribir los permisos, invalidaría las sesiones ya emitidas y rompería las
condiciones `has_role` guardadas en la base. Se agregó `roleLabel(role)` para
textos corridos, con respaldo «usuario» ante un rol desconocido.

Los textos sueltos ahora **toman la etiqueta del diccionario** en vez de repetir
la palabra, así no vuelven a desincronizarse: `usuarios` (el select se genera
desde `ROLES`), `login` (los chips también), `contactos` (columna y ficha),
`pipeline/[id]`, `PipelineBoard`, `aprobaciones`, `api/alertas`,
`contactos/actions` y los campos «Analista asignado» del Builder. Los `?? "vendedor"`
de respaldo pasaron a `"un analista"`.

**Etapas del pipeline** → el flujo del documento del cliente: **Lead →
Calificación → Diagnóstico → Propuesta → Cierre** (+ Ganado/Perdido). Se
renombraron en la base viva con un `UPDATE` en vez de re-sembrar: las
oportunidades y **las reglas de pipeline sobrevivieron intactas porque están
ligadas por `stageId`**, exactamente el riesgo que F5 del engine (§7) resolvió en
su momento. `seed-rules.ts` ahora busca la etapa «Cierre».

**Catálogos demo** (`prisma/seed.ts`) al dominio contable: orígenes de lead de una
firma contable (**«Referido» y «Sitio web» se conservan tal cual porque las reglas
semilla los usan como condición**), tipos de tarea con «Solicitud de soportes», y
sectores económicos. Además **`seed.ts` vacía `CatalogOption`**, así que ahora
repone también los catálogos contables de F1/F3 importando `catalogosContables`
de `seed-catalogos-contables.ts` — antes un re-seed los habría borrado. Las
oportunidades demo pasaron a servicios de la firma (outsourcing contable, IVA y
retenciones, regularización ante el SENIAT…) y el usuario de prueba se llama
«Analista de prueba».

**Deuda saldada:** el error de ESLint en `Sidebar.tsx` que el proyecto arrastraba
desde la Fase 4 del engine (setState dentro de un efecto). Se resolvió sin efecto:
el estado del menú guarda **con qué ruta se abrió**, y si la ruta actual es otra
el menú ya está cerrado en el mismo render. Se agregó `.claude/**` a los ignores
de ESLint (los worktrees son copias del repo y duplicaban cada aviso). **ESLint
queda en 0 errores por primera vez**; los 3 avisos restantes son variables sin
usar, preexistentes.

**Pruebas** — `tests/contable.test.ts` sube a 16 con la invariante que protege lo
delicado: **las claves de rol siguen siendo `admin|supervisor|vendedor`**, las
etiquetas son las contables y ninguna menciona ventas. Las suites de
pipeline-rules y hardening se actualizaron a los nuevos nombres de etapa.
Batería **143/143**; `tsc` limpio y ESLint sin errores. Verificado E2E:
Gerente/Supervisor/Analista en `/usuarios` (con los `value` internos intactos) y
en los chips del login · columna «Analista» en contactos · pipeline con las cinco
etapas nuevas · ficha de oportunidad «Analista: …» · menú móvil que sigue
cerrándose al navegar tras quitar el efecto.

---

## 18. Estado final: adaptación contable COMPLETA ✅

Las 7 fases están implementadas, probadas y verificadas E2E (§11-17). El CRM de
ventas genérico opera hoy como sistema de una firma de outsourcing contable:
ficha fiscal del cliente con RIF · motor de vencimientos con calendario del
SENIAT y días hábiles · plan de servicios y trabajos puntuales · **loop mensual
de obligaciones que se clona solo al presentar** · calendario con los
vencimientos · facturación automática y cobranza · y el vocabulario de la firma
en toda la UI. **143/143 pruebas**, `tsc` limpio, ESLint sin errores.

**Criterio de diseño que atraviesa las fases y conviene mantener:** lo que el
sistema debe garantizar (emitir una factura, marcar un caso vencido, calcular una
fecha límite) **no se implementa como regla configurable del Builder**; las
reglas deciden qué se comunica, no si ocurre. Y el motor fiscal **nunca inventa
una fecha**: sin datos devuelve el motivo para que lo resuelva el analista.

**Pendiente operativo:** cargar el calendario del SENIAT del año desde
`/configuracion` cuando salga la providencia (dato del cliente, no código) y
correr `npm run setup:prod-db` al desplegar — los 7 modelos nuevos existen solo
en la SQLite local.

---

## 19. Instalación en servidor del cliente — migraciones versionadas — 2026-07-27

Primer paso del paquete de instalación local (Windows + PostgreSQL, 30+ usuarios
concurrentes). Documentación de uso en **`MIGRACIONES.md`**.

**El problema:** el proyecto se actualizaba con `prisma db push`, que sincroniza
el esquema **sin historial**. Sirve en desarrollo (la base local es descartable)
y es inaceptable en casa de un cliente: no se sabe qué versión tiene instalada,
no se puede aplicar solo lo que falta, y no hay forma de revisar el SQL antes de
ejecutarlo sobre datos reales de facturación y obligaciones fiscales.

**El diseño:** desarrollo sigue en **SQLite con `db push`** (las pruebas trabajan
sobre copias del archivo — rápidas y aisladas); el servidor del cliente usa
**PostgreSQL con migraciones versionadas** en `prisma/migrations/`.

**La pieza clave — generar migraciones sin base de datos.** `prisma migrate dev`
exigiría un PostgreSQL levantado y una *shadow database*, lo que ataría el
desarrollo local a tener Postgres corriendo. En su lugar,
`scripts/nueva-migracion.mjs` compara **dos archivos de texto**:
`prisma/baseline/schema.migrada.prisma` (foto del esquema en la última
migración, **commiteada**) contra el esquema actual, vía `prisma migrate diff
--from-schema-datamodel … --to-schema-datamodel …`. Cero infraestructura.

**Comandos** (`package.json`):
- `npm run db:migracion "descripción"` — crea la migración desde los cambios del
  esquema. Avisa si el SQL contiene `DROP TABLE` / `DROP COLUMN` / `ALTER COLUMN`,
  que **borran datos del cliente**.
- `npm run db:aplicar` — `migrate deploy` en el servidor (lo usará el instalador).
- `npm run db:estado` — qué migraciones le faltan a una instalación.
- `setup:prod-db` pasó de `db push` a migraciones, y ahora siembra también
  obligaciones y catálogos contables (antes quedaban fuera).

**Verificado contra un PostgreSQL 16 real** (contenedor efímero, no queda nada en
el repo):
1. La migración inicial crea las **31 tablas** y deja **cero diferencias** con el
   modelo (`migrate diff` contra la base ya migrada devuelve vacío).
2. Con datos cargados, dos migraciones sucesivas se aplicaron de forma
   incremental y **los registros existentes sobrevivieron** — que es el punto.
3. `setup:prod-db` completo sobre PostgreSQL y **la aplicación arrancó contra
   Postgres**: login, dashboard y el motor de vencimientos idénticos a SQLite.
4. El generador detecta correctamente «no hay cambios» y no crea migraciones
   vacías.

**Nota para una base ya creada con `db push`** (el despliegue en la nube):
hay que marcar la inicial como aplicada antes del primer `db:aplicar` —
`prisma migrate resolve --applied 20260727000000_estado_inicial`. Está en
`MIGRACIONES.md`.

**Sigue:** el instalador `.exe` para Windows (Inno Setup + PostgreSQL + Node
embebido + servicio de Windows + panel de administración + backups con `pg_dump`).

*Última actualización: F7 y cierre de la adaptación contable (roles, etapas del
pipeline y catálogos demo) sobre F6 (§16), F5 (§15), F4 (§14), F3 (§13), F2
(§12), F1 (§11), la visibilidad por vendedor (§10), el Automation Engine (§7-8) y
los módulos de correo y calendario (§9).*
