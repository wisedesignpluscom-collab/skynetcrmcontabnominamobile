# Instalador de Skynet CRM para Windows

Cómo generar el `SkynetCRM-Setup.exe` que se instala en el servidor del cliente.

## Los dos comandos

```bash
npm run instalador:todo
```

Eso es todo. Empaqueta la aplicación y genera el `.exe`, **desde este mismo Mac**.
Queda en `instalador/salida/SkynetCRM-Setup.exe`.

Si ya empaquetaste antes y solo cambiaste el asistente, basta con:

```bash
npm run instalador
```

Para **actualizar** un servidor que ya tiene el sistema, no uses esto: hay un
paquete mucho más liviano, `npm run actualizador:todo` (ver más abajo).

## Qué produce

Un instalador con asistente gráfico en español que deja el servidor listo:

- **PostgreSQL 16** instalado y configurado como servicio de Windows, en un
  puerto propio (5433 por defecto) para no chocar con otro PostgreSQL que ya
  exista en el equipo.
- **El sistema** corriendo como tarea al arranque, con reintentos si se cae.
- **Panel en la bandeja** (junto al reloj) para ver el estado, iniciar/detener,
  respaldar y copiar la dirección de acceso.
- **Respaldo diario** a las 10:00 p.m. con retención de 30 días.
- **Regla de firewall** para el puerto, solo en redes privadas y de dominio.

El cliente **no instala Docker, ni Node, ni PostgreSQL**: van dentro del paquete.

## Requisitos para compilar

| Herramienta | Para qué | Cómo se instala |
|---|---|---|
| Node 20+ y npm | Compilar la aplicación | ya lo tienes |
| **NSIS** | Generar el `.exe` | `brew install makensis` |

**No hace falta Windows.** NSIS compila instaladores de Windows desde macOS o
Linux. (En Linux: `sudo apt install nsis`.)

> Antes esto se hacía con Inno Setup, que **solo compila en Windows** y obligaba
> a copiar el proyecto a otra máquina para el último paso. El guion viejo,
> `skynet-crm.iss`, se conserva por si alguna vez se compila desde Windows, pero
> el que se mantiene es `skynet-crm.nsi`.

## Qué pregunta el asistente

Cinco pantallas, en este orden:

1. **Componentes** — con dos perfiles predefinidos («Instalación completa», que
   es el que se usa casi siempre, y «Solo el sistema» para un servidor que ya
   tiene PostgreSQL). Cada casilla explica qué hace al seleccionarla.
2. **Carpeta del programa** — `C:\SkynetCRM` por defecto.
3. **Configuración del servidor** — puerto del sistema, puerto de la base y
   contraseña de la base (con confirmación).
4. **Usuario Gerente** — correo y contraseña de la primera cuenta.
5. **Carpeta de datos** — dónde viven la base y los respaldos. Conviene un disco
   distinto al del sistema operativo.

Al terminar muestra la dirección exacta que deben usar los usuarios de la
oficina, del tipo `http://192.168.1.50:3000`, y ofrece abrir el navegador y el
panel de administración.

## Instalar en el servidor del cliente

Copia el `.exe` al servidor y ejecútalo **como administrador**. Nada más.

## Cómo actualizar a una versión nueva

Hay dos caminos. **Para el día a día usa el actualizador**; el instalador
completo queda para los casos en que cambia algo del servidor.

### El actualizador (lo normal)

```bash
npm run actualizador:todo
```

Deja `instalador/salida/SkynetCRM-Actualizar.exe` (~160 MB sin comprimir contra
los ~580 MB del instalador completo). Se le envía al cliente y lo ejecuta **como
administrador**: doble clic, siguiente, listo.

**No pide contraseñas.** Las credenciales salen del `.env` instalado, así que el
técnico no necesita recordar la clave de la base del día de la instalación.

Qué hace, en este orden (`instalador/recursos/actualizar.ps1`):

1. **Respalda** la base y comprueba que el `.dump` se pueda leer. Si falla, se
   detiene sin tocar nada.
2. **Detiene** el sistema y espera a confirmar que `node.exe` murió.
3. **Aparta** la versión actual renombrándola (`app.anterior`), no borrándola.
4. **Copia** la versión nueva.
5. **Migra** con `migrate deploy` (solo lo que falte).
6. **Arranca** y no declara éxito hasta que el sistema responda en su puerto.

Si algo falla entre el 3 y el 6, restaura la versión anterior y la vuelve a
levantar. Lo que las migraciones ya aplicaron **no se deshace solo**: para eso
está el respaldo del paso 1, y el mensaje de error lo dice.

Solo reemplaza `app/`, `prisma/` y `semillas/`. No toca la base, su carpeta, el
`.env`, la configuración ni la licencia.

### El instalador completo

```bash
npm run instalador:todo
```

Ejecutar el `.exe` **sobre la instalación existente**. El asistente la detecta,
rellena puertos y carpeta de datos con los valores actuales y avisa. Pide la
contraseña de la base, que debe ser **la misma de antes**.

Hace falta cuando el actualizador no alcanza:

- cambia la versión de **Node** o de **Prisma** (el actualizador lo detecta
  comparando su manifiesto contra el `version.json` instalado, y se niega
  diciéndolo);
