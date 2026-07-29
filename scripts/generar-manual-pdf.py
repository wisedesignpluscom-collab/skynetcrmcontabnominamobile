# Genera el manual de instalación de Skynet CRM en PDF.

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate, Frame, NextPageTemplate, PageBreak, PageTemplate, Paragraph,
    Spacer, Table, TableStyle, KeepTogether,
)

SALIDA = "/Volumes/Skynet Lab/Skynet CRM Contab/documentacion/Manual-de-instalacion-Skynet-CRM.pdf"

TINTA = colors.HexColor("#0f172a")
GRIS = colors.HexColor("#475569")
GRIS_CLARO = colors.HexColor("#e2e8f0")
TEAL = colors.HexColor("#0d9488")
TEAL_SUAVE = colors.HexColor("#f0fdfa")
AMBAR = colors.HexColor("#b45309")
AMBAR_SUAVE = colors.HexColor("#fffbeb")
ROJO = colors.HexColor("#b91c1c")
ROJO_SUAVE = colors.HexColor("#fef2f2")

ss = getSampleStyleSheet()

def estilo(nombre, **kw):
    base = dict(fontName="Helvetica", fontSize=10, leading=14.5, textColor=TINTA)
    base.update(kw)
    return ParagraphStyle(nombre, **base)

E = {
    "titulo": estilo("titulo", fontName="Helvetica-Bold", fontSize=30, leading=35, alignment=TA_CENTER),
    "subtitulo": estilo("subtitulo", fontSize=13.5, leading=19, alignment=TA_CENTER, textColor=GRIS),
    "portada_pie": estilo("portada_pie", fontSize=9.5, leading=14, alignment=TA_CENTER, textColor=GRIS),
    "h1": estilo("h1", fontName="Helvetica-Bold", fontSize=19, leading=24, spaceBefore=4, spaceAfter=10, textColor=TINTA),
    "h2": estilo("h2", fontName="Helvetica-Bold", fontSize=13, leading=17, spaceBefore=15, spaceAfter=6, textColor=TINTA),
    "h3": estilo("h3", fontName="Helvetica-Bold", fontSize=10.8, leading=14, spaceBefore=11, spaceAfter=4, textColor=GRIS),
    "p": estilo("p", alignment=TA_JUSTIFY, spaceAfter=7),
    "li": estilo("li", alignment=TA_JUSTIFY, spaceAfter=4, leftIndent=14, bulletIndent=4),
    "celda": estilo("celda", fontSize=9, leading=12.5),
    "celda_b": estilo("celda_b", fontName="Helvetica-Bold", fontSize=9, leading=12.5),
    "celda_cab": estilo("celda_cab", fontName="Helvetica-Bold", fontSize=9, leading=12.5, textColor=colors.white),
    "código": estilo("código", fontName="Courier", fontSize=8.8, leading=12.5, textColor=TINTA),
    "indice": estilo("indice", fontSize=10.5, leading=17),
}

def P(t, e="p"):
    return Paragraph(t, E[e])

def H1(t):
    return Paragraph(t, E["h1"])

def H2(t):
    return Paragraph(t, E["h2"])

def H3(t):
    return Paragraph(t, E["h3"])

def lista(items, estilo_item="li"):
    return [Paragraph(f"&bull;&nbsp;&nbsp;{i}", E[estilo_item]) for i in items]

def numerada(items):
    return [Paragraph(f"<b>{n}.</b>&nbsp;&nbsp;{i}", E["li"]) for n, i in enumerate(items, 1)]

def tabla(filas, anchos, cabecera=True):
    datos = []
    for i, fila in enumerate(filas):
        est = "celda_cab" if (cabecera and i == 0) else "celda"
        datos.append([Paragraph(str(c), E[est]) for c in fila])
    t = Table(datos, colWidths=anchos, repeatRows=1 if cabecera else 0)
    cmds = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, GRIS_CLARO),
        ("BOX", (0, 0), (-1, -1), 0.5, GRIS_CLARO),
    ]
    if cabecera:
        cmds += [("BACKGROUND", (0, 0), (-1, 0), TINTA)]
    t.setStyle(TableStyle(cmds))
    return t

def caja(titulo, cuerpo, tono="info"):
    fondo, borde, color_titulo = {
        "info": (TEAL_SUAVE, TEAL, TEAL),
        "aviso": (AMBAR_SUAVE, AMBAR, AMBAR),
        "peligro": (ROJO_SUAVE, ROJO, ROJO),
    }[tono]
    contenido = [
        Paragraph(f"<b>{titulo}</b>", estilo("ct", fontName="Helvetica-Bold", fontSize=9.5, leading=13, textColor=color_titulo)),
        Spacer(1, 3),
        Paragraph(cuerpo, estilo("cc", fontSize=9.2, leading=13, alignment=TA_JUSTIFY)),
    ]
    t = Table([[contenido]], colWidths=[16.2 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), fondo),
        ("LINEBEFORE", (0, 0), (0, -1), 2.5, borde),
        ("BOX", (0, 0), (-1, -1), 0.4, borde),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 11),
        ("RIGHTPADDING", (0, 0), (-1, -1), 11),
    ]))
    return KeepTogether([Spacer(1, 4), t, Spacer(1, 8)])

