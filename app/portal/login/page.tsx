import PortalLoginForm from "./portal-login-form";

export const dynamic = "force-dynamic";

export default function PortalLoginPage() {
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* Panel izquierdo — marca del portal (acento distinto al CRM interno) */}
      <div className="relative hidden overflow-hidden bg-[#150a38] lg:flex lg:flex-col lg:justify-between lg:p-14 xl:p-16">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: "linear-gradient(135deg, #241257 0%, #150a38 55%, #0c0620 100%)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(180,148,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(180,148,255,0.08) 1px, transparent 1px)",
            backgroundSize: "46px 46px",
            maskImage: "radial-gradient(120% 90% at 20% 20%, #000 40%, transparent 100%)",
            WebkitMaskImage: "radial-gradient(120% 90% at 20% 20%, #000 40%, transparent 100%)",
          }}
        />

        <div className="relative flex items-center gap-3.5">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-400 to-violet-700 text-2xl font-bold text-white shadow-lg shadow-indigo-900/40">
            S
          </div>
          <div>
            <p className="text-xl font-bold leading-tight text-white">Portal de clientes</p>
            <p className="text-sm text-slate-400">Skynet CRM</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-indigo-300/80">
            Acceso exclusivo para clientes
          </p>
          <h1 className="text-4xl font-bold leading-[1.1] text-white xl:text-[2.75rem]">
            El estatus de tus gestiones,
            <br />
            siempre a la vista.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-slate-300/90">
            Consulta en cualquier momento cómo va cada obligación y servicio
            contratado, y habla directamente con tu gestor asignado.
          </p>
        </div>

        <p className="relative text-xs text-slate-500">
          Este acceso es de solo lectura y distinto al sistema interno de la firma.
        </p>
      </div>

      {/* Panel derecho — formulario */}
      <div className="flex items-center justify-center bg-white px-6 py-12 sm:px-12">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-700 text-lg font-bold text-white">
              S
            </div>
            <div>
              <p className="text-base font-bold leading-tight text-slate-900">Portal de clientes</p>
              <p className="text-xs text-slate-500">Skynet CRM</p>
            </div>
          </div>

          <h2 className="text-3xl font-bold text-slate-900">Iniciar sesión</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-500">
            Ingresa con las credenciales que te entregó tu gestor contable.
          </p>

          <div className="mt-8">
            <PortalLoginForm />
          </div>

          <p className="mt-10 text-sm leading-relaxed text-slate-400">
            Portal de clientes · Acceso privado. Si olvidaste tu contraseña o no
            tienes acceso, contacta a tu gestor asignado.
          </p>
        </div>
      </div>
    </div>
  );
}
