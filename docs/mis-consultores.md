# CLAUDE.md — Adaptación CRM para Mis Consultores

## Contexto del proyecto
CRM propio de WISEDESIGN, adaptado para el nicho de outsourcing contable, para el
cliente "Mis Consultores" (~200 empresas, ~4,000 trabajadores, opera con Excel +
Galac módulo IVA-Renta + 150+ grupos de WhatsApp).

## Stack y convenciones
- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript estricto ·
  Tailwind CSS v4 · Prisma 6 (SQLite en desarrollo, PostgreSQL en producción,
  cambio solo por `DATABASE_URL`) · Server Actions (`"use server"`, patrón
  `FormData` → validar → Prisma → `revalidatePath`; no hay API REST salvo
  `app/api/alertas`) · Auth propia JWT (jose) en cookie httpOnly, `proxy.ts`
  protege todo excepto `/login` y `/formulario`.
- El Rule Engine, Form Rules, Workflow Engine, Automation Builder y Pipeline
  Rules ya existen y están completos — viven en `lib/engine/*`
  (`evaluator.ts`, `load.ts`, `formRules.ts`, `validate.ts`, `events.ts`,
  `queue.ts`, `actions.ts`, `builder.ts`, `persist.ts`, `versions.ts`,
  `portable.ts`) con UI en `/automatizaciones`
  (`components/automations/*`). Pipeline Rules está integrado en
  `applyStageMove` (`lib/deals.ts`). Detalle completo de cómo se construyó
  cada pieza: `CLAUDE.md` en la raíz del repo (documento del Automation
  Engine general — leerlo antes de tocar ese código).
- Estética: dark-mode premium, tipografía serif display, acentos oro/cobre o cyan
  (misma línea visual que el resto de proyectos de WISEDESIGN / Wise Designs+).

## Requisitos de seguridad — TRANSVERSALES, aplican a TODAS las etapas
No es una etapa aparte. Cada incremento que se construya, sin excepción, debe
cumplir esto desde el primer commit, no como parche posterior:
- Acceso a base de datos SOLO vía queries parametrizadas / ORM — cero
  concatenación de strings en SQL, bajo ninguna circunstancia.
- Validación y saneamiento de TODO input de usuario en el backend (nunca
  confiar solo en validación de frontend).
- Autenticación: hashing de contraseñas con bcrypt/argon2, tokens de sesión
  (JWT o equivalente) con expiración corta y renovación segura.
- Autorización aplicada a nivel de query/servicio, no solo ocultando botones en
  el frontend — un Analista no debe poder alcanzar por API una empresa que no
  tiene asignada, aunque adivine el ID.
- Protección CSRF en formularios, sanitización de salida para evitar XSS.
- Rate limiting en endpoints de login y en el generador de archivos planos
  (evitar abuso/DoS).
- Secretos (credenciales de BD, API keys) en variables de entorno, nunca
  hardcodeados ni versionados en el repo.
- HTTPS obligatorio en cualquier despliegue, incluso en ambiente de pruebas si
  es posible.
- Log de auditoría para acciones sensibles: quién generó un archivo plano,
  quién desbloqueó una revisión supervisoria, quién cambió el estatus de un
  caso.

## Aclaración sobre el módulo de nómina (Etapa 2)
Este módulo NO es un módulo de RRHH genérico. Es una **fuente única de verdad
del trabajador**: cada trabajador se captura y valida UNA sola vez, y esa
misma data se reutiliza para generar los distintos archivos planos (TXT/XML)
que necesita Galac, sin que el analista tenga que volver a transcribir la
información cada vez que cambia el tipo de carga o declaración. El objetivo
explícito es eliminar la sobreescritura y duplicación de captura de datos.

## Reglas de trabajo para Claude Code
1. Trabajar SIEMPRE en incrementos pequeños dentro de cada etapa (un modelo, un
   endpoint, un componente por vez). Nunca generar una etapa completa en una sola
   respuesta.
2. Minimizar tokens: no releer archivos completos si ya están en contexto reciente,
   usar diffs/`str_replace` en vez de reescribir archivos enteros, no narrar el
   proceso paso a paso — resumen breve al final de cada incremento.
3. Al terminar cada ETAPA completa (no cada incremento), presentar un resumen de
   máximo 6-8 líneas de lo construido y detenerse a esperar aprobación explícita.
4. No avanzar a la siguiente etapa sin la palabra "aprobado" (o equivalente
   explícito) del usuario.
5. Al recibir la aprobación: actualizar este archivo `docs/mis-consultores.md`
   (sección "Estado actual" abajo) con lo decidido y construido, ANTES de
   sugerir `/clear`.
6. Después de actualizar el archivo, indicar al usuario que puede correr
   `/clear` y que el siguiente mensaje debe ser simplemente "continuar con la
   etapa N", ya que este archivo contiene todo el contexto necesario para
   retomar.

## Orden de etapas (WhatsApp queda de último a propósito)
1. Fundacional: esquema de datos, roles/permisos, Rule Engine (validación FAO),
   Workflow Engine (estados + bloqueo supervisorio), dashboard con 4 filtros.
