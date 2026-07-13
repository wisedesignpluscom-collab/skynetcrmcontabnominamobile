#!/usr/bin/env node
// ============================================================================
//  gen-db-docs.mjs — Genera una bóveda de Obsidian desde prisma/schema.prisma
//  Una nota por tabla, enlazadas con [[wikilinks]] (grafo de Obsidian) +
//  un mapa general con diagrama Mermaid (erDiagram).
//
//  Uso:
//    node scripts/gen-db-docs.mjs ["/ruta/a/la/boveda"]
//  Sin argumento escribe en ~/Desktop/Skynet CRM - Base de Datos
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const ROOT = process.cwd();
const SCHEMA = path.join(ROOT, "prisma", "schema.prisma");
const OUT =
  process.argv[2] ||
  path.join(os.homedir(), "Desktop", "Skynet CRM - Base de Datos");

// ── Grupos por dominio (para ordenar el índice) ──────────────────────────────
const GROUPS = [
  ["👤 Usuarios y acceso", ["User"]],
  [
    "💼 CRM — núcleo",
    ["Company", "Contact", "Deal", "PipelineStage", "Task", "Activity", "FollowUp"],
  ],
  [
    "⚙️ Automatización (Engine)",
    [
      "Rule",
      "RuleGroup",
      "RuleCondition",
      "RuleAction",
      "RuleVersion",
      "WorkflowJob",
      "AutomationRule",
      "AutomationRun",
    ],
  ],
  [
    "🗂️ Configuración y comunicación",
    ["CatalogOption", "AppSetting", "EmailTemplate", "Notification", "EmailOutbox"],
  ],
];

// ── Parseo del schema ────────────────────────────────────────────────────────
const schema = fs.readFileSync(SCHEMA, "utf8");
const lines = schema.split("\n");

