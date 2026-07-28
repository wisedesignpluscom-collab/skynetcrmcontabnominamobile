# Instalador de Skynet CRM para Windows

Cómo generar el `SkynetCRM-Setup.exe` que se instala en el servidor del cliente.

## Qué produce

Un instalador con asistente en español que deja el servidor listo para trabajar:

- **PostgreSQL 16** instalado y configurado como servicio de Windows, en un
  puerto propio (5433 por defecto) para no chocar con otro PostgreSQL que ya
  exista en el equipo.
- **El sistema** corriendo como tarea al arranque, con reintentos si se cae.
- **Panel en la bandeja** (junto al reloj) para ver el estado, iniciar/detener,
  respaldar y copiar la dirección de acceso.
- **Respaldo diario** a las 10:00 p.m. con retención de 30 días, y comprobación
  de que el archivo generado se puede leer.
- **Regla de firewall** para el puerto, solo en redes privadas y de dominio.

El cliente **no instala Node ni PostgreSQL**: van dentro del paquete.

## Requisitos para compilar

| Herramienta | Para qué | Dónde |
|---|---|---|
| Node 20+ y npm | Compilar la aplicación | ya lo tienes |
| **Windows** + [Inno Setup 6](https://jrsoftware.org/isdl.php) | Compilar el `.exe` | solo para el último paso |

El empaquetado (`npm run empaquetar`) corre en macOS o Linux. **La compilación
del `.exe` necesita Windows**, porque Inno Setup es una herramienta de Windows.
Si no tienes una máquina Windows a mano, sirve una máquina virtual o cualquier
PC con Windows: solo hay que copiar la carpeta del proyecto y correr un comando.

## Pasos

### 1. Empaquetar (en tu equipo)

```bash
npm run empaquetar
```

Compila la aplicación, descarga Node y los binarios de PostgreSQL para Windows
(la primera vez; luego quedan en `.cache-empaquetado/`) y arma `dist/windows/`.

Tarda varios minutos y ocupa unos 450 MB.

### 2. Compilar el instalador (en Windows)

Copia el proyecto a la máquina Windows —con la carpeta `dist/` incluida— y:

```
iscc instalador\skynet-crm.iss
```

Queda en `instalador\salida\SkynetCRM-Setup.exe` (unos 200 MB comprimido).

### 3. Instalar en el servidor del cliente

Doble clic en el `.exe`, como administrador. El asistente pregunta:

1. **Componentes**: sistema, base de datos, panel, respaldos, firewall y —solo si
   quieres mostrarlo— datos de demostración.
2. **Puertos y contraseña** de la base de datos.
3. **Carpeta de datos**: dónde viven la base y los respaldos. Conviene un disco
   distinto al del sistema operativo.

Al terminar arranca el sistema y te muestra la dirección que deben usar los
usuarios de la oficina, del tipo `http://192.168.1.50:3000`.

## Cómo actualizar a una versión nueva

1. `npm run empaquetar` y recompila el `.exe`.
2. Ejecútalo en el servidor **sobre la instalación existente**.

Las migraciones se aplican solas (`prisma migrate deploy`) y **los datos se
conservan**: el instalador no vuelve a sembrar si ya hay datos. Aun así,
**respalda antes** — el panel de la bandeja tiene un botón para eso.

Ver `MIGRACIONES.md` para el detalle de cómo se versiona el esquema.

## Decisiones que conviene conocer

**Por qué una tarea programada y no un servicio de Windows.** `node.exe` no
implementa el protocolo de servicios de Windows, así que un servicio "de verdad"
exigiría un envoltorio de terceros (NSSM). Una tarea al arranque, corriendo como
SYSTEM y con reintentos cada minuto, cumple lo mismo sin agregar binarios que
después haya que mantener y actualizar. PostgreSQL **sí** queda como servicio
real, porque su propio `pg_ctl register` lo soporta de forma nativa.

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

El paquete y los scripts están escritos y el empaquetado se probó de punta a
punta, pero **la compilación del `.exe` y la instalación real no se han probado
todavía**: requieren una máquina Windows. Al probarlo por primera vez, revisa en
este orden:

1. Que el asistente valide bien los puertos y la contraseña.
2. Que `initdb` cree la base (si falla, el detalle está en la carpeta de datos,
   en `postgres\log`).
3. Que las migraciones se apliquen (`logs\servidor.log` en la carpeta de
   instalación).
4. Que el sistema responda en `http://localhost:3000` desde el propio servidor.
5. Que responda desde **otro PC de la red**, que es lo que valida el firewall.
6. Que al reiniciar el servidor el sistema vuelva solo.