2. Módulo de Nómina completo (ver especificación detallada más abajo, sección
   "ESPECIFICACIÓN FUNCIONAL — MÓDULO DE NÓMINA"), dividido en 7 sub-etapas:
   2.1 Menú "Nómina" + Home + sub-navegación
   2.2 Gestionar empleados (fuente única de verdad del trabajador)
   2.3 Configuración de nómina — parte 1 (País y monedas, Horarios y jornadas)
   2.4 Configuración de nómina — parte 2 (Cuentas contables, Conceptos y
       bonos, Compensación USD, Beneficios y políticas, Parámetros legales)
   2.5 Operación de Nómina (asistencia + corrida + exportación Galac TXT/XML)
   2.6 Vacaciones, Utilidades, Liquidaciones (módulos de cálculo LOTTT)
   2.7 Reportes y Ubicaciones
3. Procesos operativos por obligación + cuentas por pagar de nómina (insertada
   antes de Segmentación, ver plan aprobado en la conversación — pedido
   adicional del cliente basado en su manual de procedimientos), dividida en
   7 sub-etapas:
   3.1 Modelo de datos: ObligacionFase, CasoFase, AportePorPagar
   3.2 Motor puro de evidencia y transición (validación + gate del avance)
   3.3 Seed de plantillas de fases (FAOV, IVSS, INCES, ISLR, IVA, IAE,
       Pensiones-SENIAT)
   3.4 UI: línea de tiempo y captura de evidencia en /casos
   3.5 Vista de supervisión (fase actual, días sin avance por analista)
   3.6 Proceso "Crear empresa" (apertura, una sola vez, ficha del cliente)
   3.7 Aportes patronales → Cuentas por pagar de nómina
4. Segmentación y notificaciones: Pipeline Rules (matriz Dorados/Azules/
   Amarillos/Verdes), Automation Builder (plantillas de notificación, sin canal
   WhatsApp todavía — solo email/in-app).
5. Carga de datos y preparación de entrenamiento: scripts de importación masiva,
   datos semilla, documentación operativa para el personal.
6. Portal de cliente (Fase 2 explícita del cliente): consulta de estatus,
   descarga de soportes.
7. Omnicanalidad WhatsApp: bandeja unificada, enrutamiento por departamento,
   integración con WhatsApp Business API o proveedor equivalente.

## ESPECIFICACIÓN FUNCIONAL — MÓDULO DE NÓMINA
Basada en análisis directo de capturas de pantalla de un sistema de referencia
(SofIA/KPI Business Services). Se replica la ESTRUCTURA y FUNCIONALIDAD, no los
assets visuales — usar la identidad visual propia (dark-mode premium, serif
display, oro/cobre/cyan) descrita arriba, no los colores/imágenes del
sistema de referencia.

### 2.1 Menú "Nómina" + Home + sub-navegación
- Nueva entrada "Nómina" en el menú principal (sidebar), con ícono de personas,
  ubicada junto a los demás módulos operativos/administrativos existentes.
- Sub-navegación horizontal en la parte superior de toda la sección de nómina,
  presente en todas sus pantallas: "Nóminas" (activo/pill) | separador | "Vista
  empleado" | "Mi panel" | "Marcar asistencia" | "Mis recibos".
- Pantalla Home del módulo:
  - Tarjeta hero con contexto (marco legal/país, contador de empleados
    activos, moneda base) y botón "Asistente de configuración" (wizard).
  - Grid de 8 tarjetas de acceso directo, cada una con ícono, color propio y
    descripción corta: Gestionar empleados, Operación de Nómina, Vacaciones,
    Utilidades, Liquidaciones, Reportes, Ubicaciones, Configuración.

### 2.2 Gestionar empleados (fuente única de verdad del trabajador)
- Layout split: lista a la izquierda, panel de detalle a la derecha.
- Dos tarjetas de alta: "Agregar empleado interno" (solo nombre + cédula, para
  personal sin acceso a la plataforma — operarios, obreros, vendedores) e
  "Importar desde Usuarios" (vincula usuarios ya existentes en el sistema; sus
  datos personales se sincronizan automáticamente — evita doble captura).
- Contador de plan: "X/N empleados incluidos" con barra de progreso y nota de
  cobro por adicional (si aplica a tu modelo de negocio con Mis Consultores).
- Tabs "Activos (n)" / "Inactivos (n)" + buscador por nombre, cédula o cargo.
- Panel de detalle del empleado con tabs: Resumen, Contrato, Documentos,
  Ciclo de vida. Botones "Editar datos" y "Deshabilitar" (no eliminar — baja
  lógica, para preservar historial).

### 2.3 Configuración de nómina — parte 1 (modal multi-tab)
Modal con sidebar de navegación interna (7 secciones), header con ícono +
título "Configuración de nómina" + botón "Modo edición", footer con "Cerrar"
(y "Guardar cambios" cuando la sección tiene campos editables en el nivel
superior).
- **País y monedas**: selector de país, frecuencia de pago (ej. quincenal
  1-15/16-fin), selección de moneda por tipo de concepto (salario base, bonos,
  deducciones — cada uno VES/USD independientemente), notas internas.
- **Horarios y jornadas**: CRUD de jornadas laborales. Cada jornada: nombre,
  entrada/salida (time pickers), descanso en minutos (no remunerado, se
  descuenta), horas efectivas (calculadas), método (fija/otro), tolerancia en
  minutos, umbral de medio día en horas, toggle de jornada nocturna, días de
  operación (selector L-M-M-J-V-S-D + presets "L-V", "L-S", "Todos").

