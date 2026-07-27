// Semilla del catálogo de obligaciones fiscales y de los días no hábiles.
// No toca datos del CRM (contactos, empresas, oportunidades): solo llena las
// tablas nuevas de F2. Idempotente — se puede correr las veces que haga falta:
//   npx tsx prisma/seed-obligaciones.ts
//
// El calendario del SENIAT (CalendarioSeniat) se deja VACÍO a propósito: sus
// días los publica el SENIAT en la providencia de cada año y se cargan desde
// /configuracion. Mientras no esté, las obligaciones «según terminación del RIF»
// avisan que falta el calendario en vez de inventar una fecha.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Las obligaciones son un punto de partida editable por la firma: el ente y la
// periodicidad son estables, pero el día exacto lo ajusta el cliente en
// /configuracion según su clasificación ante el SENIAT y su alcaldía.
const OBLIGACIONES = [
  {
    nombre: "IVA — Declaración y pago mensual",
    jurisdiccion: "nacional",
    periodicidad: "mensual",
    enteReceptor: "SENIAT",
    reglaTipo: "dia_fijo",
    reglaParam: 15,
    notas: "Contribuyente ordinario. Si el día cae en no hábil pasa al siguiente hábil.",
    order: 10,
  },
  {
    nombre: "IVA — Sujetos pasivos especiales",
    jurisdiccion: "nacional",
    periodicidad: "mensual",
    enteReceptor: "SENIAT",
    reglaTipo: "terminacion_rif",
    reglaParam: null,
    notas: "Requiere cargar el calendario del SENIAT del año.",
    order: 20,
  },
  {
    nombre: "Retenciones de IVA",
    jurisdiccion: "nacional",
    periodicidad: "quincenal",
    enteReceptor: "SENIAT",
    reglaTipo: "terminacion_rif",
    reglaParam: null,
    notas: "Dos períodos por mes (Q1: días 1-15, Q2: 16 a fin de mes).",
    order: 30,
  },
  {
    nombre: "Retenciones de ISLR",
    jurisdiccion: "nacional",
    periodicidad: "mensual",
    enteReceptor: "SENIAT",
    reglaTipo: "dias_habiles",
    reglaParam: 10,
    notas: "Primeros diez días hábiles del mes siguiente.",
    order: 40,
  },
  {
    nombre: "ISLR — Declaración definitiva",
    jurisdiccion: "nacional",
    periodicidad: "anual",
    enteReceptor: "SENIAT",
    reglaTipo: "manual",
    reglaParam: null,
    notas: "Vence a los tres meses del cierre del ejercicio: la fecha la fija el analista.",
    order: 50,
  },
  {
    nombre: "Seguro Social Obligatorio (IVSS)",
    jurisdiccion: "nacional",
    periodicidad: "mensual",
    enteReceptor: "IVSS",
    reglaTipo: "dias_habiles",
    reglaParam: 5,
    notas: "Pago de la factura mensual del sistema TIUNA.",
    order: 60,
  },
  {
    nombre: "FAOV — Ahorro habitacional (BANAVIH)",
    jurisdiccion: "nacional",
    periodicidad: "mensual",
    enteReceptor: "BANAVIH",
    reglaTipo: "dias_habiles",
    reglaParam: 5,
    notas: "Primeros cinco días hábiles del mes siguiente.",
    order: 70,
  },
  {
    nombre: "INCES — Aporte trimestral",
    jurisdiccion: "nacional",
    periodicidad: "trimestral",
    enteReceptor: "otro",
    reglaTipo: "dias_habiles",
    reglaParam: 5,
    notas: "Dentro de los cinco días siguientes al cierre de cada trimestre.",
    order: 80,
  },
  {
    nombre: "Impuesto sobre Actividades Económicas",
    jurisdiccion: "municipal",
    periodicidad: "mensual",
    enteReceptor: "Alcaldía",
    reglaTipo: "dia_fijo",
    reglaParam: 15,
    notas: "Anticipo mensual. El día lo fija la ordenanza de cada municipio.",
    order: 90,
  },
];

// ── Feriados ────────────────────────────────────────────────────────────────

// Domingo de Pascua (algoritmo de Gauss/Meeus): de él salen Carnaval y Semana
// Santa, que se mueven todos los años.
function domingoDePascua(anio: number): Date {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(anio, mes - 1, dia, 12, 0, 0, 0);
}

function masDias(fecha: Date, dias: number): Date {
  const d = new Date(fecha);
  d.setDate(d.getDate() + dias);
  return d;
}

function feriadosNacionales(anio: number): { fecha: Date; motivo: string }[] {
  const pascua = domingoDePascua(anio);
  const fijo = (mes: number, dia: number) => new Date(anio, mes - 1, dia, 12, 0, 0, 0);
  return [
    { fecha: fijo(1, 1), motivo: "Año Nuevo" },
    { fecha: masDias(pascua, -48), motivo: "Lunes de Carnaval" },
    { fecha: masDias(pascua, -47), motivo: "Martes de Carnaval" },
    { fecha: masDias(pascua, -3), motivo: "Jueves Santo" },
    { fecha: masDias(pascua, -2), motivo: "Viernes Santo" },
    { fecha: fijo(4, 19), motivo: "Declaración de la Independencia" },
    { fecha: fijo(5, 1), motivo: "Día del Trabajador" },
    { fecha: fijo(6, 24), motivo: "Batalla de Carabobo" },
    { fecha: fijo(7, 5), motivo: "Firma del Acta de Independencia" },
    { fecha: fijo(7, 24), motivo: "Natalicio de Simón Bolívar" },
    { fecha: fijo(10, 12), motivo: "Día de la Resistencia Indígena" },
    { fecha: fijo(12, 25), motivo: "Navidad" },
  ];
}

async function main() {
  for (const o of OBLIGACIONES) {
    const existente = await prisma.obligacion.findFirst({ where: { nombre: o.nombre } });
    if (existente) {
      await prisma.obligacion.update({ where: { id: existente.id }, data: o });
    } else {
      await prisma.obligacion.create({ data: o });
    }
  }

  // El vencimiento de diciembre cae en enero: se cargan el año en curso y el siguiente.
  const anio = new Date().getFullYear();
  for (const a of [anio, anio + 1]) {
    for (const f of feriadosNacionales(a)) {
      await prisma.diaNoHabil.upsert({
        where: { fecha_municipio: { fecha: f.fecha, municipio: "" } },
        update: { motivo: f.motivo },
        create: { fecha: f.fecha, motivo: f.motivo, municipio: "" },
      });
    }
  }

  const [obligaciones, feriados, calendario] = await Promise.all([
    prisma.obligacion.count(),
    prisma.diaNoHabil.count(),
    prisma.calendarioSeniat.count(),
  ]);
  console.log(
    `Listo: ${obligaciones} obligaciones, ${feriados} días no hábiles, ` +
      `${calendario} filas de calendario del SENIAT` +
      (calendario === 0 ? " (cargarlo en /configuracion cuando salga la providencia)" : "")
  );
  await prisma.$disconnect();
}

main();
