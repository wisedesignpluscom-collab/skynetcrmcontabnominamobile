# CLAUDE.md — Nogui CRM · Automation Engine

> Documento de arquitectura. Las secciones 1-6 son el plan original (Fase 0); el
> **estado real de implementación está en la sección 7** y el resumen final en la
> **sección 8**. El Automation Engine está **COMPLETO** (Fases 1-6 implementadas,
> probadas y verificadas E2E). Leer la sección 7/8 antes de tocar el engine.

---

## 1. Stack y arquitectura actual detectada

| Capa | Tecnología | Detalle |
|---|---|---|
| Framework | Next.js 16 (App Router, Turbopack) | React 19, TypeScript estricto |
| Estilos | Tailwind CSS v4 | Paleta slate + acento teal; tema propio, responsive (drawer móvil) |
| ORM / BD | Prisma 6 | SQLite en desarrollo, PostgreSQL en producción (cambio solo por `DATABASE_URL`) |
| Mutaciones | **Server Actions** (`"use server"`) | No hay API REST salvo `app/api/alertas` (polling de la campanita). Patrón: `FormData` → validar → Prisma → `revalidatePath` |
| Auth | Propia: JWT (jose) en cookie httpOnly `nogui_session` | `proxy.ts` protege todo excepto `/login` y `/formulario`; sesión de 7 días; bcryptjs para contraseñas |
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
(`cp prisma/dev.db /tmp/nogui-test.db && DATABASE_URL="file:/tmp/nogui-test.db" npx tsx
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

**Import/export** (`lib/engine/portable.ts`): bundle `nogui-automations/v1`. Clave
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
al engine como reglas `isSystem`; envío SMTP real para drenar `EmailOutbox`; build
de producción y despliegue. Nota técnica: Next 16 avisa que `middleware.ts` pasará
a llamarse `proxy.ts`.

*Última actualización: Fase 6 (endurecimiento para producción) completada, probada y verificada E2E. **Automation Engine terminado.***
