// Pantalla que ve la firma cuando el sistema no tiene licencia válida.
//
// Muestra el código del equipo para que el técnico se lo pase al proveedor, y
// deja claro que los datos NO se han perdido: siguen en la base y se pueden
// respaldar desde el panel de la bandeja aunque el sistema esté bloqueado.

import { estadoLicencia } from "@/lib/licencia/estado";
import { detalleHuella } from "@/lib/licencia/huella";

export const dynamic = "force-dynamic";

export default async function LicenciaPage() {
  const licencia = estadoLicencia(true);
  const equipo = detalleHuella();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-xl space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 text-lg font-bold text-white">
              S
            </span>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Skynet CRM</h1>
              <p className="text-xs text-slate-500">Activación del sistema</p>
            </div>
          </div>

          <div
            className={`rounded-xl px-4 py-3 ${
              licencia.operativo
                ? "border border-amber-200 bg-amber-50"
                : "border border-red-200 bg-red-50"
            }`}
          >
            <p
              className={`text-sm font-semibold ${
                licencia.operativo ? "text-amber-900" : "text-red-800"
              }`}
            >
              {licencia.operativo ? "Licencia pendiente" : "Sistema sin licencia"}
            </p>
            <p className={`mt-1 text-sm ${licencia.operativo ? "text-amber-800" : "text-red-700"}`}>
              {licencia.motivo}
            </p>
          </div>

          <div className="mt-6">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Código de este equipo
            </p>
            <p className="rounded-lg bg-slate-900 px-4 py-3 text-center font-mono text-lg tracking-widest text-white">
              {equipo.codigo}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Envíale este código a tu proveedor para que emita la licencia de este servidor.
            </p>
          </div>

          {licencia.cliente && (
            <p className="mt-5 text-xs text-slate-500">
              Licencia registrada a nombre de <b>{licencia.cliente}</b>.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Tus datos están a salvo</h2>
          <p className="mt-1.5 text-sm text-slate-600">
            La información de la firma no se ha perdido ni se ha borrado: sigue completa en la base
            de datos de este servidor. Aunque el sistema esté bloqueado, el técnico puede generar un
            respaldo desde el panel de administración, en la bandeja de Windows.
          </p>
        </div>

        <p className="text-center text-xs text-slate-400">
          Una vez recibida la licencia, cópiala en la carpeta de instalación como{" "}
          <span className="font-mono">licencia.lic</span> y reinicia el sistema desde el panel.
        </p>
      </div>
    </main>
  );
}