- cambian los **scripts de `instalador/`** (el panel de la bandeja tiene
  `bandeja.ps1` abierto y Windows lo bloquea, así que el actualizador no los
  reemplaza);
- cambia **PostgreSQL**.

Ver `MIGRACIONES.md` para el detalle de cómo se versiona el esquema.

## Si la instalación falla

El asistente **no oculta los errores**: la salida completa de `configurar.ps1`
va a la ventana de detalles (botón «Mostrar detalles»). Si algo truena, avisa
con un mensaje que indica dónde mirar.

La configuración es **idempotente**: se puede reintentar sin desinstalar ni
perder datos. Desde PowerShell como administrador:

```
C:\SkynetCRM\instalador\configurar.ps1 -Raiz "C:\SkynetCRM" -ClaveBd "..." -Puerto 3000 -PuertoBd 5433 -CarpetaDatos "C:\SkynetCRM-datos"
```

Dónde mirar, en orden:

1. `C:\SkynetCRM-datos\postgres\log` — si falló `initdb` o el arranque de la base.
2. `C:\SkynetCRM\logs\servidor.log` — si falló la aplicación o las migraciones.

## Decisiones que conviene conocer

**Por qué no Docker.** Docker Desktop exige WSL 2 y virtualización habilitada en
la BIOS, pide un reinicio a mitad de la instalación, y tiene que quedar abierto
para que el sistema vuelva tras un reinicio del servidor. Todo eso son fallos
que ocurren en casa del cliente y que no se pueden diagnosticar en remoto. Con
Node y PostgreSQL embebidos no hay nada que instalar antes ni nada que pueda
faltar.

**Por qué una tarea programada y no un servicio de Windows.** `node.exe` no
implementa el protocolo de servicios de Windows, así que un servicio "de verdad"
exigiría un envoltorio de terceros (NSSM). Una tarea al arranque, corriendo como
SYSTEM y con reintentos cada minuto, cumple lo mismo sin agregar binarios que
después haya que mantener. PostgreSQL **sí** queda como servicio real, porque su
propio `pg_ctl register` lo soporta de forma nativa.

**Por qué el puerto 5433 para la base.** Si el servidor ya tiene un PostgreSQL
(cosa común en oficinas con otros sistemas), el 5432 estaría ocupado y la
instalación fallaría a mitad. Con un puerto propio, conviven.

**Por qué la base solo escucha en localhost.** Los usuarios entran por el
navegador al sistema, y es el sistema el que habla con la base. Exponer
PostgreSQL a la red no aporta nada y amplía la superficie de ataque.

**Por qué desinstalar no borra los datos.** La contabilidad y las obligaciones
fiscales de los clientes de la firma no se borran porque alguien desinstaló un
programa. La carpeta de datos y los respaldos quedan; eliminarlos es una
decisión manual.

**Por qué se quita `sharp` del paquete.** El trazado de dependencias de Next
incluye el binario nativo de la máquina donde se compila (el de macOS, aquí).
Ese `.node` no carga en Windows. Como la aplicación no usa `next/image`, se
elimina entero al empaquetar, y `npm run instalador` se niega a compilar si
detecta que volvió a colarse.

## Lo que el instalador NO hace (y hay que hacer aparte)

El instalador deja el sistema funcionando, pero estas cuatro cosas dependen del
servidor o del cliente y no se pueden automatizar:

| Pendiente | Por qué importa | Quién lo hace |
|---|---|---|
| **IP fija en la red** | Con DHCP la dirección cambia al reiniciar el router y los usuarios pierden el acceso | El técnico de redes, en el router o en Windows. El instalador **avisa** si detecta DHCP |
| **Zona horaria de Venezuela** | El cálculo de vencimientos usa la fecha local: con otra zona, las fechas límite salen corridas un día | Configuración de Windows. El instalador **avisa** si no coincide |
| **Correo saliente (SMTP)** | Sin esto el sistema no envía los avisos por correo; lo demás funciona igual | El gerente, desde Configuración → Correo saliente |
| **Calendario del SENIAT** | Sin él, las obligaciones de contribuyentes especiales piden la fecha a mano en vez de calcularla | El gerente, desde Configuración, cuando salga la providencia del año |

Y dos recomendaciones de hardware que no son software:

- **UPS.** Un corte de luz a mitad de una escritura es el riesgo real de pérdida
  de datos, más que cualquier fallo del programa.
- **Los respaldos fuera del servidor.** El respaldo diario queda en el mismo PC:
  si se daña el disco, se pierden los dos. Conviene copiar la carpeta de
  respaldos a otro equipo o a la nube.

## Verificación pendiente

El `.exe` se genera y se valida en el Mac, pero **la instalación real en un
servidor Windows todavía no se ha probado**. Al probarla por primera vez, revisa
en este orden:

1. Que el asistente valide bien los puertos y las contraseñas.
2. Que `initdb` cree la base (si falla, el detalle está en la carpeta de datos,
   en `postgres\log`).
3. Que las migraciones se apliquen (`logs\servidor.log`).
4. Que el sistema responda en `http://localhost:3000` desde el propio servidor.
5. Que responda desde **otro PC de la red**, que es lo que valida el firewall.
6. Que al reiniciar el servidor el sistema vuelva solo.
