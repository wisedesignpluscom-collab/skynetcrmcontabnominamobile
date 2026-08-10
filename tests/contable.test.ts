// Pruebas de los módulos puros del negocio contable (sin BD ni Next):
//   npx tsx tests/contable.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseRif, isRifValido, normalizeRif, ultimoDigito } from "../lib/rif";
import { parseCedula, isCedulaValida, normalizeCedula } from "../lib/cedula";
import {
  parseMulti,
  serializeMulti,
  hasValue,
  formatMulti,
} from "../lib/multivalor";
import { esEstadoCliente, facturaRecurrente, formatMonto } from "../lib/clientes";
import { ROLES, roleLabels, roleLabel } from "../lib/permissions";

// ── RIF ─────────────────────────────────────────────────────────────────────

test("RIF: acepta el formato canónico y descompone sus partes", () => {
  const p = parseRif("J-12345678-9");
  assert.deepEqual(p, { tipo: "J", numero: "12345678", verificador: "9" });
});

test("RIF: tolera minúsculas, espacios y ausencia de guiones", () => {
  assert.ok(isRifValido("j123456789"));
  assert.ok(isRifValido(" V-87654321-0 "));
  assert.equal(normalizeRif("j123456789"), "J-12345678-9");
  assert.equal(normalizeRif(" v-87654321-0 "), "V-87654321-0");
});

test("RIF: rechaza letra no válida, dígitos de más y de menos", () => {
  assert.equal(isRifValido("X-12345678-9"), false, "letra inexistente");
  assert.equal(isRifValido("J-1234567-9"), false, "solo 7 dígitos");
  assert.equal(isRifValido("J-123456789-9"), false, "9 dígitos");
  assert.equal(isRifValido("J-12345678"), false, "sin verificador");
  assert.equal(isRifValido(""), false);
  assert.equal(isRifValido(null), false);
});

test("RIF: normalizar un valor inválido no lo inventa, lo devuelve tal cual", () => {
  assert.equal(normalizeRif("pendiente"), "pendiente");
  assert.equal(normalizeRif("   "), null);
});

test("RIF: el último dígito alimenta el calendario del SENIAT", () => {
  assert.equal(ultimoDigito("J-12345678-9"), 9);
  assert.equal(ultimoDigito("G-00000000-0"), 0);
  // Sin RIF válido no hay dígito: el motor de vencimientos debe pedirlo,
  // nunca asumir uno.
  assert.equal(ultimoDigito("J-1234-9"), null);
  assert.equal(ultimoDigito(null), null);
});

// ── Cédula (roster de trabajadores) ────────────────────────────────────────

test("Cédula: acepta el formato canónico y descompone sus partes", () => {
  const p = parseCedula("V-12345678");
  assert.deepEqual(p, { tipo: "V", numero: "12345678" });
});

test("Cédula: tolera minúsculas, espacios, sin guion y largos de 5 a 8 dígitos", () => {
  assert.ok(isCedulaValida("v12345678"));
  assert.ok(isCedulaValida(" E-12345 "));
  assert.equal(normalizeCedula("v12345678"), "V-12345678");
  assert.equal(normalizeCedula(" e-12345 "), "E-12345");
});

test("Cédula: rechaza letra no válida, verificador (no lleva) y largos fuera de rango", () => {
  assert.equal(isCedulaValida("J-12345678"), false, "J es de RIF, no de cédula");
  assert.equal(isCedulaValida("V-1234"), false, "menos de 5 dígitos");
  assert.equal(isCedulaValida("V-123456789"), false, "más de 8 dígitos");
  assert.equal(isCedulaValida(""), false);
  assert.equal(isCedulaValida(null), false);
});

test("Cédula: normalizar un valor inválido no lo inventa, lo devuelve tal cual", () => {
  assert.equal(normalizeCedula("sin cédula"), "sin cédula");
  assert.equal(normalizeCedula("   "), null);
});

// ── Campos multi-valor ──────────────────────────────────────────────────────

test("multivalor: ida y vuelta conserva los valores", () => {
  const guardado = serializeMulti(["Iribarren", "Palavecino"]);
  assert.equal(guardado, "Iribarren, Palavecino");
  assert.deepEqual(parseMulti(guardado), ["Iribarren", "Palavecino"]);
});

test("multivalor: descarta vacíos y duplicados", () => {
  assert.equal(serializeMulti(["Iribarren", "", "  ", "Iribarren"]), "Iribarren");
  assert.equal(serializeMulti([]), null);
  assert.equal(serializeMulti(null), null);
  assert.deepEqual(parseMulti(null), []);
  assert.deepEqual(parseMulti("  ,  ,"), []);
});

test("multivalor: una coma dentro del valor no rompe el formato al releerlo", () => {
  const guardado = serializeMulti(["Torres, Lara", "Crespo"]);
  assert.deepEqual(parseMulti(guardado), ["Torres Lara", "Crespo"]);
});

test("multivalor: hasValue compara sin importar mayúsculas ni espacios", () => {
  const m = "Iribarren, Palavecino";
  assert.ok(hasValue(m, "palavecino"));
  assert.ok(hasValue(m, "  IRIBARREN "));
  assert.equal(hasValue(m, "Torres"), false);
  assert.equal(hasValue(null, "Iribarren"), false);
});

test("multivalor: formatMulti muestra un guion cuando no hay nada", () => {
  assert.equal(formatMulti(null), "—");
  assert.equal(formatMulti("Iribarren"), "Iribarren");
});

// ── Estado del cliente y moneda ─────────────────────────────────────────────

test("estado del cliente: solo se aceptan los estados del catálogo", () => {
  assert.ok(esEstadoCliente("activo"));
  assert.ok(esEstadoCliente("perdido"));
  assert.equal(esEstadoCliente("cliente"), false, "estado del CRM de ventas");
  assert.equal(esEstadoCliente(null), false);
});

test("solo el cliente activo entra en la facturación recurrente", () => {
  assert.ok(facturaRecurrente("activo"));
  assert.equal(facturaRecurrente("prospecto"), false);
  assert.equal(facturaRecurrente("inactivo"), false);
  assert.equal(facturaRecurrente(null), false);
});

// ── Roles: etiquetas contables sobre claves intactas ────────────────────────

test("las CLAVES de rol no cambian aunque cambien las etiquetas", () => {
  // Tocarlas obligaría a reescribir los permisos, invalidar las sesiones
  // emitidas y romper las condiciones «has_role» guardadas en la base.
  assert.deepEqual([...ROLES], ["admin", "supervisor", "vendedor"]);
});

test("los roles se muestran con el vocabulario de la firma contable", () => {
  assert.equal(roleLabels.admin, "Gerente");
  assert.equal(roleLabels.supervisor, "Supervisor");
  assert.equal(roleLabels.vendedor, "Analista");
  // Ninguna etiqueta debe seguir hablando de ventas
  for (const r of ROLES) assert.doesNotMatch(roleLabels[r], /vendedor|ventas/i);
});

test("roleLabel tolera un rol desconocido o ausente", () => {
  assert.equal(roleLabel("vendedor"), "Analista");
  assert.equal(roleLabel("inventado"), "usuario");
  assert.equal(roleLabel(null), "usuario");
});

test("montos: bolívares y dólares se formatean cada uno en lo suyo", () => {
  assert.match(formatMonto(1500, "Bs"), /^Bs /);
  assert.match(formatMonto(1500, "USD"), /\$/);
  // Sin moneda declarada se asume USD (el valor por defecto del modelo)
  assert.match(formatMonto(1500, null), /\$/);
});
