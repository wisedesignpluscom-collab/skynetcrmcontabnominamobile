// Sub-fases de un caso (Etapa 3 «Mis Consultores»): validación de evidencia
// estructurada y el gate de transición. Módulo puro — sin BD.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validarEvidenciaFase,
  puedeAvanzarCaso,
  parseCamposEvidencia,
  esTipoCampoEvidencia,
  type EvidenciaCampoSpec,
} from "../lib/casos-fases";
import { ultimoAvance, diasSinAvance, estaEstancado } from "../lib/casos";
import { fechaLocal } from "../lib/fiscal/vencimientos";

const CAMPOS: EvidenciaCampoSpec[] = [
  { clave: "numeroPlanilla", etiqueta: "Número de planilla", tipo: "texto", requerido: true, claveUnicidad: true },
  { clave: "montoPagado", etiqueta: "Monto pagado", tipo: "moneda", requerido: true },
  { clave: "fechaPago", etiqueta: "Fecha de pago", tipo: "fecha", requerido: false },
  { clave: "banco", etiqueta: "Banco", tipo: "select", opciones: ["Banesco", "Mercantil"], requerido: false },
];

test("un campo requerido vacío bloquea con mensaje claro — nunca un simple Sí/No", () => {
  const errores = validarEvidenciaFase(CAMPOS, { numeroPlanilla: "", montoPagado: "150" });
  assert.equal(errores.length, 1);
  assert.match(errores[0], /Número de planilla/);
});

test("valida tipos: número, fecha y opciones de select", () => {
  const errores = validarEvidenciaFase(CAMPOS, {
    numeroPlanilla: "PL-001",
    montoPagado: "no-es-numero",
    fechaPago: "no-es-fecha",
    banco: "Banco Inventado",
  });
  assert.equal(errores.length, 3);
  assert.match(errores.join(" "), /Monto pagado/);
  assert.match(errores.join(" "), /Fecha de pago/);
  assert.match(errores.join(" "), /Banco/);
});

test("campos opcionales vacíos no generan error", () => {
  const errores = validarEvidenciaFase(CAMPOS, { numeroPlanilla: "PL-001", montoPagado: "150" });
  assert.deepEqual(errores, []);
});

test("puedeAvanzarCaso exige TODAS las fases activas completadas", () => {
  const fases = [
    { estado: "completada", obligacionFase: { nombre: "Calcular", active: true, order: 1 } },
    { estado: "pendiente", obligacionFase: { nombre: "Pagar", active: true, order: 2 } },
    { estado: "pendiente", obligacionFase: { nombre: "Fase desactivada", active: false, order: 3 } },
  ];
  const r = puedeAvanzarCaso(fases);
  assert.equal(r.ok, false);
  assert.deepEqual(r.faltantes, ["Pagar"], "una fase inactiva no cuenta ni bloquea");
});

test("puedeAvanzarCaso pasa cuando no falta ninguna fase activa", () => {
  const fases = [
    { estado: "completada", obligacionFase: { nombre: "Calcular", active: true, order: 1 } },
    { estado: "pendiente", obligacionFase: { nombre: "Fase desactivada", active: false, order: 2 } },
  ];
  assert.equal(puedeAvanzarCaso(fases).ok, true);
});

test("parseCamposEvidencia descarta filas mal formadas y JSON inválido", () => {
  assert.deepEqual(parseCamposEvidencia("no es json"), []);
  assert.deepEqual(parseCamposEvidencia(null), []);
  const campos = parseCamposEvidencia(
    JSON.stringify([
      { clave: "ok", etiqueta: "Ok", tipo: "texto", requerido: true },
      { clave: "sinTipo", etiqueta: "Sin tipo" },
      { tipo: "texto" },
    ])
  );
  assert.equal(campos.length, 1);
  assert.equal(campos[0].clave, "ok");
});

test("esTipoCampoEvidencia reconoce solo los 6 tipos soportados", () => {
  assert.ok(esTipoCampoEvidencia("moneda"));
  assert.ok(esTipoCampoEvidencia("archivo_url"));
  assert.equal(esTipoCampoEvidencia("checkbox"), false);
});

// ── Seguimiento por analista ─────────────────────────────────────────────

const hoy = fechaLocal(2026, 8, 10);

test("ultimoAvance toma la fase completada más reciente", () => {
  const creado = fechaLocal(2026, 8, 1);
  const u = ultimoAvance(creado, [fechaLocal(2026, 8, 3), fechaLocal(2026, 8, 6), null]);
  assert.equal(u.getTime(), fechaLocal(2026, 8, 6).getTime());
});

test("ultimoAvance cae en la fecha de apertura si no hay ninguna fase completada", () => {
  const creado = fechaLocal(2026, 8, 1);
  assert.equal(ultimoAvance(creado, [null, undefined]).getTime(), creado.getTime());
});

test("diasSinAvance cuenta días completos desde el último progreso", () => {
  assert.equal(diasSinAvance(fechaLocal(2026, 8, 10), hoy), 0, "hoy mismo");
  assert.equal(diasSinAvance(fechaLocal(2026, 8, 5), hoy), 5);
});

test("estaEstancado exige el umbral y excluye casos cerrados o ya vencidos", () => {
  assert.equal(estaEstancado(5, "en_proceso", 5), true, "llega justo al umbral");
  assert.equal(estaEstancado(4, "en_proceso", 5), false, "no llega");
  assert.equal(estaEstancado(30, "presentado", 5), false, "cerrado no cuenta como estancado");
  assert.equal(estaEstancado(30, "vencido", 5), false, "vencido tiene su propia bandera (semáforo)");
});
