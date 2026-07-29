// Verificación de licencias (módulo puro, sin BD):
//   npx tsx tests/licencia.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";

import {
  canonizar,
  componentesQueCoinciden,
  evaluarLicencia,
  firmaValida,
  mismoEquipo,
  parseLicencia,
  DIAS_DE_GRACIA,
  type Huella,
  type PayloadLicencia,
} from "../lib/licencia/licencia";

// ── Utilidades de prueba ────────────────────────────────────────────────────

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const PUB = publicKey.export({ type: "spki", format: "pem" }).toString();

// Otro par distinto: simula a alguien que fabrica su propia licencia
const otro = generateKeyPairSync("ed25519");

const EQUIPO: Huella = {
  placa: "4C4C4544-0037-3010-8054-B4C04F503732",
  disco: "WD-WX21A80KLZ99",
  red: "a4:bb:6d:11:22:33",
};

function emitir(payload: PayloadLicencia, clave = privateKey): string {
  const firma = sign(null, Buffer.from(canonizar(payload), "utf8"), clave).toString("base64");
  return JSON.stringify({ payload, firma });
}

function payloadBase(extra: Partial<PayloadLicencia> = {}): PayloadLicencia {
  return {
    cliente: "Firma Contable de Prueba C.A.",
    huella: EQUIPO,
    emitida: "2026-07-01T12:00:00.000Z",
    ...extra,
  };
}

const HOY = new Date("2026-07-28T12:00:00Z");
const INSTALADO = new Date("2026-07-27T12:00:00Z");

const evaluar = (texto: string | null, opciones: Partial<{ huella: Huella; ahora: Date; instaladoEl: Date }> = {}) =>
  evaluarLicencia({
    texto,
    huella: opciones.huella ?? EQUIPO,
    clavePublicaPem: PUB,
    instaladoEl: opciones.instaladoEl ?? INSTALADO,
    ahora: opciones.ahora ?? HOY,
  });

// ── Huella ──────────────────────────────────────────────────────────────────

test("la comparación de huellas ignora mayúsculas y espacios", () => {
  const sucia: Huella = {
    placa: "  4c4c4544-0037-3010-8054-b4c04f503732 ",
    disco: "wd-wx21a80klz99",
    red: "A4:BB:6D:11:22:33",
  };
  assert.equal(componentesQueCoinciden(EQUIPO, sucia), 3);
  assert.ok(mismoEquipo(EQUIPO, sucia));
});

test("cambiar UNA pieza no invalida el equipo, cambiar DOS sí", () => {
  const discoNuevo: Huella = { ...EQUIPO, disco: "SEAGATE-99887766" };
  assert.equal(componentesQueCoinciden(EQUIPO, discoNuevo), 2);
  assert.ok(mismoEquipo(EQUIPO, discoNuevo), "cambiar el disco no debe dejar sin sistema");

  const dosPiezas: Huella = { ...EQUIPO, disco: "SEAGATE-99887766", red: "ff:ff:ff:00:00:01" };
  assert.equal(componentesQueCoinciden(EQUIPO, dosPiezas), 1);
  assert.equal(mismoEquipo(EQUIPO, dosPiezas), false);
});

test("un componente vacío no cuenta como coincidencia", () => {
  const sinDisco: Huella = { placa: EQUIPO.placa, disco: "", red: "" };
  const otroSinDisco: Huella = { placa: EQUIPO.placa, disco: "", red: "" };
  // Solo coincide la placa: no alcanza para dar el equipo por el mismo
  assert.equal(componentesQueCoinciden(sinDisco, otroSinDisco), 1);
  assert.equal(mismoEquipo(sinDisco, otroSinDisco), false);
});

// ── Firma ───────────────────────────────────────────────────────────────────

test("una licencia legítima verifica", () => {
  const texto = emitir(payloadBase());
  const lic = parseLicencia(texto);
  assert.ok(lic);
  assert.ok(firmaValida(lic!, PUB));
});

test("firmar con otra clave NO cuela: no se pueden fabricar licencias", () => {
  const texto = emitir(payloadBase(), otro.privateKey);
  const r = evaluar(texto);
  assert.equal(r.estado, "invalida");
  assert.equal(r.operativo, false);
  assert.match(r.motivo, /no es auténtico/);
});

test("alterar el payload invalida la firma", () => {
  const lic = JSON.parse(emitir(payloadBase()));
  // Alguien edita el archivo para ponerse otro nombre o cambiar el equipo
  lic.payload.cliente = "Firma Pirata C.A.";
  const r = evaluar(JSON.stringify(lic));
  assert.equal(r.estado, "invalida");
  assert.match(r.motivo, /modificado|auténtico/);
});

