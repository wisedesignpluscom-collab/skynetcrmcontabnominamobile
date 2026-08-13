import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteCompany } from "../actions";
import { getSession } from "@/lib/session";
import { canDelete, canApprove, canManagePortalAccess } from "@/lib/permissions";
import { canAccessCompany } from "@/lib/ownership";
import { formatMulti } from "@/lib/multivalor";
import { estadoClienteLabels, estadoClienteClass, monedaLabels } from "@/lib/clientes";
import PlanServicioPanel, { type PlanData } from "@/components/clientes/PlanServicioPanel";
import ServiciosPanel from "@/components/clientes/ServiciosPanel";
import TrabajadoresPanel from "@/components/clientes/TrabajadoresPanel";
import PortalAccessPanel from "@/components/clientes/PortalAccessPanel";
import ChatClientePanel from "@/components/clientes/ChatClientePanel";
import { getOptions } from "@/lib/catalog";
import { contextoFiscal, vencimientoDelPlan, periodoActual } from "@/lib/fiscal/data";
import { etiquetaPeriodo } from "@/lib/fiscal/vencimientos";
import { estadoServicioLabels } from "@/lib/planes";
import { colorObligacion, colorServicioIndividual, type ItemLineaServicio } from "@/lib/serviciosTimeline";
import LineaServiciosTimeline, {
  LeyendaLineaServicios,
} from "@/components/servicios/LineaServiciosTimeline";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("es", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const fecha = new Intl.DateTimeFormat("es", { dateStyle: "medium" });

export default async function EmpresaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  const isSeller = session?.role === "vendedor";
  // El vendedor solo ve sus propios contactos/oportunidades dentro de la empresa
  const ownFilter = isSeller ? { ownerId: session!.id } : {};

  // Nómina: la declaración de la ficha siempre es la del período mensual en curso
  const periodoNomina = periodoActual("mensual");

  const [company, obligaciones, tiposServicio, usuarios] = await Promise.all([
    prisma.company.findUnique({
      where: { id },
      include: {
        contacts: { where: ownFilter, orderBy: { firstName: "asc" } },
        deals: { where: ownFilter, include: { stage: true }, orderBy: { createdAt: "desc" } },
        analista: { select: { name: true } },
        supervisor: { select: { name: true } },
        plan: { include: { obligaciones: { include: { obligacion: true } } } },
        servicios: {
          include: { responsable: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
        trabajadores: {
          orderBy: { nombre: "asc" },
          include: {
            declaraciones: {
              where: { periodo: periodoNomina },
              include: {
                createdBy: { select: { name: true } },
                riesgoMarcadoPor: { select: { name: true } },
              },
            },
          },
        },
        portalUsers: { orderBy: { createdAt: "desc" } },
        mensajesChat: { orderBy: { createdAt: "asc" }, take: 200 },
      },
    }),
    prisma.obligacion.findMany({
      where: { active: true },
      orderBy: [{ order: "asc" }, { nombre: "asc" }],
    }),
    getOptions("tipo_servicio"),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  if (!company) notFound();
  // El analista solo entra a los clientes de su cartera (asignados a él o donde
  // tiene contactos/oportunidades) — protección de URL directa.
  if (!(await canAccessCompany(session, id))) notFound();

  // Plan de servicios: a cada obligación contratada se le calcula su próxima
  // fecha límite con el motor de F2 (un solo contexto fiscal para todas).
  const ctxFiscal = await contextoFiscal(new Date().getFullYear(), company.municipios);
  const plan: PlanData | null = company.plan
    ? {
        id: company.plan.id,
        honorarioMensual: company.plan.honorarioMensual,
        moneda: company.plan.moneda,
        fechaInicio: company.plan.fechaInicio,
        estado: company.plan.estado,
        notas: company.plan.notas,
        obligaciones: company.plan.obligaciones.map((po) => {
          const periodo = periodoActual(po.obligacion.periodicidad);
          const v = vencimientoDelPlan(
            ctxFiscal,
            po.obligacion,
            po.diaLimiteOverride,
            periodo,
            company.rif
          );
          return {
            id: po.id,
            obligacionId: po.obligacionId,
            nombre: po.obligacion.nombre,
            enteReceptor: po.obligacion.enteReceptor,
            periodicidad: po.obligacion.periodicidad,
            diaLimiteOverride: po.diaLimiteOverride,
            vencimiento: { periodo, fecha: v.fecha, motivo: v.motivo },
          };
        }),
      }
    : null;

  const yaEnPlan = new Set(company.plan?.obligaciones.map((po) => po.obligacionId) ?? []);
  const obligacionesDisponibles = obligaciones.filter((o) => !yaEnPlan.has(o.id));

  // Línea de tiempo de servicios contratados: una obligación del plan cuenta
  // como culminada cuando el caso del PERÍODO EN CURSO ya se presentó; sin
  // caso abierto todavía = sin comenzar. Una sola consulta por las
  // obligacionId+periodo exactos que importan (no todo el historial).
  const casosDelPeriodo = plan
    ? await prisma.casoRecurrente.findMany({
        where: {
          companyId: id,
          OR: plan.obligaciones.map((o) => ({
            obligacionId: o.obligacionId,
            periodoFiscal: o.vencimiento.periodo,
          })),
        },
        select: { obligacionId: true, estado: true },
      })
    : [];
  const estadoCasoPorObligacion = new Map(casosDelPeriodo.map((c) => [c.obligacionId, c.estado]));

  const lineaServicios: ItemLineaServicio[] = [
    ...(plan?.obligaciones.map((o): ItemLineaServicio => ({
      id: `ob-${o.obligacionId}`,
      nombre: o.nombre,
      detalle: `${o.enteReceptor} · ${etiquetaPeriodo(o.vencimiento.periodo)}`,
      color: colorObligacion(estadoCasoPorObligacion.get(o.obligacionId)),
    })) ?? []),
    ...company.servicios.map((s): ItemLineaServicio => {
      return {
        id: `sv-${s.id}`,
        nombre: s.tipo,
        detalle: s.descripcion || estadoServicioLabels[s.estado] || s.estado,
        color: colorServicioIndividual(s.estado),
      };
    }),
  ];

  const infoRows = [
    { label: "RIF", value: company.rif },
    { label: "Sector económico", value: company.industry },
    { label: "Régimen tributario", value: company.regimenTributario },
    { label: "Municipios", value: formatMulti(company.municipios) },
    { label: "Tamaño", value: company.tamano },
    { label: "Moneda", value: monedaLabels[company.moneda] ?? company.moneda },
    {
      label: "Fecha de cierre",
      value: company.fechaCierre ? fecha.format(company.fechaCierre) : null,
    },
    { label: "Contador anterior", value: company.contadorAnterior },
    { label: "Analista", value: company.analista?.name },
    { label: "Supervisor", value: company.supervisor?.name },
    { label: "Teléfono", value: company.phone },
    { label: "Ciudad", value: company.city },
    { label: "Dirección", value: company.address },
    { label: "Sitio web", value: company.website },
  ];

  const openDeals = company.deals.filter((d) => d.status === "open");
  const openValue = openDeals.reduce((s, d) => s + d.amount, 0);
  const wonValue = company.deals
    .filter((d) => d.status === "won")
    .reduce((s, d) => s + d.amount, 0);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/empresas" className="text-sm font-medium text-teal-600 hover:underline">
            ← Volver a clientes
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 text-base font-bold text-white">
              {company.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900">{company.name}</h1>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    estadoClienteClass[company.estadoCliente] ?? "bg-slate-100 text-slate-600"
                  }`}
                >
                  {estadoClienteLabels[company.estadoCliente] ?? company.estadoCliente}
                </span>
              </div>
              <p className="text-sm text-slate-500">
                {company.rif ?? "Sin RIF"}
                {company.industry && ` · ${company.industry}`}
                {company.city && ` · ${company.city}`}
              </p>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/empresas/${company.id}/editar`}
            className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
          >
            Editar
          </Link>
          {canDelete(session?.role) && (
            <form action={deleteCompany}>
              <input type="hidden" name="companyId" value={company.id} />
              <button
                type="submit"
                title="Eliminar cliente (los contactos quedan sin empresa, no se borran)"
                className="rounded-lg border border-red-200 px-3 py-2.5 text-sm font-semibold text-red-500 transition-colors hover:bg-red-50"
              >
                Eliminar
              </button>
            </form>
          )}
        </div>
      </header>

      {/* Línea de tiempo de servicios contratados — mismo componente que ve
          el cliente en su portal */}
      {lineaServicios.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 font-semibold text-slate-900">Línea de tiempo de servicios</h2>
          <LeyendaLineaServicios />
          <LineaServiciosTimeline items={lineaServicios} />
        </section>
      )}

      {/* Resumen */}
      <section className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Contactos</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{company.contacts.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Pipeline abierto</p>
          <p className="mt-1 text-xl font-bold text-teal-700">{money.format(openValue)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Ventas ganadas</p>
          <p className="mt-1 text-xl font-bold text-emerald-600">{money.format(wonValue)}</p>
        </div>
      </section>

      {/* Plan de servicios y trabajos puntuales */}
      <PlanServicioPanel
        companyId={company.id}
        monedaCliente={company.moneda}
        plan={plan}
        disponibles={obligacionesDisponibles}
      />

      <ServiciosPanel
        companyId={company.id}
        monedaCliente={company.moneda}
        servicios={company.servicios.map((s) => ({
          id: s.id,
          tipo: s.tipo,
          descripcion: s.descripcion,
          montoCotizado: s.montoCotizado,
          moneda: s.moneda,
          estado: s.estado,
          responsableId: s.responsableId,
          responsableNombre: s.responsable?.name ?? null,
          fechaEntrega: s.fechaEntrega,
        }))}
        tipos={tiposServicio.map((t) => t.label)}
        usuarios={usuarios}
        puedeEliminar={canDelete(session?.role)}
      />

      <TrabajadoresPanel
        companyId={company.id}
        periodoActual={periodoNomina}
        trabajadores={company.trabajadores.map((t) => ({
          id: t.id,
          cedula: t.cedula,
          nombre: t.nombre,
          cargo: t.cargo,
          fechaIngreso: t.fechaIngreso,
          fechaEgreso: t.fechaEgreso,
          activo: t.activo,
          declaracion: t.declaraciones[0]
            ? {
                baseDeclarada: t.declaraciones[0].baseDeclarada,
                riesgo: t.declaraciones[0].riesgo,
                motivoRiesgo: t.declaraciones[0].motivoRiesgo,
                notaRiesgo: t.declaraciones[0].notaRiesgo,
                estado: t.declaraciones[0].estado,
                creadaPor: t.declaraciones[0].createdBy?.name ?? null,
                riesgoMarcadoPor: t.declaraciones[0].riesgoMarcadoPor?.name ?? null,
              }
            : null,
        }))}
        puedeEliminar={canDelete(session?.role)}
        puedeAprobar={canApprove(session?.role)}
      />

      {canManagePortalAccess(session?.role) && (
        <PortalAccessPanel
          companyId={company.id}
          usuarios={company.portalUsers.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            active: u.active,
            lastLoginAt: u.lastLoginAt,
          }))}
        />
      )}

      <ChatClientePanel
        companyId={company.id}
        mensajes={company.mensajesChat.map((m) => ({
          id: m.id,
          contenido: m.contenido,
          createdAt: m.createdAt,
          autorTipo: m.autorTipo,
          archivoNombre: m.archivoNombre,
          archivoMime: m.archivoMime,
          archivoTamano: m.archivoTamano,
        }))}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Información */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-slate-900">Información</h2>
          <dl className="space-y-3 text-sm">
            {infoRows.map((row) => (
              <div key={row.label} className="flex justify-between gap-4">
                <dt className="text-slate-500">{row.label}</dt>
                <dd className="text-right font-medium text-slate-800">{row.value ?? "—"}</dd>
              </div>
            ))}
          </dl>
          {company.notes && (
            <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              {company.notes}
            </p>
          )}
        </section>

        {/* Contactos */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-slate-900">
            Contactos ({company.contacts.length})
          </h2>
          {company.contacts.length === 0 ? (
            <p className="text-sm text-slate-400">Sin contactos vinculados.</p>
          ) : (
            <ul className="space-y-3">
              {company.contacts.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/contactos/${c.id}`}
                    className="flex items-center gap-2.5 rounded-lg p-2 -m-2 transition-colors hover:bg-teal-50/60"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-blue-600 text-xs font-bold text-white">
                      {c.firstName[0]}
                      {c.lastName[0]}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {c.firstName} {c.lastName}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {c.position ?? c.email ?? "—"}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Oportunidades */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-slate-900">
            Oportunidades ({company.deals.length})
          </h2>
          {company.deals.length === 0 ? (
            <p className="text-sm text-slate-400">Sin oportunidades registradas.</p>
          ) : (
            <ul className="space-y-3">
              {company.deals.map((d) => (
                <li key={d.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="text-sm font-medium text-slate-800">{d.title}</p>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span
                      className="rounded-full px-2 py-0.5 font-medium text-white"
                      style={{ backgroundColor: d.stage.color }}
                    >
                      {d.stage.name}
                    </span>
                    <span className="font-semibold text-slate-700">{money.format(d.amount)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