### 2.4 Configuración de nómina — parte 2
- **Cuentas contables**: 4 cuentas base para el asiento contable (gasto de
  sueldos-debe, nómina por pagar VES, nómina por pagar USD, deducciones por
  pagar) + botón "Autoasignar" (plantilla estándar/IA).
- **Conceptos y bonos**: catálogo activable de conceptos (horas extra
  diurnas/nocturnas, bono nocturno, día feriado trabajado, día adicional
  trabajado, etc.), cada uno con checkbox/radio de activación, moneda, y la
  fórmula visible como texto de ayuda (ej. "(sueldo/30/8)*horas*(1+recargo)").
  Editable/renombrable, se pueden agregar bonos propios de la empresa.
- **Compensación USD**: toggle "Igualar el neto a un objetivo en USD" — calcula
  automáticamente un bono compensatorio; campo de objetivo USD por empleado
  (opcional, sobre-escribible en la ficha individual de cada empleado).
- **Beneficios y políticas**: Utilidades (días/año con mínimo/máximo legal,
  tipo de distribución — ej. pago único en diciembre); Vacaciones (días extra
  sobre el mínimo legal, bono vacacional en días extra, toggle de vacaciones
  colectivas); Cestaticket (objetivo mensual en USD, 0 = solo mínimo legal);
  Anticipos y préstamos (sección adicional).
- **Parámetros legales**: toggle "Personalizar valores del país" — valores
  base (salario mínimo, bono de guerra, cestaticket mensual, valor de la
  Unidad Tributaria, jornada semanal en horas) + secciones colapsables de
  Aportes del trabajador y Aportes patronales. AQUÍ vive la lógica de
  validación de base de cálculo (el punto crítico del FAO que motivó todo
  este proyecto) — la base debe derivarse de estos parámetros legales, no de
  un valor fijo que el cliente quiera imponer.

### 2.5 Operación de Nómina (asistencia + corrida)
- Selector de período con navegación anterior/siguiente, selector de fecha
  puntual, toggle "Ocultar fines de semana", y control de frecuencia
  (quincenal/otra) en la esquina superior derecha.
- Grid principal: empleados en filas, días del período en columnas; cada
  celda muestra horas trabajadas (editable) y checkbox de columna para
  selección masiva (aplicar cambios a varios días a la vez).
- Botones "Guardar borrador" y "Crear corrida del período".
- **Punto de integración con Galac**: aquí es donde va la acción de exportar
  la corrida generada a los archivos planos TXT/XML — no como módulo aparte,
  sino como una acción sobre la corrida ya calculada. Aplica también el motor
  de auditoría (cruce contra histórico) antes de permitir la exportación.

### 2.6 Vacaciones, Utilidades, Liquidaciones (cálculo LOTTT)
Patrón común a las tres pantallas — constrúyelo como un componente
reutilizable, no tres implementaciones separadas:
- Header con "Volver a Nómina", título, subtítulo "LOTTT · Venezuela",
  referencia al artículo legal aplicable, link "Ver lógica de cálculo"
  (transparencia del cálculo — importante para que el analista pueda
  auditar, no solo confiar ciegamente).
- Botón de acción principal (varía por módulo: "Generar borrador",
  "Programar vacaciones", "Nueva liquidación").
- Tabla de registros con estado vacío ("Sin registros — pulsa...").
  - Vacaciones: Empleado, Período, Días tomados, Pendientes, Estado, Acciones.
  - Utilidades: Empleado, Calculado, Pagado, Pendiente, Estado, Acciones.
  - Liquidaciones: Empleado, Fecha egreso, Motivo, Prestaciones, Vacaciones,
    Utilidades, Total, Estado, Acciones.

### 2.7 Reportes y Ubicaciones
- Reportes: filtro de rango de fechas (Desde/Hasta), 4 tarjetas resumen
  (Bruto, Deducciones, Neto, ≈USD al cambio del día), tabs (Costo por corrida,
  Asistencia, Cuentas por pagar, LOTTT), tabla de corridas en el rango
  (Período, Pago, Estado, Bruto, Deducciones, Neto, ≈USD).
- Ubicaciones: geocerca para marcaje de asistencia — no hay captura de
  referencia todavía; construir el concepto genérico (definir zona geográfica
  + radio, vincular a jornadas) y ajustar cuando se vea el original o se
  defina con el cliente.

## Estado actual
- Etapa activa: **4 (Segmentación y notificaciones)** — empezar por la matriz
  Dorados/Azules/Amarillos/Verdes sobre Pipeline Rules. Sin especificación
  detallada todavía más allá del título: falta definir con el cliente qué
  determina que un cliente sea Dorado/Azul/Amarillo/Verde y qué dispara cada
  categoría, antes de poder planificarla en sub-etapas (mismo criterio que se
  usó para el manual de procedimientos de la Etapa 3).
- Etapas completadas y aprobadas:
  - **1 (Fundacional)** — aprobada 2026-08-09.
  - **2 (Módulo de Nómina, las 7 sub-etapas 2.1-2.7 completas)** — aprobada
    2026-08-10.
  - **3 (Procesos operativos por obligación + cuentas por pagar de nómina,
    sub-etapas 3.1-3.7)** — aprobada 2026-08-11. Incluye además, del mismo
    cierre de conversación: el rediseño del calendario del SENIAT (ver
    «Trabajo adicional» al final de la sección de la Etapa 3) y el reemplazo
    del timeline de pipeline de ventas por el de servicios en la ficha del
    cliente (ver esa misma sub-sección).