test("un archivo corrupto o vacío no revienta el sistema", () => {
  assert.equal(parseLicencia("{no es json"), null);
  assert.equal(parseLicencia(""), null);
  assert.equal(parseLicencia('{"payload":{}}'), null);
  const r = evaluar("{no es json", { instaladoEl: new Date("2026-01-01") });
  assert.equal(r.estado, "invalida");
});

// ── El caso que motiva todo esto ────────────────────────────────────────────

test("copiar la instalación a otro equipo NO funciona", () => {
  const texto = emitir(payloadBase());
  const otroServidor: Huella = {
    placa: "00000000-1111-2222-3333-444444444444",
    disco: "OTRO-DISCO-123",
    red: "de:ad:be:ef:00:01",
  };
  const r = evaluar(texto, { huella: otroServidor });
  assert.equal(r.estado, "invalida");
  assert.equal(r.operativo, false);
  assert.match(r.motivo, /pertenece a otro equipo/);
  assert.equal(r.cliente, "Firma Contable de Prueba C.A.", "la licencia dice de quién era la copia");
});

test("en el equipo correcto, la misma licencia funciona", () => {
  const r = evaluar(emitir(payloadBase()));
  assert.equal(r.estado, "valida");
  assert.ok(r.operativo);
  assert.equal(r.cliente, "Firma Contable de Prueba C.A.");
});

// ── Gracia: el sistema no se apaga de golpe ─────────────────────────────────

test("recién instalado y sin licencia, el sistema funciona con aviso", () => {
  const r = evaluar(null, { instaladoEl: HOY });
  assert.equal(r.estado, "gracia_sin_licencia");
  assert.ok(r.operativo, "no puede frenar a la firma el día de la instalación");
  assert.equal(r.diasRestantes, DIAS_DE_GRACIA);
  assert.match(r.motivo, /todavía no tiene licencia/);
});

test("la gracia sin licencia se agota y entonces sí bloquea", () => {
  const instalado = new Date(HOY.getTime() - (DIAS_DE_GRACIA - 1) * 86_400_000);
  const casi = evaluar(null, { instaladoEl: instalado });
  assert.equal(casi.estado, "gracia_sin_licencia");
  assert.equal(casi.diasRestantes, 1);

  const vencido = new Date(HOY.getTime() - (DIAS_DE_GRACIA + 1) * 86_400_000);
  const r = evaluar(null, { instaladoEl: vencido });
  assert.equal(r.estado, "invalida");
  assert.equal(r.operativo, false);
});

test("una licencia vencida da gracia antes de bloquear", () => {
  const ayer = new Date(HOY.getTime() - 2 * 86_400_000).toISOString();
  const r = evaluar(emitir(payloadBase({ expira: ayer })));
  assert.equal(r.estado, "gracia_vencida");
  assert.ok(r.operativo, "vencer no puede apagar el sistema en plena semana de vencimientos");
  assert.equal(r.diasRestantes, DIAS_DE_GRACIA - 2);
  assert.match(r.motivo, /venció/);
});

test("pasada la gracia, la licencia vencida sí bloquea", () => {
  const hace20 = new Date(HOY.getTime() - (DIAS_DE_GRACIA + 5) * 86_400_000).toISOString();
  const r = evaluar(emitir(payloadBase({ expira: hace20 })));
  assert.equal(r.estado, "invalida");
  assert.equal(r.operativo, false);
});

test("una licencia perpetua no vence nunca", () => {
  const dentroDeDiezAnios = new Date(HOY.getTime() + 3650 * 86_400_000);
  const r = evaluar(emitir(payloadBase()), { ahora: dentroDeDiezAnios });
  assert.equal(r.estado, "valida");
  assert.ok(r.operativo);
});

test("una licencia con vigencia futura sigue valiendo hasta su fecha", () => {
  const enUnAnio = new Date(HOY.getTime() + 365 * 86_400_000).toISOString();
  const r = evaluar(emitir(payloadBase({ expira: enUnAnio })));
  assert.equal(r.estado, "valida");
  assert.equal(r.expira, enUnAnio);
});

// ── Canonización ────────────────────────────────────────────────────────────

test("el payload se canoniza igual sin importar el orden de las claves", () => {
  const a: PayloadLicencia = {
    cliente: "X",
    huella: { placa: "p", disco: "d", red: "r" },
    emitida: "2026-01-01T00:00:00.000Z",
  };
  const b: PayloadLicencia = {
    emitida: "2026-01-01T00:00:00.000Z",
    huella: { red: "r", placa: "p", disco: "d" },
    cliente: "X",
  } as PayloadLicencia;
  assert.equal(canonizar(a), canonizar(b));
});