def código(lineas):
    txt = "<br/>".join(l.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;") for l in lineas)
    t = Table([[Paragraph(txt, E["código"])]], colWidths=[16.2 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("BOX", (0, 0), (-1, -1), 0.4, GRIS_CLARO),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    return KeepTogether([Spacer(1, 3), t, Spacer(1, 8)])

# ── Plantilla de página ─────────────────────────────────────────────────────

def pie(canvas, doc):
    canvas.saveState()
    if doc.page > 1:
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(GRIS)
        canvas.drawString(2.4 * cm, 1.4 * cm, "Skynet CRM - Manual de instalación")
        canvas.drawRightString(A4[0] - 2.4 * cm, 1.4 * cm, str(doc.page))
        canvas.setStrokeColor(GRIS_CLARO)
        canvas.setLineWidth(0.5)
        canvas.line(2.4 * cm, 1.75 * cm, A4[0] - 2.4 * cm, 1.75 * cm)
    canvas.restoreState()

def portada_fondo(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(TINTA)
    canvas.rect(0, A4[1] - 5.2 * cm, A4[0], 5.2 * cm, stroke=0, fill=1)
    canvas.setFillColor(TEAL)
    canvas.rect(0, A4[1] - 5.45 * cm, A4[0], 0.25 * cm, stroke=0, fill=1)
    canvas.restoreState()

doc = BaseDocTemplate(
    SALIDA, pagesize=A4,
    leftMargin=2.4 * cm, rightMargin=2.4 * cm, topMargin=2.2 * cm, bottomMargin=2.2 * cm,
    title="Manual de instalación - Skynet CRM",
    author="Skynet Lab",
    subject="Instalación del sistema en el servidor local de la firma",
)
marco = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
doc.addPageTemplates([
    PageTemplate(id="portada", frames=[marco], onPage=portada_fondo),
    PageTemplate(id="normal", frames=[marco], onPage=pie),
])

h = []

# ── PORTADA ─────────────────────────────────────────────────────────────────
h.append(Spacer(1, 1.1 * cm))
h.append(Paragraph("SKYNET CRM", estilo("marca", fontName="Helvetica-Bold", fontSize=15, leading=20,
                                        alignment=TA_CENTER, textColor=colors.white)))
h.append(Paragraph("Sistema de gestión para firmas de outsourcing contable",
                   estilo("marca2", fontSize=9.5, leading=14, alignment=TA_CENTER,
                          textColor=colors.HexColor("#94a3b8"))))
h.append(Spacer(1, 4.6 * cm))
h.append(P("Manual de instalación", "titulo"))
h.append(Spacer(1, 0.4 * cm))
h.append(P("Servidor local con Windows y PostgreSQL<br/>para 30 o más usuarios simultáneos", "subtitulo"))
h.append(Spacer(1, 1.4 * cm))

h.append(tabla([
    ["Versión del sistema", "1.0.0"],
    ["Base de datos", "PostgreSQL 16 (incluida en el instalador)"],
    ["Runtime", "Node.js 22 (incluido en el instalador)"],
    ["Sistema operativo", "Windows 10 / 11 o Windows Server (64 bits)"],
    ["Dirigido a", "El técnico que instala el sistema en la oficina"],
], [5 * cm, 11.2 * cm], cabecera=False))

h.append(Spacer(1, 1.6 * cm))
h.append(P("Este manual cubre la instalación completa, la puesta en marcha, los respaldos, "
           "las actualizaciones y la solución de los problemas más frecuentes.", "portada_pie"))
h.append(NextPageTemplate("normal"))
h.append(PageBreak())

# ── INDICE ──────────────────────────────────────────────────────────────────
h.append(H1("Contenido"))
secciones = [
    ("1", "Cómo funciona el sistema", "3"),
    ("2", "Requisitos del servidor", "4"),
    ("3", "Preparar el servidor antes de instalar", "5"),
    ("4", "Instalación paso a paso", "6"),
    ("5", "Comprobar que quedó bien instalado", "8"),
    ("6", "Conectar a los usuarios de la oficina", "9"),
    ("7", "Configuración inicial dentro del sistema", "10"),
    ("8", "El panel de administración", "11"),
    ("9", "Respaldos: cómo funcionan y cómo restaurar", "12"),
    ("10", "Actualizar a una versión nueva", "14"),
    ("11", "Problemas frecuentes", "15"),
    ("12", "Desinstalar", "17"),
    ("13", "Anexos: puertos, carpetas y comandos", "18"),
]
filas = [[f"<b>{n}</b>", t, p] for n, t, p in secciones]
h.append(Table(
    [[Paragraph(a, E["indice"]), Paragraph(b, E["indice"]), Paragraph(c, E["indice"])] for a, b, c in filas],
    colWidths=[1.2 * cm, 13 * cm, 2 * cm],
    style=TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (2, 0), (2, -1), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, GRIS_CLARO),
    ])))
h.append(PageBreak())

# ── 1. COMO FUNCIONA ────────────────────────────────────────────────────────
h.append(H1("1. Cómo funciona el sistema"))
h.append(P("Skynet CRM <b>no se instala en la computadora de cada usuario</b>. Se instala una sola vez "
           "en un equipo de la oficina que hace de servidor, y las demas personas entran desde el "
           "navegador de su propia computadora, igual que entrarian a una pagina web."))

h.append(tabla([
    ["Equipo", "Qué se instala", "Quien lo usa"],
    ["<b>El servidor</b><br/>Un PC de la oficina, siempre encendido",
     "Todo: el sistema, la base de datos PostgreSQL, los respaldos automáticos y el panel de administración",
     "El técnico y el gerente"],
    ["<b>Las demas computadoras</b><br/>Las de los analistas y supervisores",
     "Nada. Solo abren el navegador (Chrome, Edge o Firefox) en la dirección del servidor",
     "Todo el personal de la firma"],
], [5.2 * cm, 7.4 * cm, 3.6 * cm]))

h.append(H2("Qué queda instalado en el servidor"))
h.append(P("El instalador trae todo adentro. <b>No hace falta instalar PostgreSQL ni Node.js aparte</b>, "
           "ni tener conexión a internet durante la instalación."))
h.append(Spacer(1, 2))
for i in lista([
    "<b>El sistema</b>, que atiende a los usuarios en el puerto 3000.",
    "<b>PostgreSQL 16</b>, la base de datos donde vive toda la información, en el puerto 5433.",
    "<b>Arranque automático</b>: si se apaga el servidor, al encenderlo el sistema vuelve solo.",
    "<b>Respaldo diario</b> a las 10:00 de la noche, con 30 días de historial.",
    "<b>Panel de administración</b> en la bandeja de Windows, junto al reloj.",
]):
    h.append(i)

h.append(caja(
    "Por que la base de datos es PostgreSQL y no otra",
    "Con 30 personas trabajando a la vez, la base recibe muchas escrituras simultaneas: casos que se "
    "presentan, facturas que se cobran, tareas que se completan. PostgreSQL está hecho para eso. "
    "Bases de archivo unico como SQLite o Access permiten un solo escritor a la vez y se bloquearian.",
    "info"))
h.append(PageBreak())

# ── 2. REQUISITOS ───────────────────────────────────────────────────────────
h.append(H1("2. Requisitos del servidor"))
h.append(P("El equipo que hará de servidor debe cumplir esto. No hace falta un servidor profesional: "
           "una computadora de escritorio decente alcanza para 30 usuarios."))

h.append(H2("Hardware"))
h.append(tabla([
    ["Componente", "Minimo", "Recomendado", "Por que"],
    ["Procesador", "2 núcleos", "4 núcleos o más", "El sistema y la base comparten el equipo"],
    ["Memoria RAM", "8 GB", "16 GB", "PostgreSQL reserva 512 MB y crece con el uso"],
    ["Disco", "SSD 120 GB", "SSD 250 GB o más", "<b>Debe ser SSD.</b> Un disco mecánico es lo unico que hará lento el sistema"],
    ["Energía", "-", "UPS", "Un corte de luz a mitad de una escritura es el riesgo real de perder datos"],
], [3 * cm, 2.8 * cm, 3.4 * cm, 7 * cm]))

h.append(H2("Sistema operativo y red"))
h.append(tabla([
    ["Requisito", "Detalle"],
    ["Windows", "Windows 10, Windows 11 o Windows Server, <b>de 64 bits</b>. No se necesita la edicion Pro"],
    ["Permisos", "Una cuenta de <b>administrador</b> para instalar (crea servicios y reglas de firewall)"],
    ["Red", "El servidor y los usuarios en la <b>misma red local</b> (mismo router o switch)"],
    ["Dirección IP", "<b>Fija.</b> Si cambia, los usuarios pierden el acceso (ver sección 3)"],
    ["Espacio libre", "Al menos <b>3 GB</b> para instalar, más el espacio que crecera la base"],
    ["Encendido", "El servidor debe quedar <b>encendido</b> en horario de trabajo. Puede reiniciarse: el sistema vuelve solo"],
], [3.6 * cm, 12.6 * cm]))

h.append(caja(
    "Sobre el antivirus",
    "Algunos antivirus bloquean programas que abren puertos de red o que se ejecutan como tarea "
    "programada. Si después de instalar el sistema no arranca, revisa el antivirus antes que "
    "cualquier otra cosa: agrega la carpeta C:\\SkynetCRM a sus excepciones.",
    "aviso"))
h.append(PageBreak())

# ── 3. PREPARAR EL SERVIDOR ─────────────────────────────────────────────────
h.append(H1("3. Preparar el servidor antes de instalar"))
h.append(P("Estos tres pasos se hacen <b>antes</b> de ejecutar el instalador. El instalador detecta si "
           "faltan y avisa, pero no puede resolverlos por su cuenta."))

h.append(H2("3.1 Fijar la dirección IP del servidor"))
h.append(P("Por defecto el router reparte direcciones que cambian (DHCP). Si la del servidor cambia, "
           "los usuarios dejan de encontrar el sistema de un día para otro. Hay dos formas de evitarlo; "
           "cualquiera sirve:"))
h.append(Spacer(1, 2))
for i in numerada([
    "<b>En el router (preferible):</b> entra a la configuración del router y asigna una IP fija al "
    "servidor por su dirección MAC. La opcion suele llamarse <i>Reserva DHCP</i> o <i>IP estatica</i>.",
    "<b>En Windows:</b> Panel de control, Redes e Internet, Conexiones de red. Clic derecho sobre la "
    "conexión, Propiedades, <i>Protocolo de Internet versión 4 (TCP/IPv4)</i>, Propiedades, y marca "
    "<i>Usar la siguiente dirección IP</i>. Debes conocer el rango de la red y la puerta de enlace.",
]):
    h.append(i)
h.append(Spacer(1, 4))
h.append(P("Para ver la IP actual del servidor, abre el simbolo del sistema y escribe:"))
h.append(código(["ipconfig"]))
h.append(P("Busca la linea <b>Dirección IPv4</b>. Anótala: la vas a necesitar al final para dar el "
           "acceso a los usuarios."))

h.append(H2("3.2 Poner la zona horaria de Venezuela"))
h.append(caja(
    "Esto es más importante de lo que parece",
    "El sistema calcula solo las fechas límite de cada obligación fiscal usando la fecha del servidor. "
    "Si la zona horaria está mal, <b>las fechas límite pueden salir corridas un día</b>, y nadie lo nota "
    "hasta que se pasa un vencimiento ante el SENIAT.",
    "peligro"))
h.append(P("Ve a Configuración de Windows, Hora e idioma, Fecha y hora, y elige "
           "<b>(UTC-04:00) Caracas</b>. Verifica también que la fecha y la hora estén correctas."))

h.append(H2("3.3 Revisar el espacio y la energía"))
h.append(Spacer(1, 2))
for i in lista([
    "Confirma que hay al menos <b>3 GB libres</b> en el disco donde vas a instalar.",
    "Si el servidor tiene un segúndo disco, conviene poner ahí la carpeta de datos: el instalador lo "
    "pregunta y así la base no compite con el sistema operativo.",
    "Conecta el servidor a una <b>UPS</b> si la oficina tiene cortes de luz frecuentes.",
]):
    h.append(i)
h.append(PageBreak())

# ── 4. INSTALACION ──────────────────────────────────────────────────────────
h.append(H1("4. Instalación paso a paso"))
h.append(P("Ten a maño el archivo <b>SkynetCRM-Setup.exe</b>. Cópialo al servidor, por ejemplo al "
           "Escritorio. La instalación completa tarda entre 5 y 15 minutos según el equipo."))

h.append(caja(
    "Antes de empezar, decide dos contraseñas",
    "El asistente te va a pedir dos contraseñas distintas, y conviene tenerlas escritas antes de "
    "empezar: <b>(1) la de la base de datos</b>, que es técnica y solo la usa el sistema, y "
    "<b>(2) la del gerente</b>, que es con la que esa persona entrará al sistema. Ambas deben tener "
    "al menos 8 caracteres.",
    "info"))

h.append(H2("Paso 1: Ejecutar como administrador"))
h.append(P("Haz <b>clic derecho</b> sobre <b>SkynetCRM-Setup.exe</b> y elige "
           "<b>Ejecutar como administrador</b>. Windows pedirá confirmacion: acepta. "
           "Si no lo ejecutas como administrador, la instalación fallará al crear el servicio de "
           "la base de datos."))

h.append(H2("Paso 2: Elegir los componentes"))
h.append(P("La primera pantalla ofrece tres opciones. <b>Para una instalación nueva, deja "
           "\"Instalación completa\"</b>, que es la recomendada."))
h.append(tabla([
    ["Componente", "Para que sirve", "Dejarlo marcado"],
    ["Sistema Skynet CRM", "El sistema en si. Es obligatorio", "Si (no se puede quitar)"],
    ["Base de datos PostgreSQL 16", "Instala la base de datos en este servidor", "Si, salvo que ya tengas una base preparada"],
    ["Panel de administración", "El icono junto al reloj para manejar el sistema", "Si"],
    ["Respaldo automático diario", "Copia de seguridad todas las noches", "Si, siempre"],
    ["Abrir el puerto en el firewall", "Permite que las otras computadoras entren", "Si"],
    ["Cargar datos de demostracion", "Llena el sistema con clientes y casos de ejemplo", "<b>No</b>, salvo que sea una instalación de prueba"],
], [4.4 * cm, 7.2 * cm, 4.6 * cm]))

h.append(caja(
    "Cuidado con los datos de demostracion",
    "Si marcas esa casilla en el servidor real, la firma vera 14 clientes y 171 casos inventados "
    "mezclados con los suyos. Márcalo solo sí estás montando un equipo de prueba.",
    "aviso"))

h.append(H2("Paso 3: Configuración del servidor"))
h.append(P("Aquí defines los puertos y la contraseña técnica de la base de datos."))
h.append(tabla([
    ["Campo", "Valor sugerido", "Cuando cambiarlo"],
    ["Puerto del sistema", "3000", "Solo si otro programa ya usa el 3000. Los usuarios escribirán este número en el navegador"],
    ["Puerto de la base de datos", "5433", "Casí nunca. Se usa 5433 y no el habitual 5432 justamente para no chocar con otro PostgreSQL que ya exista"],
    ["Contraseña de la base de datos", "-", "Escribe una de al menos 8 caracteres. <b>No la usara ninguna persona</b>: es solo para que el sistema hable con la base"],
], [4.6 * cm, 3.2 * cm, 8.4 * cm]))

h.append(H2("Paso 4: Usuario Gerente"))
h.append(P("Esta es la cuenta con la que se entra al sistema por primera vez, y tiene acceso a todo."))
h.append(tabla([
    ["Campo", "Qué poner"],
    ["Correo del gerente", "El correo real de la persona, por ejemplo <i>gerente@sufirma.com</i>. Será su usuario para entrar"],
    ["Contraseña", "Minimo 8 caracteres. <b>Entrégasela solo a esa persona</b> y pídele que la cambie después"],
], [4.6 * cm, 11.6 * cm]))
h.append(caja(
    "Solo se crea esta cuenta",
    "En una instalación real el sistema crea únicamente al gerente. Los demas usuarios (supervisores y "
    "analistas) los crea esa persona desde el propio sistema, en la sección Usuarios.",
    "info"))

h.append(H2("Paso 5: Carpeta de datos"))
h.append(P("Es donde viven la base de datos y los respaldos. El valor por defecto es "
           "<b>C:\\SkynetCRM-datos</b>."))
h.append(P("Si el servidor tiene un segúndo disco, cámbialo a ese disco (por ejemplo "
           "<b>D:\\SkynetCRM-datos</b>). Tiene dos ventajas: la base no compite con el sistema "
           "operativo por el disco, y si hay que reinstalar Windows los datos no están en medio."))

h.append(H2("Paso 6: Instalar y esperar"))
h.append(P("Revisa el resumen y pulsa <b>Instalar</b>. El asistente hará, en orden:"))
h.append(Spacer(1, 2))
for i in numerada([
    "Copiar los archivos (es la parte más larga: son unos 750 MB).",
    "Instalar el runtime de Visual C++, que PostgreSQL necesita para funcionar.",
    "Crear la base de datos y registrarla como servicio de Windows.",
    "Crear las tablas del sistema y la cuenta del gerente.",
    "Programar el arranque automático y el respaldo diario.",
    "Abrir el puerto en el firewall y arrancar el sistema.",
]):
    h.append(i)
h.append(Spacer(1, 5))
h.append(P("Al terminar, marca las dos casillas que ofrece (<i>abrir el panel</i> y <i>abrir el "
           "sistema</i>) y pulsa <b>Finalizar</b>."))
h.append(PageBreak())

# ── 5. COMPROBAR ────────────────────────────────────────────────────────────
h.append(H1("5. Comprobar que quedó bien instalado"))
h.append(P("Haz estas seis comprobaciones <b>en este orden</b>. Si una falla, no sigas: resuélvela "
           "antes, porque las siguientes dependen de ella."))

h.append(tabla([
    ["#", "Qué comprobar", "Cómo", "Si falla"],
    ["1", "El icono del panel está junto al reloj y en <b>verde</b>",
     "Mira la bandeja de Windows, abajo a la derecha. Puede estar oculto tras la flecha",
     "Ve a la sección 11, problema 1"],
    ["2", "La base de datos responde",
     "Pasa el mouse sobre el icono: debe decir <i>funcionando</i>",
     "Sección 11, problema 2"],
    ["3", "El sistema abre en el servidor",
     "Abre el navegador en <b>http://localhost:3000</b>",
     "Sección 11, problema 3"],
    ["4", "El gerente puede entrar",
     "Usa el correo y la contraseña del Paso 4",
     "Sección 11, problema 4"],
    ["5", "Se ve desde <b>otra computadora</b>",
     "Desde otro PC de la oficina abre <b>http://LA-IP-DEL-SERVIDOR:3000</b>",
     "Sección 11, problema 5"],
    ["6", "El sistema vuelve solo al reiniciar",
     "Reinicia el servidor, espera 2 minutos y repite la comprobación 3",
     "Sección 11, problema 6"],
], [0.9 * cm, 4.6 * cm, 6.5 * cm, 4.2 * cm]))

h.append(caja(
    "La comprobación 5 es la que de verdad importa",
    "Que el sistema abra en el propio servidor no prueba casi nada: puede estar funcionando y aun así "
    "ser invisible para el resto de la oficina si el firewall lo bloquea o si la red está mal. "
    "<b>No des la instalación por terminada hasta que entre desde otra computadora.</b>",
    "aviso"))
h.append(PageBreak())

# ── 6. CONECTAR USUARIOS ────────────────────────────────────────────────────
h.append(H1("6. Conectar a los usuarios de la oficina"))
h.append(P("Los usuarios no instalan nada. Solo necesitan la dirección del servidor y un navegador."))

h.append(H2("Obtener la dirección"))
h.append(P("Haz clic derecho en el icono del panel y elige <b>Copiar la dirección para los usuarios</b>. "
           "Queda en el portapapeles, con esta forma:"))
h.append(código(["http://192.168.1.50:3000"]))
h.append(P("El número variará según tu red. Envíalo por correo o WhatsApp a todo el personal."))

h.append(H2("Crear un acceso directo en cada computadora"))
h.append(P("Para que nadie tenga que escribir la dirección cada dia, en cada computadora:"))
h.append(Spacer(1, 2))
for i in numerada([
    "Abre el navegador en esa dirección.",
    "En Chrome o Edge: menú de tres puntos, <i>Guardar y compartir</i>, <i>Crear acceso directo</i>. "
    "Marca <i>Abrir como ventana</i> si quieres que se vea como un programa.",
    "También pueden marcarla como favorito, o fijar la pestána.",
]):
    h.append(i)

h.append(H2("Navegadores compatibles"))
h.append(tabla([
    ["Navegador", "Funciona"],
    ["Google Chrome", "Si, recomendado"],
    ["Microsoft Edge", "Si, viene con Windows"],
    ["Mozilla Firefox", "Si"],
    ["Internet Explorer", "<b>No.</b> Es un navegador descontinuado y el sistema no lo soporta"],
], [7 * cm, 9.2 * cm]))

h.append(caja(
    "Teléfonos y tablets",
    "El sistema se adapta a pantallas pequeñas, así que se puede usar desde el teléfono <b>sí está "
    "conectado al wifi de la oficina</b>. Desde fuera de la oficina no funciona: el servidor solo es "
    "visible en la red local. Publicarlo a internet requiere otra configuración y no es parte de "
    "esta instalación.",
    "info"))
h.append(PageBreak())

# ── 7. CONFIGURACION INICIAL ────────────────────────────────────────────────
h.append(H1("7. Configuración inicial dentro del sistema"))
h.append(P("El sistema ya funciona, pero hay cuatro cosas que solo puede cargar la firma. Las hace el "
           "gerente entrando al sistema; el técnico puede acompanarlo la primera vez."))

h.append(H2("7.1 Crear los usuarios"))
h.append(P("En el menú lateral, <b>Usuarios</b>. Se crean con nombre, correo, contraseña y rol:"))
h.append(tabla([
    ["Rol", "Qué puede hacer"],
    ["Gerente", "Todo: configuración, automatizaciones, usuarios, y ve la información de todos"],
    ["Supervisor", "Aprueba, elimina, reasigna cartera y lleva la cobranza. Ve la información de todos"],
    ["Analista", "Trabaja <b>solo su propia cartera</b> de clientes. No ve los clientes de los demas"],
], [3.4 * cm, 12.8 * cm]))

h.append(H2("7.2 Cargar el calendario del SENIAT"))
h.append(caja(
    "Sin esto, parte del sistema queda a medias",
    "El sistema calcula solo las fechas límite, pero para los <b>contribuyentes especiales</b> necesita "
    "el calendario que el SENIAT publica cada año en su providencia: que día del mes le toca a cada "
    "terminación de RIF. Mientras no este cargado, esas obligaciones le piden la fecha al analista en "
    "vez de calcularla.",
    "aviso"))
h.append(P("En <b>Configuración</b>, sección <b>Calendario del SENIAT</b>. Se cargan los diez digitos "
           "de una vez, tal como vienen en la providencia, y se pulsa <i>Guardar calendario</i>. "
           "Hay que repetirlo una vez al año."))

h.append(H2("7.3 Revisar las obligaciones y los días feriados"))
h.append(P("En la misma pagina de <b>Configuración</b>:"))
h.append(Spacer(1, 2))
for i in lista([
    "<b>Obligaciones fiscales:</b> vienen nueve cargadas (IVA, retenciones, ISLR, IVSS, FAOV, INCES e "
    "impuesto municipal). Revisa que la regla de vencimiento de cada una coincida con lo que aplica a "
    "los clientes de la firma. Cada una muestra una vista previa de como quedaria su próxima fecha.",
    "<b>Días no hábiles:</b> vienen los feriados nacionales del año, con Carnaval y Semana Santa ya "
    "calculados. Agrega los feriados <b>municipales</b> que apliquen, porque afectan el conteo de "
    "días hábiles.",
]):
    h.append(i)

h.append(H2("7.4 Configurar el correo saliente"))
h.append(P("Para que el sistema envie avisos por correo hace falta una cuenta de envio. En "
           "<b>Configuración</b>, sección <b>Correo saliente (SMTP)</b>. Si la firma usa Gmail, "
           "el sistema trae el preajuste; hay que generar una <b>contraseña de aplicación</b> desde "
           "la cuenta de Google, porque la contraseña normal no sirve."))
h.append(P("Si no se configura, el resto del sistema funciona igual: solo no se envian correos."))
h.append(PageBreak())

# ── 8. PANEL ────────────────────────────────────────────────────────────────
h.append(H1("8. El panel de administración"))
h.append(P("Es el icono junto al reloj. Se abre con <b>clic derecho</b>. Sirve para manejar el sistema "
           "sin tocar comandos, y funciona aunque el sistema este caido, que es justo cuando hace falta."))

h.append(H2("El color del icono"))
h.append(tabla([
    ["Color", "Significa", "Qué hacer"],
    ["Verde", "El sistema y la base funcionan", "Nada"],
    ["Rojo", "El sistema está detenido, o la base no responde", "Abre el menu: la primera linea dice cual de los dos falla"],
    ["Gris", "El panel está comprobando", "Esperar unos segúndos"],
], [2.6 * cm, 6.6 * cm, 7 * cm]))
h.append(P("El panel revisa el estado cada 30 segúndos por su cuenta.", "p"))

h.append(H2("Las opciones del menú"))
h.append(tabla([
    ["Opcion", "Qué hace"],
    ["Abrir el sistema", "Abre el navegador en el sistema. También funciona doble clic sobre el icono"],
    ["Copiar la dirección para los usuarios", "Copia la dirección de red al portapapeles para enviarla"],
    ["Iniciar el servidor", "Arranca el sistema sí estába detenido"],
    ["Detener el servidor", "Lo detiene. <b>Los usuarios pierden el acceso</b>, por eso pide confirmacion"],
    ["Reiniciar el servidor", "Lo detiene y lo vuelve a arrancar. Es lo primero que se prueba ante un comportamiento raro"],
    ["Respaldar la base de datos ahora", "Genera un respaldo inmediato. <b>Hazlo siempre antes de actualizar</b>"],
    ["Abrir la carpeta de respaldos", "Abre el Explorador en la carpeta donde se guardan"],
    ["Ver el registro de errores", "Abre el archivo de registro del sistema. Es lo que hay que mirar cuando algo falla"],
    ["Cerrar este panel", "Cierra solo el icono. <b>El sistema sigue funcionando</b> y los usuarios no se enteran"],
], [6.2 * cm, 10 * cm]))

h.append(caja(
    "Cerrar el panel no apaga el sistema",
    "Son dos cosas distintas. El sistema corre por su cuenta como tarea de Windows; el panel es solo un "
    "mando a distancia. Para volver a abrirlo: menú Inicio, carpeta Skynet CRM, <i>Panel de Skynet CRM</i>.",
    "info"))
h.append(PageBreak())

# ── 9. RESPALDOS ────────────────────────────────────────────────────────────
h.append(H1("9. Respaldos: cómo funcionan y cómo restaurar"))

h.append(H2("Cómo funcionan"))
h.append(tabla([
    ["Cuándo", "Todas las noches a las <b>10:00 p.m.</b>, automáticamente"],
    ["Dónde", "En la carpeta <b>respaldos</b> dentro de la carpeta de datos que elegiste al instalar"],
    ["Nombre", "<b>skynet_crm_2026-07-28_2200.dump</b> (fecha y hora del respaldo)"],
    ["Cuántos se guardan", "Los de los <b>últimos 30 días</b>. Los más viejos se borran solos"],
    ["Verificación", "Cada respaldo se abre para comprobar que se puede leer. Si sale dañado, se descarta y avisa"],
], [4.4 * cm, 11.8 * cm], cabecera=False))

h.append(caja(
    "Los respaldos están en el mismo servidor",
    "Si el disco del servidor se daña, se pierden la base <b>y</b> los respaldos. Copia la carpeta de "
    "respaldos periódicamente a otro lugar: un disco externo, otra computadora o la nube. "
    "Es la diferencia entre un susto y perder la contabilidad de todos los clientes.",
    "peligro"))

h.append(H2("Restaurar un respaldo"))
h.append(P("Se hace cuando hubo una pérdida de datos o el sistema quedó inconsistente. "
           "<b>Restaurar reemplaza toda la información actual</b> por la del respaldo: todo lo cargado "
           "después de esa fecha se pierde."))
h.append(Spacer(1, 3))
h.append(H3("Paso 1: Detener el sistema"))
h.append(P("Clic derecho en el panel, <b>Detener el servidor</b>. Así nadie escribe mientras restauras."))

h.append(H3("Paso 2: Abrir PowerShell como administrador y situarte en la carpeta"))
h.append(código(["cd C:\\SkynetCRM\\postgres\\bin"]))

h.append(H3("Paso 3: Restaurar"))
h.append(P("Sustituye la ruta del archivo por la del respaldo que quieres restaurar, y usa el puerto "
           "que configuraste (5433 por defecto):"))
h.append(código([
    "$env:PGPASSWORD = \"la-contraseña-de-la-base\"",
    "",
    ".\\pg_restore.exe -h localhost -p 5433 -U skynet -d skynet_crm \\",
    "    --clean --if-exists \\",
    "    \"C:\\SkynetCRM-datos\\respaldos\\skynet_crm_2026-07-28_2200.dump\"",
]))
h.append(P("<b>--clean --if-exists</b> borra las tablas actuales antes de recrearlas. Sin eso, la "
           "restauración falla porque los datos ya existen."))

h.append(H3("Paso 4: Arrancar y verificar"))
h.append(P("Clic derecho en el panel, <b>Iniciar el servidor</b>. Entra al sistema y revisa que la "
           "información sea la esperada."))

h.append(caja(
    "Antes de restaurar, respalda lo que hay",
    "Aunque el estado actual parezca inservible, respaldalo primero desde el panel. Si la restauración "
    "sale mal, es tu única forma de volver atras.",
    "aviso"))
h.append(PageBreak())

# ── 10. ACTUALIZAR ──────────────────────────────────────────────────────────
h.append(H1("10. Actualizar a una versión nueva"))
h.append(P("Cuando haya una versión nueva del sistema recibirás un <b>SkynetCRM-Setup.exe</b> más "
           "reciente. El procedimiento es el mismo que instalar, pero con dos precauciones."))

h.append(Spacer(1, 2))
for i in numerada([
    "<b>Respalda primero.</b> Clic derecho en el panel, <i>Respaldar la base de datos ahora</i>. "
    "Espera el aviso de que termino.",
    "<b>Avisa al personal</b> y elige un momento sin gente trabajando: el sistema estara caido unos "
    "minutos.",
    "Ejecuta el nuevo instalador <b>como administrador</b>, sobre la instalación existente.",
    "Deja <b>la misma carpeta</b> de instalación y <b>la misma carpeta de datos</b> que la vez anterior.",
    "Cuando pregunte por los datos del gerente y las contraseñas, escribe los mismos de antes.",
    "Al terminar, repite las comprobaciones de la sección 5.",
]):
    h.append(i)

h.append(caja(
    "Los datos no se pierden al actualizar",
    "El instalador detecta que la base ya tiene información y <b>no la vuelve a crear</b>. Solo aplica "
    "los cambios de estructura que trae la versión nueva, conservando todo lo cargado. Aun asi, el "
    "respaldo del paso 1 no es opcional.",
    "info"))

h.append(H2("Si algo sale mal en la actualizacion"))
h.append(P("Restaura el respaldo que hiciste en el paso 1 siguiendo la sección 9, y avisa a soporte "
           "con el contenido del registro de errores (panel, <i>Ver el registro de errores</i>)."))
h.append(PageBreak())

# ── 11. PROBLEMAS ───────────────────────────────────────────────────────────
h.append(H1("11. Problemas frecuentes"))

problemas = [
    ("1", "El icono del panel no aparece junto al reloj",
     "El panel no se inició, o está oculto",
     "Windows agrupa los iconos: pulsa la flecha hacia arriba en la bandeja. Si no está, abrelo desde "
     "el menú Inicio, carpeta Skynet CRM, <i>Panel de Skynet CRM</i>."),
    ("2", "El icono está en rojo y dice que la base de datos no responde",
     "El servicio de PostgreSQL no arrancó",
     "Abre Servicios de Windows (tecla Windows + R, escribe <b>services.msc</b>), busca "
     "<b>SkynetCRM-PostgreSQL</b> y pulsa Iniciar. Si no arranca, revisa el registro de la base en la "
     "carpeta de datos, subcarpeta <b>postgres\\log</b>. La causa más común es que falte el runtime de "
     "Visual C++: vuelve a ejecutar el instalador."),
    ("3", "El sistema no abre en http://localhost:3000",
     "El sistema está detenido o fallo al arrancar",
     "Clic derecho en el panel, <i>Reiniciar el servidor</i>. Si sigue igual, abre <i>Ver el registro "
     "de errores</i>: las últimas líneas dicen qué falló. Revisa también que el antivirus no este "
     "bloqueando la carpeta C:\\SkynetCRM."),
    ("4", "El gerente no puede entrar: dice correo o contraseña incorrectos",
     "Se escribió distinto de cómo quedó en la instalación",
     "El correo debe ser exactamente el que pusiste en el Paso 4, sin espacios. Revisa que no este "
     "activado el Bloq Mayús. Si se perdió la contraseña, hay que reinstalar sobre la instalación "
     "existente y volver a fijarla; los datos no se pierden."),
    ("5", "Desde otra computadora no abre, pero en el servidor si",
     "El firewall bloquea el puerto, o la red no es la misma",
     "Tres cosas, en este orden: <b>(a)</b> confirma que ambos equipos estén en la misma red; "
     "<b>(b)</b> revisa que usaste la IP del servidor y no <i>localhost</i>; <b>(c)</b> vuelve a "
     "ejecutar el instalador marcando el componente del firewall. Si el antivirus trae su propio "
     "firewall, hay que abrir el puerto también ahí."),
    ("6", "Al reiniciar el servidor, el sistema no vuelve solo",
     "La tarea de arranque no se creó o esta deshabilitada",
     "Abre el Programador de tareas de Windows y busca <b>SkynetCRM-Servidor</b>. Debe estar "
     "habilitada y configurada <i>Al iniciar el equipo</i>. Si no está, vuelve a ejecutar el "
     "instalador."),
    ("7", "Las fechas límite salen corridas un día",
     "La zona horaria del servidor no es la de Venezuela",
     "Corrige la zona horaria (sección 3.2) y reinicia el sistema desde el panel. Las fechas de los "
     "casos ya creados hay que revisarlas a mano."),
    ("8", "Las obligaciones de contribuyentes especiales no calculan la fecha",
     "Falta cargar el calendario del SENIAT del año",
     "No es una falla: el sistema evita inventar una fecha fiscal. Carga el calendario en "
     "Configuración (sección 7.2) y las fechas aparecerán solas."),
    ("9", "El sistema está lento",
     "Casí siempre es el disco",
     "Verifica que el sistema esté instalado en un <b>SSD</b>, no en un disco mecánico. Revisa también "
     "cuánta RAM libre queda con el Administrador de tareas: si está al límite, cierra otros programas "
     "del servidor o amplia la memoria."),
    ("10", "No se generan los respaldos",
     "La tarea diaria no existe, o el disco está lleno",
     "Prueba <i>Respaldar la base de datos ahora</i> desde el panel: el mensaje dirá qué falla. "
     "Revisa el espacio libre. En el Programador de tareas debe existir <b>SkynetCRM-Respaldo</b>."),
]

for num, sintoma, causa, solucion in problemas:
    h.append(KeepTogether([
        Spacer(1, 6),
        Paragraph(f"Problema {num}: {sintoma}", E["h3"]),
        Paragraph(f"<b>Causa probable:</b> {causa}", estilo("pc", fontSize=9.3, leading=13, textColor=GRIS)),
        Spacer(1, 3),
        Paragraph(f"<b>Solución:</b> {solucion}", estilo("psol", fontSize=9.5, leading=13.5, alignment=TA_JUSTIFY)),
    ]))

h.append(Spacer(1, 10))
h.append(caja(
    "Antes de llamar a soporte",
    "Ten a maño dos cosas: el contenido del <b>registro de errores</b> (panel, <i>Ver el registro de "
    "errores</i>) y la versión instalada, que esta en el archivo <b>versión.json</b> dentro de la "
    "carpeta de instalación. Con eso se diagnostica casi todo sin ir al sitio.",
    "info"))
h.append(PageBreak())

# ── 12. DESINSTALAR ─────────────────────────────────────────────────────────
h.append(H1("12. Desinstalar"))
h.append(P("Desde el menú Inicio, carpeta Skynet CRM, <b>Desinstalar Skynet CRM</b>. O desde "
           "Configuración de Windows, Aplicaciones."))

h.append(H2("Qué se elimina y que no"))
h.append(tabla([
    ["Se elimina", "Se conserva"],
    ["El sistema y sus archivos<br/>El servicio de la base de datos<br/>Las tareas de arranque y respaldo"
     "<br/>La regla del firewall<br/>El panel de la bandeja",
     "<b>La carpeta de datos completa</b><br/>La base de datos con toda la información<br/>"
     "Todos los respaldos"],
], [8.1 * cm, 8.1 * cm]))

h.append(caja(
    "Esto es a proposito",
    "La contabilidad y las obligaciones fiscales de los clientes de la firma no se borran porque "
    "alguien desinstalo un programa. Si de verdad hay que eliminarlas, se borra la carpeta de datos a "
    "mano, y conviene guardar antes una copia de los respaldos.",
    "aviso"))

h.append(H2("Reinstalar conservando los datos"))
h.append(P("Si desinstalas y vuelves a instalar apuntando a <b>la misma carpeta de datos</b>, el "
           "sistema encuentra la base existente y la reutiliza: la firma recupera toda su información, "
           "usuarios incluidos."))
h.append(PageBreak())

# ── 13. ANEXOS ──────────────────────────────────────────────────────────────
h.append(H1("13. Anexos"))

h.append(H2("13.1 Puertos y nombres"))
h.append(tabla([
    ["Elemento", "Valor por defecto"],
    ["Puerto del sistema (lo usan los usuarios)", "3000"],
    ["Puerto de la base de datos (solo interno)", "5433"],
    ["Nombre de la base de datos", "skynet_crm"],
    ["Usuario de la base de datos", "skynet"],
    ["Servicio de Windows de la base", "SkynetCRM-PostgreSQL"],
    ["Tarea de arranque del sistema", "SkynetCRM-Servidor"],
    ["Tarea del respaldo diario", "SkynetCRM-Respaldo"],
], [9.6 * cm, 6.6 * cm]))

h.append(H2("13.2 Carpetas y archivos importantes"))
h.append(tabla([
    ["Ruta", "Qué es"],
    ["C:\\SkynetCRM", "Carpeta de instalación"],
    ["C:\\SkynetCRM\\.env", "Configuración técnica. <b>Contiene contraseñas: no compartir</b>"],
    ["C:\\SkynetCRM\\logs\\servidor.log", "Registro de errores del sistema (el del arranque anterior queda como servidor.1.log)"],
    ["C:\\SkynetCRM\\versión.json", "Versión instalada"],
    ["C:\\SkynetCRM-datos\\postgres", "La base de datos"],
    ["C:\\SkynetCRM-datos\\postgres\\log", "Registro de errores de la base de datos"],
    ["C:\\SkynetCRM-datos\\respaldos", "Los respaldos diarios"],
], [7.4 * cm, 8.8 * cm]))
h.append(P("Las rutas que empiezan por <b>C:\\SkynetCRM-datos</b> cambian si elegiste otra carpeta de "
           "datos durante la instalación.", "p"))

h.append(H2("13.3 Comandos utiles"))
h.append(P("Solo para el técnico, en PowerShell como administrador."))
h.append(H3("Ver el estado del servicio de la base de datos"))
h.append(código(["Get-Service SkynetCRM-PostgreSQL"]))
h.append(H3("Reiniciar la base de datos"))
h.append(código(["Restart-Service SkynetCRM-PostgreSQL"]))
h.append(H3("Ver si el sistema esta escuchando en su puerto"))
h.append(código(["Test-NetConnection -ComputerName localhost -Port 3000"]))
h.append(H3("Ver la dirección IP del servidor"))
h.append(código(["ipconfig"]))
h.append(H3("Forzar un respaldo sin usar el panel"))
h.append(código([
    "powershell -ExecutionPolicy Bypass -File C:\\SkynetCRM\\instalador\\respaldo.ps1",
]))

h.append(Spacer(1, 14))
h.append(caja(
    "Resumen de lo que hay qué hacer una vez al año",
    "Cargar el <b>calendario del SENIAT</b> del año nuevo en Configuración cuando salga la providencia, "
    "y revisar los <b>días feriados</b>, sobre todo Carnaval y Semana Santa, que cambian de fecha. "
    "Sin eso, el sistema seguira funcionando pero pedirá a maño las fechas que antes calculaba solo.",
    "info"))

doc.build(h)
print(f"PDF generado: {SALIDA}")
