# CLAUDE.md — Nogui CRM · Plan de integración del Automation Engine

> Documento de arquitectura. Fase 0 (análisis y estrategia). No se ha escrito código
> del Automation Engine todavía; este plan requiere aprobación antes de implementar.

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

### ⏭️ Próxima fase: Workflow Automation (dispatcher `emitEvent()`, ejecutores de acciones, log en `AutomationRun`, migración de reglas v1) y luego el Builder visual

*Última actualización: Fase 2 completada y probada; pendiente aprobación para la siguiente.*