const models = [];
let commentBuf = [];
for (let i = 0; i < lines.length; i++) {
  const t = lines[i].trim();
  if (t.startsWith("//")) {
    commentBuf.push(t.replace(/^\/\/+\s?/, ""));
    continue;
  }
  const m = t.match(/^model\s+(\w+)\s*\{/);
  if (m) {
    const name = m[1];
    const body = [];
    i++;
    while (i < lines.length && lines[i].trim() !== "}") {
      body.push(lines[i]);
      i++;
    }
    // Descripción = comentarios contiguos justo encima (sin decoraciones ═══)
    const desc = commentBuf
      .filter((c) => !/^[═─=]{3,}/.test(c) && c.trim() !== "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    models.push({ name, desc, body });
    commentBuf = [];
    continue;
  }
  commentBuf = []; // cualquier otra línea corta la racha de comentarios
}

const modelNames = new Set(models.map((m) => m.name));
const SCALARS = new Set([
  "String",
  "Int",
  "Float",
  "Boolean",
  "DateTime",
  "Json",
  "Bytes",
  "Decimal",
  "BigInt",
]);

// Parsear campos de cada modelo
for (const model of models) {
  model.fields = [];
  model.blockAttrs = [];
  let fieldComment = "";
  for (const raw of model.body) {
    const t = raw.trim();
    if (!t) {
      fieldComment = "";
      continue;
    }
    if (t.startsWith("//")) {
      fieldComment = t.replace(/^\/\/+\s?/, "");
      continue;
    }
    if (t.startsWith("@@")) {
      model.blockAttrs.push(t);
      continue;
    }
    const fm = t.match(/^(\w+)\s+([A-Za-z0-9_]+)(\[\])?(\?)?\s*(.*)$/);
    if (!fm) continue;
    const [, fname, baseType, list, opt, rest] = fm;
    const isRelation = modelNames.has(baseType);
    const relName = (rest.match(/@relation\("([^"]*)"/) || [])[1] || null;
    const relFields = (rest.match(/fields:\s*\[([^\]]*)\]/) || [])[1] || null;
    const onDelete = (rest.match(/onDelete:\s*(\w+)/) || [])[1] || null;
    model.fields.push({
      name: fname,
      baseType,
      isList: !!list,
      isOptional: !!opt,
      isRelation,
      isId: /@id\b/.test(rest),
      isUnique: /@unique\b/.test(rest),
      isDefault:
        (rest.match(/@default\(((?:[^()]|\([^()]*\))*)\)/) || [])[1] || null,
      relName,
      relFields, // si existe → lado dueño (tiene la FK)
      onDelete,
      comment: fieldComment,
    });
    fieldComment = "";
  }
}

// ── Derivar relaciones (aristas) ─────────────────────────────────────────────
// Cada relación se define por el lado "dueño" (el que tiene fields:[fk]).
const edges = [];
for (const model of models) {
  for (const f of model.fields) {
    if (!f.isRelation || !f.relFields) continue;
    const fkName = f.relFields.split(",")[0].trim();
    const fkField = model.fields.find((x) => x.name === fkName);
    const oneToOne = fkField?.isUnique || false;
    edges.push({
      from: f.baseType, // "uno"
      to: model.name, // "muchos"
      field: f.name,
      relName: f.relName,
      oneToOne,
      optional: f.isOptional,
      self: f.baseType === model.name,
    });
  }
}

// ── Utilidades de render ─────────────────────────────────────────────────────
const note = (name) => `Tabla - ${name}`;
const link = (name) => `[[${note(name)}]]`;
// Escapar caracteres que rompen celdas de tabla markdown
const esc = (s) => (s || "").replace(/\|/g, "\\|");

function fieldTypeLabel(f) {
  if (f.isRelation) return `${f.baseType}${f.isList ? "[]" : ""}`;
  return `${f.baseType}${f.isList ? "[]" : ""}${f.isOptional ? "?" : ""}`;
}

// ── Mapa general (Mermaid erDiagram con todas las conexiones) ─────────────────
function mermaidGlobal() {
  let s = "```mermaid\nerDiagram\n";
  for (const e of edges) {
    if (e.self) {
      s += `  ${e.from} ||--o{ ${e.to} : "${e.field}"\n`;
      continue;
    }
    const card = e.oneToOne ? "||--||" : "||--o{";
    s += `  ${e.from} ${card} ${e.to} : "${e.relName || e.field}"\n`;
  }
  s += "```";
  return s;
}

// ── Mermaid local: una tabla y sus vecinos directos ──────────────────────────
function mermaidLocal(name) {
  const rel = edges.filter((e) => e.from === name || e.to === name);
  if (rel.length === 0) return "";
  let s = "```mermaid\nerDiagram\n";
  for (const e of rel) {
    const card = e.oneToOne ? "||--||" : "||--o{";
    s += `  ${e.from} ${card} ${e.to} : "${e.relName || e.field}"\n`;
  }
  s += "```";
  return s;
}

// ── Escribir bóveda ──────────────────────────────────────────────────────────
fs.mkdirSync(OUT, { recursive: true });

// 1) Nota índice / mapa
const total = models.length;
let idx = `---
tags: [base-de-datos, skynet-crm, mapa]
---

# 🗺️ Mapa de la Base de Datos — Skynet CRM

Documentación viva del esquema (**${total} tablas**). Generada desde \`prisma/schema.prisma\`.
Abre la **Vista de grafo** de Obsidian (icono de los círculos conectados) para navegar
las conexiones entre tablas, o mira el diagrama de abajo.

> Motor: **SQLite** en desarrollo (\`prisma/dev.db\`). Para regenerar este mapa:
> \`node scripts/gen-db-docs.mjs\`

## Diagrama de relaciones

${mermaidGlobal()}

## Tablas por área

`;

const seen = new Set();
for (const [title, names] of GROUPS) {
  idx += `### ${title}\n\n`;
  for (const n of names) {
    const model = models.find((m) => m.name === n);
    if (!model) continue;
    seen.add(n);
    idx += `- ${link(n)}${model.desc ? ` — ${model.desc}` : ""}\n`;
  }
  idx += "\n";
}
const rest = models.filter((m) => !seen.has(m.name));
if (rest.length) {
  idx += `### Otras\n\n`;
  for (const m of rest) idx += `- ${link(m.name)}\n`;
  idx += "\n";
}

fs.writeFileSync(path.join(OUT, "🗺️ Mapa de la Base de Datos.md"), idx);

// 2) Una nota por tabla
for (const model of models) {
  const rels = model.fields.filter((f) => f.isRelation);
  const scalars = model.fields.filter((f) => !f.isRelation);

  let md = `---
tags: [base-de-datos, tabla]
tabla: ${model.name}
---

# 📋 ${model.name}

${model.desc || "_(sin descripción en el esquema)_"}

`;

  // Campos escalares
  md += `## Campos\n\n| Campo | Tipo | Notas |\n| --- | --- | --- |\n`;
  for (const f of scalars) {
    const badges = [];
    if (f.isId) badges.push("🔑 PK");
    if (f.isUnique) badges.push("único");
    if (f.relFields) badges.push("FK");
    if (f.isDefault) badges.push(`def: \`${f.isDefault}\``);
    const notes = esc([f.comment, badges.join(" · ")].filter(Boolean).join(" — "));
    md += `| \`${f.name}\` | ${fieldTypeLabel(f)} | ${notes} |\n`;
  }

  // Claves foráneas escalares también aparecen arriba; relaciones abajo
  if (rels.length) {
    md += `\n## Relaciones\n\n`;
    for (const f of rels) {
      const dir = f.isList
        ? `tiene muchos → ${link(f.baseType)}`
        : `pertenece a → ${link(f.baseType)}`;
      const via = f.relFields ? ` _(vía \`${f.relFields}\`)_` : "";
      const od = f.onDelete ? ` · onDelete: \`${f.onDelete}\`` : "";
      const cm = f.comment ? ` — ${f.comment}` : "";
      md += `- **${f.name}**: ${dir}${via}${od}${cm}\n`;
    }
  }

  const local = mermaidLocal(model.name);
  if (local) md += `\n## Conexiones directas\n\n${local}\n`;

  md += `\n---\n↩ Volver al [[🗺️ Mapa de la Base de Datos]]\n`;

  fs.writeFileSync(path.join(OUT, `${note(model.name)}.md`), md);
}

console.log(`✅ Bóveda generada en:\n   ${OUT}`);
console.log(`   ${total} tablas · ${edges.length} relaciones`);