- Decisiones pendientes (ver también sección de preguntas abiertas del plan):
  1. Alcance exacto del generador de archivos planos Galac (TXT/XML). El
     punto de integración quedó identificado en 2.5 (acción sobre la corrida
     ya calculada, con el motor de auditoría corriendo antes) pero **no se
     construyó todavía** — falta definir el formato exacto con el cliente.
  2. Proveedor de integración WhatsApp (API oficial de Meta vs Twilio/360dialog)
  3. Infraestructura definitiva: AWS confirmado, o servidor local sigue como
     opción B
  4. Comportamiento del motor de auditoría de corridas (2.5) ante
     inconsistencia: hoy `CorridaNomina.auditoriaAlerta` solo informa (no
     bloquea la corrida) — confirmar con el cliente si algún caso debe
     bloquear en vez de solo avisar.
  5. Resuelto en 2.3: la moneda de nómina se captura por tipo de concepto
     (`ConfiguracionNomina.monedaSalario/monedaBonos/monedaDeducciones`,
     independientes entre sí). `DeclaracionNomina` (Etapa 1) sigue asumiendo
     Bs sin columna de moneda propia — queda abierto si Mis Consultores la
     necesita en USD.
  6. **`lib/lottt.ts` (Vacaciones/Utilidades/Liquidaciones) NO está
     verificado contra una fuente legal** — el propio archivo lo advierte en
     su cabecera. En particular, `prestacionesSocialesRetroactivo` solo
     implementa el cálculo retroactivo de prestaciones (Art. 142 literal b)
     y no compara contra la garantía trimestral depositada (Art. 142 literal
     a, que la ley exige pagar el mayor de los dos) porque ese histórico no
     existe todavía en el sistema. Revisar con un abogado laboral o el
     criterio ya usado por la firma antes de aplicarlo a un cliente real.
  7. Autoservicio del trabajador ("Vista empleado", "Mi panel", "Marcar
     asistencia", "Mis recibos") quedó visible en la sub-navegación de
     nómina pero deshabilitado a propósito — es la Fase 5 (Portal de
     cliente) del orden de etapas, no parte de 2.1-2.7.

### Lo construido en la Etapa 1 (para retomar sin releer el chat)
- **Modelos** (`prisma/schema.prisma`): `Trabajador` (roster por empresa —
  **esta es la fuente única de verdad del trabajador que la 2.2 debe
  extender, no reemplazar**), `DeclaracionNomina` (base salarial por
  trabajador/período + `estado` + `riesgo`), `SalarioMinimo` (histórico
  oficial). 3 migraciones aditivas aplicadas.
- **Módulos puros**: `lib/cedula.ts` (cédula V-12345678), `lib/nomina.ts`
  (vocabulario, heurísticas de riesgo `evaluarRiesgoAutomatico`, ciclo de
  vida `siguienteEstadoDeclaracion`), `lib/nominaSettings.ts` (umbral vía
  `AppSetting "nomina_riesgo_config"`).
- **Server actions**: `app/(crm)/empresas/trabajadores-actions.ts` (roster),
  `app/(crm)/empresas/nomina-actions.ts` (declarar base, marcar riesgo
  manual, avanzar estado, resolver bloqueo — todas con `canAccessCompany` +
  verificación cruzada `trabajadorDeLaEmpresa`), `app/(crm)/configuracion/
  nomina-actions.ts` (salario mínimo, umbral — admin-only).
- **UI**: `components/clientes/TrabajadoresPanel.tsx` (roster + declaración
  en la ficha del cliente), `components/nomina/NominaRiesgoSettings.tsx`
  (en `/configuracion`), `app/(crm)/riesgo-nomina/page.tsx` +
  `components/nomina/DeclaracionRiesgoRow.tsx` (dashboard transversal, 4
  filtros: período/estado/riesgo/analista, entrada en el Sidebar).
- **Permisos**: `lib/permissions.ts` ganó `nominaRiesgoScope`; `canApprove`
  existente reutilizado sin cambios para el bloqueo supervisorio (llegar a
  "aprobada" siempre exige gerencia/supervisión, tenga riesgo o no).
- **Pruebas**: `tests/nomina.test.ts` (14/14) + `lib/cedula.ts` cubierto en
  `tests/contable.test.ts`. Batería completa del repo: 161/161. `tsc` y
  ESLint limpios.
- Verificado E2E en navegador el ciclo completo: declarar base bajo el
  mínimo → riesgo automático → marca manual → intento de aprobar bloqueado
  → resolver (nota obligatoria) → aprobar → editar la base de una aprobada
  la regresa a pendiente. Datos de prueba restaurados después.

### Lo construido en la Etapa 2 (para retomar sin releer el chat)
Las 7 sub-etapas (2.1-2.7) completas, todas sobre la misma fuente única de
verdad del trabajador de la Etapa 1 (`Trabajador` se **extendió**, no se
reemplazó).

- **Modelos** (`prisma/schema.prisma`, 16 tablas nuevas + 2 columnas en
  tablas existentes, todo aditivo — 6 migraciones, una por sub-etapa más un
  ajuste de base mensual de referencia): `Trabajador` ganó `tipoContrato`,
  `fechaIngreso`/`fechaEgreso`, `motivoBaja`, `objetivoUsd` +
  `TrabajadorDocumento` (2.2) · `ConfiguracionNomina` (1:1 con `Company`),
  `Jornada`, `ConceptoNomina`, `AporteLegal` (2.3-2.4) · `AsistenciaDia`,
  `CorridaNomina`/`CorridaDetalle`/`CorridaLinea` (2.5) ·
  `RegistroVacaciones`, `RegistroUtilidades`, `Liquidacion` (2.6) ·
  `Geocerca` (2.7). `Activity` ganó `trabajadorId` opcional para que el
  historial también pueda colgar del trabajador.
- **Módulos puros nuevos** (sin Prisma ni Next, mismo patrón que
  `lib/nomina.ts`/`lib/rif.ts`): `lib/trabajadores.ts` (tipos de contrato
  LOTTT), `lib/jornadas.ts` (horas efectivas siempre calculadas, nunca
  guardadas), `lib/beneficiosNomina.ts` (vocabulario de 2.4),
  `lib/formulasNomina.ts` (`evaluarFormulaConcepto` — **reutiliza el
  evaluador aritmético seguro de Form Rules**, `computeFormula` de
  `lib/engine/formRules.ts`, en vez de escribir uno nuevo; null si la
  fórmula no se puede calcular, nunca inventa un monto),
  `lib/corridas.ts` (períodos mensual/quincenal/semanal reutilizando la
  aritmética de `lib/fiscal/vencimientos.ts` + `auditarCorrida`, heurística
  de cruce contra la corrida anterior — mismo espíritu que el riesgo FAO de
  la Etapa 1), `lib/lottt.ts` (vacaciones/utilidades/liquidaciones — **ver
  decisión pendiente #6**, no verificado contra fuente legal).
- **UI por cliente** (`app/(crm)/nomina/[companyId]/*`, guardada en
  `layout.tsx` con `canAccessCompany` — mismo patrón que `empresas/[id]`):
  selector de cliente en `/nomina` (filtrado por `companyScope`) → Home con
  sub-navegación (`NominaSubNav`; "Vista empleado/Mi panel/Marcar
  asistencia/Mis recibos" visibles pero deshabilitadas, ver decisión #7) →
  Empleados (roster + `TrabajadorDetalle`) → Configuración (modal
  multi-tab: País y monedas, Jornadas con `JornadasPanel`, Conceptos con
  `ConceptosPanel`, Aportes con `AportesPanel`) → Operación
  (`AsistenciaGrid` + `CorridaResumen`: guardar borrador / crear corrida del
  período — **sin exportación Galac todavía, decisión #1**) →
  Vacaciones/Utilidades/Liquidaciones (`PantallaLottt`, un solo componente
  compartido reutilizado en las tres pantallas, no tres implementaciones) →
  Reportes (KPIs + tabs de corridas en rango) → Ubicaciones (`Geocerca`
  genérica, sin captura de referencia real todavía, tal como pedía la
  especificación).
- **Server actions**: una por sub-etapa, todas dentro de
  `nomina/[companyId]/` (`configuracion/actions.ts`, `operacion/actions.ts`,
  `vacaciones|utilidades|liquidaciones/actions.ts`, `ubicaciones/actions.ts`),
  detrás del mismo guard de `canAccessCompany` que el resto del módulo.
- **Pruebas**: `tests/jornadas.test.ts` (8), `tests/corridas.test.ts` (24,
  incluye `evaluarFormulaConcepto`), `tests/lottt.test.ts` (16) — las tres
  puras, sin BD. Batería completa del repo verificada en esta actualización:
  **225/225** (evaluator 15, form-rules 8, contable 20, fiscal 21, planes
  11, nomina 14, corridas 24, jornadas 8, lottt 16, licencia 16 = 153 puras
  + builder 9, casos 18, facturación 14, hardening 11, workflow 10,
  pipeline-rules 10 = 72 contra copia de BD); `tsc --noEmit` limpio y
  ESLint en 0 errores (los mismos 3 avisos preexistentes de siempre, ninguno
  nuevo).

### Lo construido en la Etapa 3 (para retomar sin releer el chat)
Las 7 sub-etapas (3.1-3.7) completas. Pedido adicional del cliente (manual de
procedimientos de gestoría) — plan completo en
`~/.claude/plans/sparkling-enchanting-lagoon.md`. Principio: **extender**
`CasoRecurrente` (F4 de la adaptación contable general, §7-8/§11-18 del
`CLAUDE.md` raíz) con sub-fases internas, no un motor nuevo.

- **Modelos** (todos aditivos, migración `20260810173819_etapa_3_1_...`):
  `ObligacionFase` (plantilla de pasos por obligación: `campos` JSON de
  `EvidenciaCampoSpec[]`, `validacionEspecial` opcional) · `CasoFase`
  (instancia real de avance: `estado`, `datos` JSON, `completadaPorId`,
  `completadaAt` — es, de hecho, el primer historial real de transición de
  caso que existía en el sistema) · `Obligacion.periodicidad` gana el valor
  `"unica"` (trámites de una sola vez, ej. apertura de empresa) · `AporteLegal`
  gana `ente`/`cuentaContable` · `AportePorPagar` (nuevo: cuenta por pagar real
  de nómina, snapshot de cuenta contable, `@@unique([corridaId, ente])`).
- **Módulos puros nuevos**: `lib/casos-fases.ts` (`EvidenciaCampoSpec`,
  `validarEvidenciaFase`, `puedeAvanzarCaso` — el motor de transición: nunca
  se puede entrar a en_revisión/presentado con sub-fases activas sin
  completar, la garantía es del sistema, no una regla del Builder) ·
  `lib/aportesPatronales.ts` (`calcularAportesPeriodo` — trabajador Y
  patronal por ente, tope de 5 salarios mínimos solo para IVSS) · `lib/casos.ts`
  gana `ultimoAvance`/`diasSinAvance`/`estaEstancado` (seguimiento por
  analista, sin tocar el semáforo existente).
- **Servidor**: `lib/fiscal/faseValidaciones.ts` (`sin_duplicado` — compara
  evidencia JSON entre `CasoFase` de la misma empresa sin usar query JSON del
  motor, portabilidad SQLite/PostgreSQL; `rif_valido` — formato +
  unicidad contra `Company.rif` real, para la fase de apertura) ·
  `lib/fiscal/casos.ts` gana `tieneFasesPendientes` (gate) y `abrirCaso`
  pasó a exportarse (la reutiliza la apertura de empresa) y ahora también
  materializa las `CasoFase` de la plantilla activa al abrir cualquier caso ·
  `lib/casosSettings.ts` (umbral de estancamiento vía `AppSetting`, patrón de
  `lib/nominaSettings.ts`).
- **Seed**: `prisma/seed-fases-obligaciones.ts` — plantillas de FAOV (6
  fases), IVSS (6), INCES (5), IVA (5), ISLR definitiva (5), IAE (5) y la
  nueva **Impuesto sobre Pensiones (LPPSS) — Forma 19** (SENIAT, 9% aporte
  patronal sin pata de trabajador, mensual — dato confirmado por el cliente,
  no está en el manual público) con 4 fases, más **Apertura de empresa
  (SAREN)** (`periodicidad: "unica"`) con las 13 fases de la Parte II-IV del
  manual. Idempotente (create-o-update por nombre/obligación).
- **UI**: `components/casos/CasoRow.tsx` gana la línea de tiempo (checklist
  ✓/○ con quién/cuándo completó cada fase, botón «reabrir») y el formulario de
  evidencia de la fase pendiente (`components/casos/FaseEvidenciaForm.tsx`,
  cliente porque necesita `useActionState` para mostrar errores) — el botón
  «avanzar estado» se sustituye por «Faltan N fases» cuando corresponde.
  `components/casos/SeguimientoAnalistas.tsx` (panel de supervisión en
  `/casos`, solo `canReassign`) agrupa casos abiertos por analista con su
  conteo de estancados. La ficha del cliente (`empresas/[id]/page.tsx`) gana
  la sección «Apertura de empresa»: botón «Iniciar apertura» cuando no hay RIF
  y no existe el caso, o el mismo `CasoRow` reutilizado cuando ya existe —
  **cero UI nueva de timeline**, es el mismo componente de `/casos`. El
  selector de obligaciones del plan de servicios filtra `periodicidad !==
  "unica"` para que nunca se ofrezca como servicio recurrente.
- **Nómina → cuentas por pagar**: `recalcularCorrida`
  (`nomina/[companyId]/operacion/actions.ts`) genera/actualiza los
  `AportePorPagar` de la corrida en cada recálculo (idempotente por
  `[corridaId, ente]`, nunca toca `estadoPago`/`fechaPago` de un registro que
  ya estaba marcado — verificado en vivo: recalcular dos veces no «despaga»
  nada). `AportesPanel.tsx` gana los campos `ente`/`cuentaContable` (con
  `<datalist>` de sugerencias) y `asegurarCatalogosNomina` hace *backfill* del
  `ente` en los aportes estándar de clientes configurados antes de esta etapa
  (si no, nunca habrían generado cuenta por pagar). Nueva clave estándar
  `pensiones_patronal` (9%, patronal, sin ente `RPE` — sigue sin asignar a
  propósito, no es de los 4 entes que pidió el cliente). Reportes →
  «Cuentas por pagar» deja de ser un estimado en vivo: consulta
  `AportePorPagar` reales del rango, agrupados por ente, con cuenta contable y
  botón marcar pagada/revertir (`marcarAportePagado`/`revertirPagoAporte`).
- **Permisos**: todo reutiliza `recurringCaseScope`/`canReassign`/
  `canAccessCompany` ya existentes — cero mecanismos paralelos.
- **Pruebas**: `tests/casos-fases.test.ts` (11, puro: validación de evidencia,
  `puedeAvanzarCaso`, seguimiento por analista) · `tests/aportes-patronales.test.ts`
  (5, puro: suma trabajador+patronal por ente, tope IVSS, Pensiones sin pata
  de trabajador) · `tests/casos.test.ts` sube a 23 (+5: materialización de
  sub-fases al abrir un caso, bloqueo real de `cambiarEstadoCaso` con fases
  incompletas, `sin_duplicado` contra otro caso de la empresa, `rif_valido`
  formato/duplicado, `abrirCaso` reutilizado crea las 13 fases de apertura).
  Batería completa: evaluator 15, form-rules 8, contable 20, fiscal 21,
  planes 11, nomina 14, corridas 24, jornadas 8, lottt 16, licencia 16,
  casos-fases 11, aportes-patronales 5 = 169 puras + builder 9, casos 23,
  facturación 14, hardening 11, workflow 10, pipeline-rules 10 = 77 contra
  copia de BD (**246/246**); `tsc --noEmit` y ESLint limpios.
- Verificado E2E en navegador: caso IVSS con 6 fases → completar la primera
  con evidencia real → línea de tiempo la marca completada con autor/hora →
  botón «avanzar estado» se sustituye por «Faltan 5 fases» hasta completarlas
  todas · cliente sin RIF → «Iniciar apertura de empresa» → checklist de 13
  fases con los campos correctos (select de figura jurídica, RIF, etc.) ·
  panel «Seguimiento por analista» con conteo de estancados, filtro
  `?estancado=1` combinado con `?analista=` · corrida real recalculada dos
  veces → 4 `AportePorPagar` (IVSS/BANAVIH/INCES/SENIAT) con los montos
  correctos, cuenta contable snapshot preservada, y «marcar pagada» que
  sobrevive a un recálculo posterior sin revertirse. Datos de prueba
  borrados después (casos/empresas de prueba eliminados, `AportePorPagar` de
  prueba borrados, cuentas contables de prueba reseteadas — el *backfill* de
  `ente` en `AporteLegal` sí se dejó, es comportamiento permanente deseado).

### Trabajo adicional cerrado junto con la Etapa 3 (no es una sub-etapa 3.x)

Dos pedidos del cliente durante el cierre de la Etapa 3, fuera del plan
original pero resueltos en la misma conversación:

**1. Línea de tiempo de servicios (reemplaza el pipeline de ventas en la
ficha del cliente).** El cliente pidió explícitamente que arriba de la ficha
de cada empresa ya NO se vea el pipeline de ventas (Deal/PipelineStage), sino
los servicios contratados del Plan de Servicios — un paso por obligación,
en paralelo (no secuencial: IVA no espera a que termine FAOV), cada uno con
el estado de su `CasoRecurrente` más reciente. `components/clientes/
LineaTiempoServicios.tsx` (nuevo) + `empresas/[id]/page.tsx` (se quitó la
sección de pipeline, se agregó la query de "caso actual por obligación" vía
`distinct: ["obligacionId"]` ordenado por `createdAt desc`). `/casos` ganó el
filtro `?empresa=<companyId>` (con chip "Filtrando por… · quitar filtro")
para que cada nodo de la línea de tiempo pueda enlazar a la bandeja filtrada
a ese cliente. La lista de "Oportunidades" más abajo en la ficha NO se tocó
(el pipeline de ventas sigue existiendo tal cual en `/pipeline`).

**2. Calendario del SENIAT rediseñado + cargado con datos reales de 2026**
(Boletín Extraordinario Nº 157, Moore Venezuela). Dos limitaciones reales del
modelo anterior, encontradas al intentar cargar el PDF real:

- `CalendarioSeniat` estaba ligado solo a `periodicidad` (un calendario
  mensual y uno quincenal compartidos por TODAS las obligaciones) — pero la
  providencia real trae calendarios distintos que comparten periodicidad y no
  fecha (ej. Estimadas ISLR ≠ Retenciones ISLR, ambas mensuales). Se ligó a
  `obligacionId` (FK, cascade) en su lugar: `@@unique([anio, obligacionId,
  mes, quincena, digito])`.
- El día se guardaba UNA vez por dígito y se repetía los 12 meses — pero el
  SENIAT publica un día distinto cada mes por dígito. Se agregó la dimensión
  `mes` (1-12, es el mes de VENCIMIENTO — coincide directo con la columna del
  boletín, no hace falta desplazarlo) y `quincena` (0/1/2, mismo valor que
  `Periodo.quincena` de `lib/fiscal/vencimientos.ts`).

`ReglaObligacion` ganó `id` (necesario para el match) y `EntradaCalendario`
cambió de `{periodicidad, digito, diaDelMes}` a `{obligacionId, mes,
quincena, digito, diaDelMes}`. `terminacion_rif` ya NO tiene fallback por
dígito solo (existía en el modelo viejo) — sin match exacto, falla limpio con
motivo, nunca inventa una fecha. `saveCalendarioSeniat` pasó de 10 casillas a
una tabla de 12 meses × 10 dígitos por obligación (`FiscalSettings.tsx`,
`CalendarioObligacionBlock`/`GrillaCalendario`); dos grillas (Q1/Q2) para las
obligaciones quincenales.

Obligaciones nuevas del boletín agregadas al catálogo: **IVA — Mineras e
hidrocarburos**, **ISLR — Declaración estimada**, **Retenciones de ISLR sobre
premios de lotería**, **Autoliquidación ISLR — Ejercicios irregulares** (sin
dato para marzo — el boletín no lo trae, no se inventa), **Aporte 70% —
Servicios desconcentrados y entes descentralizados**. **Grandes Patrimonios**
se agregó pero quedó `reglaTipo: "manual"` a propósito: su vencimiento no es
"un mes después del cierre" sino una fecha fija en oct/nov según el dígito —
no encaja en `ventanaDeVencimiento` tal como está hoy; las fechas reales
quedaron en sus `notas` como referencia. **Impuesto sobre Pensiones (LPPSS) —
Forma 19** (creada en 3.3 con `reglaTipo: "manual"` a la espera de este dato)
pasó a `terminacion_rif` con su calendario real cargado.

Seed: `prisma/seed-calendario-seniat-2026.ts` (idempotente, expande las
tablas agrupadas "0 y 8"/"1 y 4"/etc. del boletín a los 10 dígitos
individuales). **Bug real encontrado verificando en vivo**: "IVA — Sujetos
pasivos especiales" es MENSUAL en este catálogo (no quincenal como se asumió
al transcribir la tabla a.1/a.2 del boletín) — el seed la cargó mal bajo
quincena 1/2 y nunca encontraba match; corregido a quincena 0 con la tabla
a.1 (días 1-15, misma ventana que la aproximación de día-15 que ya usaba "IVA
— Declaración y pago mensual").

Pruebas: `tests/fiscal.test.ts` actualizado a la nueva forma de
`EntradaCalendario`/`ReglaObligacion` + 2 pruebas nuevas (no matchea entre
obligaciones distintas aunque coincidan dígito y mes; quincenal usa la fila
de la quincena correcta). Batería completa **246/246** sigue en verde,
`tsc`/ESLint limpios. Verificado E2E en navegador (login como Administrador):
las 12 obligaciones SENIAT muestran su calendario cargado (120/120 celdas,
240/240 las quincenales, 110/120 Ejercicios Irregulares) y la vista previa de
cada una calcula una fecha real — confirmado dígito por dígito contra los
valores del boletín (ej. dígito 0 de IVA: 28, 20, 25, 23, 20, 29, 27, 31, 29,
20, 27, 16 — Ene a Dic, coincide exacto).

## Log de decisiones (se va llenando etapa por etapa)
- **2026-08-11 — Etapa 3 aprobada** (Procesos operativos por obligación +
  cuentas por pagar de nómina, 3.1-3.7, más el trabajo adicional de línea de
  tiempo de servicios y calendario del SENIAT — ver sub-secciones arriba).
- **2026-08-10 — Etapa 3 completa, pendiente de aprobación** (Procesos
  operativos por obligación + cuentas por pagar de nómina, 3.1-3.7). Pedido
  adicional del cliente basado en su manual de procedimientos, insertado
  antes de la Etapa de Segmentación (que pasó a ser la 4). Decisiones de
  diseño clave: `CasoFase` es «Fase» y «Tarea» a la vez (un paso del manual =
  un checkpoint con evidencia, sin una cuarta capa de anidamiento que nadie
  pidió) · duplicados de evidencia se resuelven comparando JSON en JS, nunca
  con una query JSON del motor (portabilidad SQLite/PostgreSQL ya establecida
  en el repo) · «Apertura de empresa» es una `Obligacion` con
  `periodicidad: "unica"` en vez de un modelo aparte, para heredar el 100% de
  la maquinaria de timeline/evidencia/permisos sin duplicar UI · el motor de
  transición bloquea en el servidor (defensivo) pero la comunicación real al
  usuario es la UI ocultando el botón — mismo criterio que Pipeline Rules.
- **2026-08-10 — Etapa 2 aprobada** (Módulo de Nómina completo, 2.1-2.7).
  Se reutilizó deliberadamente infraestructura de fases previas en vez de
  duplicarla: el evaluador de fórmulas de Form Rules para
  `evaluarFormulaConcepto`, la aritmética de períodos de
  `lib/fiscal/vencimientos.ts` para `lib/corridas.ts`, y el patrón
  `canAccessCompany`/`companyScope` de F1 contable para el alcance por
  cliente y por rol de todo el módulo — cero mecanismos de permisos
  paralelos.
- El motor de auditoría de corridas (2.5) quedó como **alerta informativa**
  (`auditoriaAlerta` + `auditoriaDetalle`), no como bloqueo — sigue siendo
  decisión pendiente #4 si el cliente pide que bloquee en algún caso.
- La exportación a Galac (TXT/XML) se dejó **fuera de 2.5 a propósito**: el
  punto de integración está identificado y documentado, pero el formato
  exacto del archivo plano depende de una definición con el cliente
  (decisión pendiente #1) que todavía no se ha tomado.
- **2026-08-09 — Etapa 1 aprobada.** Detección de riesgo FAO = heurística
  automática (base bajo el salario mínimo vigente + caída >20% vs. período
  anterior, umbral configurable) + marca manual con nota obligatoria. No se
  usa un "salario real" de referencia porque ningún sistema del cliente lo
  tiene hoy — ver conversación de aprobación de la F1 original.
- Aprobar una declaración (`estado="aprobada"`) exige gerencia/supervisión
  **siempre**, tenga riesgo o no — mismo patrón que las aprobaciones de
  pérdida/descuento del pipeline, no solo para los casos riesgosos.
- Resolver un bloqueo por riesgo apaga la bandera activa (`riesgo=false`)
  pero conserva `motivoRiesgo`/`notaRiesgo` como historial. **Bug real
  encontrado verificando en vivo**: sin apagar la bandera, la declaración
  rebotaba entre "en revisión" y "bloqueada" para siempre y nunca llegaba a
  aprobada — corregido antes de cerrar la etapa.
- Editar la base declarada de una declaración ya revisada/aprobada la
  reinicia a "pendiente" (solo si el número realmente cambió) — para que un
  cambio no quede aprobado sin pasar de nuevo por revisión.
- La base de nómina se guarda siempre en Bs (sin columna de moneda en
  `DeclaracionNomina`) — queda como decisión pendiente #5 arriba si Mis
  Consultores la necesita en USD.
