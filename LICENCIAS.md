# Licencias

Cómo se protege el sistema contra copias no autorizadas, y cómo emitir una
licencia para un cliente.

## Lo primero: qué protege y qué no

**No existe forma de hacer imposible la copia.** El sistema corre en un equipo
que no controlamos: quien tenga el disco tiene el programa. Cualquiera que
prometa lo contrario miente.

Lo que hace esta protección es **cambiar el costo del robo**: pasar de *copiar
una carpeta* —que puede hacer cualquier empleado con un pendrive— a *necesitar
un programador que sepa Node.js y quiera dedicarle horas a parchear el sistema*.
Para una firma contable y su personal, esa segunda barrera es infranqueable en
la práctica.

## Cómo funciona

La licencia es un archivo `licencia.lic` **firmado con Ed25519**. El sistema
lleva incrustada la clave pública, así que puede verificar pero **no puede
fabricar** licencias: para eso hace falta la clave privada, que vive solo en la
máquina del proveedor.

Dentro va el nombre de la firma, la **huella del equipo** autorizado y, si
aplica, la fecha de vencimiento.

### La huella son tres componentes, y basta con que coincidan dos

| Componente | De dónde sale |
|---|---|
| Placa | UUID del producto (`Win32_ComputerSystemProduct`) |
| Disco | Número de serie del primer disco |
| Red | MAC de la tarjeta principal |

**Se exige 2 de 3.** No es una concesión: es lo que evita que cambiar un disco
averiado deje a la firma sin sistema, mientras copiar la instalación a otro
equipo —donde los tres cambian— sigue fallando.

### Nunca se apaga de golpe

Un bloqueo súbito en plena semana de vencimientos del SENIAT sería peor para la
relación comercial que una copia no autorizada. Por eso:

| Situación | Qué pasa |
|---|---|
| Recién instalado, sin licencia | Funciona **15 días** con un aviso visible |
| Licencia vencida | Funciona **15 días más** con aviso |
| Licencia de otro equipo, o alterada | Bloquea de inmediato: no es un despiste, es una copia |
| Se agotó la gracia | Bloquea, con el código del equipo en pantalla |

Cuando bloquea, muestra una pantalla que **deja claro que los datos no se han
perdido** y explica cómo activarlo. Los respaldos siguen funcionando desde el
panel de la bandeja, porque `pg_dump` no depende de la aplicación.

## Emitir una licencia

### Una sola vez: generar las claves

```bash
node scripts/generar-claves-licencia.mjs
```

Crea `claves-licencia/privada.pem` y `publica.pem`. La pública ya está incrustada
en `lib/licencia/estado.ts`.

**Guarda la privada como guardas una contraseña maestra**: copia cifrada y fuera
de este equipo. Está en `.gitignore` y nunca se commitea. Si la pierdes, las
licencias emitidas siguen valiendo pero no puedes emitir ninguna nueva sin
cambiar la clave pública en el código y reinstalar en todos los clientes.

### Por cada cliente

1. El técnico abre el panel de la bandeja en el servidor y elige
   **«Ver los datos del equipo (para la licencia)»**. Se copian al portapapeles.
2. Te los envía.
3. Emites la licencia:

```bash
node scripts/emitir-licencia.mjs \
    --cliente "Firma Contable Wilmer C.A." \
    --placa "4C4C4544-0037-3010-8054-B4C04F503732" \
    --disco "WD-WX21A80KLZ99" \
    --red "a4:bb:6d:11:22:33" \
    --referencia "Contrato 2026-014"
```

Añade `--expira 2027-12-31` para una licencia anual; sin ese parámetro es
perpetua.

4. Le envías el `licencia.lic`. Se copia en `C:\SkynetCRM` y se reinicia el
   sistema desde el panel.

## Reactivación cuando el cliente cambia de servidor

Es un caso legítimo y frecuente: se dañó el equipo, lo renovaron, reinstalaron
Windows. El sistema muestra el código del equipo nuevo en pantalla; con los tres
componentes emites otra licencia y listo. **Resuélvelo por teléfono el mismo
día**: una licencia que tarda una semana en llegar hace más daño que la copia
que estás evitando.

## Qué NO se hizo, y por qué

- **Ofuscar o compilar a ejecutable único.** El código sigue siendo archivos
  `.js` legibles: quien sepa buscar puede quitar la comprobación. Sube el listón
  de verdad, pero complica el empaquetado; se puede añadir después si aparece un
  caso real.
- **Cifrar la base de datos.** La contraseña sigue en texto plano en el `.env`:
  quien copie la carpeta puede abrir la base con `pg_restore` aunque el sistema
  no arranque. Derivarla del hardware es el siguiente paso lógico.
- **Servidor de licencias en línea.** El servidor de la firma puede no tener
  internet fiable, y una activación que depende de la red es una avería más.

## Pruebas

`tests/licencia.test.ts` (16/16), sin base de datos: firma legítima, firma con
otra clave (no cuela), payload alterado, archivo corrupto, **copia a otro equipo
bloqueada**, cambio de una pieza tolerado, cambio de dos rechazado, los tres
estados de gracia y la canonización estable.

Verificado además de punta a punta: se emitió una licencia real para este equipo
(entra normal, sin avisos) y otra para un equipo distinto (el sistema redirige a
la pantalla de activación aunque la sesión sea válida).
