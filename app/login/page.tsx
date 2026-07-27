import { prisma } from "@/lib/prisma";
import LoginForm from "./login-form";
import { roleLabels, ROLES } from "@/lib/permissions";

// No cachear: los conteos reflejan el estado actual del CRM.
export const dynamic = "force-dynamic";

function fmt(n: number | null) {
  if (n === null) return "—";
  return new Intl.NumberFormat("es-VE").format(n);
}

async function getStats() {
  try {
    const [contactos, oportunidades, empresas] = await Promise.all([
      prisma.contact.count(),
      prisma.deal.count(),
      prisma.company.count(),
    ]);
    return { contactos, oportunidades, empresas };
  } catch {
    return { contactos: null, oportunidades: null, empresas: null };
  }
}

// Las etiquetas salen del diccionario de roles: si la firma los renombra,
// esta pantalla se actualiza sola.
const chipClasses: Record<string, string> = {
  admin: "bg-blue-50 text-blue-700",
  supervisor: "bg-emerald-50 text-emerald-700",
  vendedor: "bg-violet-50 text-violet-700",
};
const roleChips = ROLES.map((r) => ({ label: roleLabels[r], className: chipClasses[r] }));

export default async function LoginPage() {
  const stats = await getStats();

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* Panel izquierdo — marca */}
      <div className="relative hidden overflow-hidden bg-[#0a1a38] lg:flex lg:flex-col lg:justify-between lg:p-14 xl:p-16">
        {/* Degradado base */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, #0d244d 0%, #0a1a38 55%, #081327 100%)",
          }}
        />
        {/* Cuadrícula sutil */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(148,180,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,180,255,0.08) 1px, transparent 1px)",
            backgroundSize: "46px 46px",
            maskImage:
              "radial-gradient(120% 90% at 20% 20%, #000 40%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(120% 90% at 20% 20%, #000 40%, transparent 100%)",
          }}
        />

        {/* Logo */}
        <div className="relative flex items-center gap-3.5">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-400 to-blue-700 text-2xl font-bold text-white shadow-lg shadow-blue-900/40">
            S
          </div>
          <div>
            <p className="text-xl font-bold leading-tight text-white">
              Skynet CRM
            </p>
            <p className="text-sm text-slate-400">Sistema de Gestión</p>
          </div>
        </div>

        {/* Mensaje central */}
        <div className="relative max-w-md">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-blue-300/80">
            CRM · Ventas y Posventa
          </p>
          <h1 className="text-4xl font-bold leading-[1.1] text-white xl:text-[2.75rem]">
            Vende con orden,
            <br />
            cuida a cada cliente.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-slate-300/90">
            Registra cada contacto, sigue tus oportunidades por el pipeline y
            mantén viva la relación posventa para convertir cada venta en un
            cliente recurrente, todo en un solo lugar.
          </p>
        </div>

        {/* Estadísticas */}
        <div className="relative flex gap-12">
          <div>
            <p className="text-3xl font-bold text-white">{fmt(stats.contactos)}</p>
            <p className="mt-1 text-sm text-slate-400">Contactos</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-white">
              {fmt(stats.oportunidades)}
            </p>
            <p className="mt-1 text-sm text-slate-400">Oportunidades</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-white">{fmt(stats.empresas)}</p>
            <p className="mt-1 text-sm text-slate-400">Empresas</p>
          </div>
        </div>
      </div>

      {/* Panel derecho — formulario */}
      <div className="flex items-center justify-center bg-white px-6 py-12 sm:px-12">
        <div className="w-full max-w-md">
          {/* Logo compacto (solo móvil) */}
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-400 to-blue-700 text-lg font-bold text-white">
              S
            </div>
            <div>
              <p className="text-base font-bold leading-tight text-slate-900">
                Skynet CRM
              </p>
              <p className="text-xs text-slate-500">Sistema de Gestión</p>
            </div>
          </div>

          <h2 className="text-3xl font-bold text-slate-900">Iniciar sesión</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-500">
            Ingresa con las credenciales asignadas por tu administrador.
          </p>

          <div className="mt-8">
            <LoginForm />
          </div>

          {/* Roles */}
          <div className="mt-8">
            <div className="relative mb-4 text-center">
              <span className="absolute inset-x-0 top-1/2 h-px bg-slate-100" />
              <span className="relative bg-white px-3 text-xs font-medium uppercase tracking-wide text-slate-400">
                acceso por roles
              </span>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {roleChips.map((r) => (
                <span
                  key={r.label}
                  className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold ${r.className}`}
                >
                  {r.label}
                </span>
              ))}
            </div>
          </div>

          <p className="mt-10 text-sm leading-relaxed text-slate-400">
            Skynet CRM · Acceso privado. Si olvidaste tu contraseña, contacta al
            administrador del sistema.
          </p>
        </div>
      </div>
    </div>
  );
}
