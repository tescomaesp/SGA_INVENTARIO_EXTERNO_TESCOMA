# SGA · Sistema de Gestión de Almacén

Plataforma interna para controlar entradas, salidas, ubicaciones y trazabilidad de mercancía.

**Estado: las 6 fases están completadas.**

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Autenticación, perfiles, roles, auditoría de accesos | ✅ |
| 2 | Ubicaciones (almacén, pasillo, estantería, nivel, hueco) y etiquetas QR | ✅ |
| 3 | Productos, colecciones, contactos y registro de entradas | ✅ |
| 4 | Salidas, traslados, ajustes y etiquetas de producto | ✅ |
| 5 | Trazabilidad, historial y seguimiento de lotes | ✅ |
| 6 | Panel principal, informes y exportación a Excel, CSV y PDF | ✅ |

## Tecnología

React 18 + TypeScript + Vite + Tailwind CSS en el navegador; Supabase (PostgreSQL, Auth, Storage y Edge Functions) como backend. Los permisos se aplican en la base de datos con seguridad a nivel de fila (RLS), no solo en la interfaz.

## Puesta en marcha

Necesitas Node.js 18 o superior, una cuenta gratuita en [supabase.com](https://supabase.com) y la [CLI de Supabase](https://supabase.com/docs/guides/cli) (`npm i -g supabase`).

### 1. Crear el proyecto en Supabase

Crea un proyecto nuevo y, en **Authentication**, configura lo siguiente:

- **Sign In / Providers > Email**: desactiva *Allow new users to sign up*. Nadie puede registrarse por su cuenta; el administrador invita.
- **URL Configuration**: en *Site URL* pon la dirección donde publicarás la aplicación (en local, `http://localhost:5173`). En *Redirect URLs* añade `http://localhost:5173/crear-contrasena` y `https://TU-DOMINIO/crear-contrasena`.
- **Email Templates**: pega las plantillas en español de `supabase/plantillas-email/` en *Invite user* y *Reset password*.
- **SMTP Settings** (muy recomendable): el correo integrado de Supabase solo envía unos pocos mensajes por hora y no sirve para uso real. Configura un proveedor como Resend, Brevo o el SMTP de tu empresa.

### 2. Crear la base de datos

**Opción recomendada, desde el navegador:** abre el archivo `supabase/instalar_todo.sql`, copia **todo** su contenido, pégalo en **SQL Editor > New query** y pulsa **Run**. Contiene todas las migraciones en orden. Si Supabase avisa de que la consulta tiene operaciones «destructivas» (`revoke`, `drop policy`…), confirma: forman parte de la configuración de permisos. Al final debe mostrar una tabla con 9 filas, del `001_roles_perfiles.sql` al `009_eliminaciones_registro.sql`.

**Actualizar una instalación anterior:** ejecuta el `instalar_todo.sql` nuevo igual que la primera vez. Como todas las migraciones se pueden repetir, aplica solo lo que falta y conserva todos los datos.

**Opción alternativa, con la CLI:**

```bash
supabase login
supabase link --project-ref TU_REF_DE_PROYECTO
supabase db push
```

También puedes ejecutar los archivos de `supabase/migrations/` uno a uno en el SQL Editor, siempre en orden.

**Importante: publicar el esquema `public` en la API.** En los proyectos de Supabase recientes, la API de datos puede venir sin el esquema `public` publicado. Si es así, se podrá iniciar sesión, pero la aplicación no podrá leer ningún dato y se quedará en la pantalla de acceso. Compruébalo en **Integrations > Data API > Settings > Exposed schemas**: tiene que aparecer **`public`** marcado (junto a `graphql_public`). Guarda los cambios si tienes que marcarlo. No hace falta tocar «Exposed tables» ni «Exposed functions»: las migraciones ya conceden los permisos tabla por tabla.

Todas las migraciones se pueden **ejecutar más de una vez** sin error y sin duplicar nada: si algo falla a mitad, se corrige la causa y se vuelve a ejecutar el mismo archivo. Además, cada una comprueba que la anterior esté aplicada; si no lo está, lo dice con un mensaje claro en lugar de un error técnico. Para ver cuáles están aplicadas:

```sql
select * from public.sga_migraciones order by numero;
```

#### Si el SQL Editor da error

| Mensaje | Causa y solución |
|---|---|
| `Falta la migración anterior: ejecuta primero…` | Se han ejecutado en otro orden. Ejecuta la que indica el mensaje y repite. |
| `syntax error at or near "```"` | Se ha copiado desde el listado `.md` o una web, incluyendo las líneas de marcado. Copia desde el archivo `.sql` original, o en GitHub desde el botón **Raw**. |
| `syntax error` al principio de una línea con un número | Se han copiado los números de línea de la vista de código de GitHub. Usa el botón **Raw** o **Copy raw file**. |
| `relation "…" already exists` | Es la versión antigua de las migraciones. Usa las actuales de este repositorio, que se pueden repetir. |
| La aplicación se queda «pensando» al entrar, o avisa de que no se ha podido cargar tu perfil | La API de datos no publica el esquema `public`. Márcalo en **Integrations > Data API > Settings > Exposed schemas** (ver arriba). |
| `must be owner of table objects` | El proyecto no es de Supabase Cloud o es una instalación propia sin la extensión `supautils`. En Supabase Cloud no ocurre. |

### 3. Desplegar la función de gestión de usuarios

```bash
supabase functions deploy gestionar-usuarios
supabase secrets set SITE_URL=http://localhost:5173   # en producción, tu dominio
```

### 4. Crear el primer administrador

1. En **Authentication > Users > Add user > Create new user**, escribe tu email y una contraseña y marca *Auto Confirm User*.
2. Abre `supabase/scripts/crear_admin_inicial.sql`, cambia el email y ejecútalo en el SQL Editor.

A partir de aquí, el resto del equipo se invita desde la propia aplicación.

Si quieres probar con datos de ejemplo, ejecuta también `supabase/scripts/datos_ejemplo_ubicaciones.sql` (crea `ALM1` con dos pasillos y 88 huecos) y `supabase/scripts/datos_ejemplo_catalogo.sql` (tres colecciones y dos contactos).

### 5. Arrancar la aplicación

```bash
cp .env.example .env      # rellena URL y anon key (Project Settings > API)
npm install
npm run dev               # http://localhost:5173
```

### 6. Publicar

**Con GitHub Pages (configurado en este repositorio).** El archivo `.github/workflows/publicar.yml` compila y publica la aplicación automáticamente cada vez que cambia la rama `main`. La dirección es `https://<usuario>.github.io/<repositorio>/`. Hay que configurarlo una sola vez en **Settings** del repositorio:

1. **Pages > Build and deployment > Source:** elige **GitHub Actions**.
2. **Secrets and variables > Actions > Variables:** crea `VITE_SUPABASE_URL` con la URL del proyecto (Supabase > Project Settings > Data API) y, opcionalmente, `VITE_NOMBRE_EMPRESA` con el nombre que aparecerá en la pantalla de acceso.
3. **Secrets and variables > Actions > Secrets:** crea `VITE_SUPABASE_ANON_KEY` con la clave pública *anon* (Supabase > Project Settings > API Keys).
4. En **Actions**, abre «Publicar en GitHub Pages» y pulsa **Run workflow**, o haz cualquier cambio en `main`.

En Supabase, la *Site URL*, las *Redirect URLs* y el secreto `SITE_URL` de la función deben usar la dirección completa con la subcarpeta, por ejemplo `https://usuario.github.io/repositorio` y `https://usuario.github.io/repositorio/crear-contrasena`.

**Con Vercel o Netlify.** Importa el repositorio, define las variables de `.env` en su panel y usa `npm run build` como comando de compilación (carpeta de salida `dist`). Los archivos `vercel.json` y `public/_redirects` ya están incluidos para que las rutas funcionen al recargar la página. Recuerda actualizar *Site URL*, *Redirect URLs* y el secreto `SITE_URL` con el dominio final.

## Roles

| Acción | Administrador | Responsable | Operario | Consulta |
|---|:-:|:-:|:-:|:-:|
| Ver stock, catálogo e historial | ✓ | ✓ | ✓ | ✓ |
| Registrar entradas, salidas y traslados | ✓ | ✓ | ✓ | |
| Editar fichas de producto | ✓ | ✓ | | |
| Ajustes de inventario | ✓ | ✓ | | |
| Informes y exportación | ✓ | ✓ | | ✓ |
| Ubicaciones y colecciones | ✓ | | | |
| Usuarios y roles | ✓ | | | |

La matriz vive en la función `public.tiene_permiso()` de la base de datos. `src/lib/permisos.ts` es una copia que solo decide qué se muestra en pantalla; si cambias una, cambia la otra.

## Cómo funciona la seguridad

- Todo usuario nuevo nace con el rol **Consulta**. El rol nunca se toma de datos que controle el usuario; solo lo cambia un administrador a través de la Edge Function.
- Cada usuario puede editar su nombre, teléfono, puesto y foto, pero no su rol, email ni estado (restricción por columnas en PostgreSQL).
- Desactivar a alguien bloquea su cuenta en Auth (no puede entrar ni renovar la sesión) y la base de datos deja de devolverle datos al instante.
- Un administrador no puede quitarse su propio rol ni desactivarse, para que nunca quede la empresa sin administrador por accidente.
- Se registran inicios de sesión, cierres e intentos fallidos con fecha, IP y dispositivo. Solo los administradores pueden consultarlos.
- Las fotos se guardan en un bucket privado; cada usuario solo puede escribir en su propia carpeta.

## Ubicaciones

La estructura física tiene cinco niveles: **almacén > pasillo > estantería > nivel > hueco**. Cada hueco tiene un código único que se forma uniendo los de sus niveles, por ejemplo `ALM1-P01-E03-N2-H04`. Los códigos solo admiten letras y números (se pasan a mayúsculas solos) porque el guion se reserva como separador.

No hace falta crear los huecos uno a uno. Al crear un pasillo se indica cuántas estanterías tiene, cuántos niveles cada una y cuántos huecos por nivel, y se genera todo de golpe. Después se pueden añadir estanterías, niveles o huecos sueltos desde el propio mapa.

El mapa dibuja cada estantería como se ve en el almacén, con el nivel 1 abajo. El color de cada hueco indica su estado (vacío, con mercancía, lleno o bloqueado); en esta fase todos aparecen vacíos, porque la ocupación real llegará con las entradas. Un hueco **bloqueado** sigue existiendo pero no admitirá mercancía nueva.

**Etiquetas QR.** Desde el menú de un almacén, pasillo, estantería o hueco se abren las etiquetas listas para imprimir, en dos formatos: hojas A4 de 21 etiquetas adhesivas (63,5 × 38,1 mm, tipo Avery L7160 o Apli 1263) o impresora de etiquetas con rollo de 100 × 50 mm. En el diálogo de impresión elige escala al 100 % y desactiva encabezados y pies de página. El QR contiene `UBI:` seguido del código del hueco; a partir de la fase 3 se podrá escanear con la cámara para indicar dónde se deja o se recoge la mercancía.

Solo los administradores modifican la estructura; el resto de roles ve el mapa, busca huecos e imprime etiquetas.

## Productos y entradas

**Registrar una entrada** es un único formulario en tres bloques:

1. **Producto.** Se busca por nombre o SKU. Si ya existe, se elige de la lista y se reutiliza su ficha (foto y colección). Si no existe, se crea en el momento con nombre, foto y colección; el SKU (`P000001`, `P000002`…) se asigna solo. Si el nombre coincide con uno existente, el formulario lo avisa para no duplicar productos.
2. **Cantidad y ubicación.** El hueco se elige bajando por los desplegables, escaneando su etiqueta QR con la cámara o escribiendo el código. Si el producto ya está guardado en algún hueco, se ofrece como atajo. El formulario avisa antes de enviar si la cantidad no cabe.
3. **Persona de contacto.** Se busca entre los contactos guardados o se crea uno nuevo sin salir del formulario. Si el producto tiene contacto habitual, aparece ya elegido.

Lote, caducidad, número de albarán y notas son opcionales. Tras guardar, «Registrar otra entrada» conserva el contacto y el albarán, que suelen repetirse en una misma descarga.

La cámara del escáner solo funciona si la aplicación se sirve por **HTTPS** (o en `localhost`). Vercel y Netlify ya lo hacen.

**La base de datos comprueba todo de nuevo al guardar**, aunque la interfaz ya lo haya hecho: permiso del usuario, que el hueco exista y no esté bloqueado, que la cantidad quepa, que la foto la haya subido el propio usuario y que el producto no esté dado de baja. Dos operarios que dejan mercancía en el mismo hueco a la vez no pueden superar su capacidad, porque la operación bloquea el hueco mientras se registra.

**Trazabilidad.** Cada entrada queda como un movimiento en la tabla `movimientos`, con quién, cuándo, cuánto, dónde, contacto, lote y albarán. Esa tabla no admite cambios ni borrados, ni siquiera desde el panel de Supabase; los errores se corregirán con movimientos de ajuste (fase 4). El stock de cada hueco se actualiza automáticamente con cada movimiento, y la vista `v_descuadres_stock` recalcula todo desde los movimientos para comprobar que cuadra: debe estar siempre vacía.

Como consecuencia, un hueco que ha tenido movimientos ya no se puede eliminar, y un usuario que ha registrado movimientos no se puede borrar de Supabase. En ambos casos lo correcto es bloquear el hueco o desactivar al usuario.

## Salidas, traslados y ajustes

**Salida y traslado** empiezan igual: hay que decir qué mercancía se mueve y de dónde. Se puede partir del producto (buscándolo o escaneando su etiqueta) o del hueco (escaneando la etiqueta de la estantería para ver qué contiene). Después se elige la línea concreta de stock, es decir, hueco y lote. Si hay lotes con caducidad, se ordenan para que salga primero lo que caduca antes, y el primero se marca con «sale primero».

- **Salida:** cantidad (con un botón «Todo» para vaciar la línea), motivo (envío a cliente, devolución a proveedor, merma o rotura, uso interno u otro), destino, número de pedido y notas. Si el motivo es «otro», las notas son obligatorias. Al registrar otra salida se conservan motivo, destino y pedido.
- **Traslado:** cantidad y hueco de destino, que se elige igual que en las entradas. Se puede sacar mercancía de un hueco bloqueado (para vaciarlo), pero no meterla. Se respeta la capacidad del destino.
- **Ajuste:** lo usan responsables y administradores desde la ficha del producto, con el botón «Ajustar» de cada ubicación. Se indica la **cantidad real contada** y el sistema registra la diferencia (positiva o negativa) como un movimiento de ajuste, con motivo y notas obligatorias. No comprueba capacidad ni bloqueo, porque refleja lo que hay físicamente. Es la forma de corregir cualquier error sin tocar el historial.

La base de datos vuelve a comprobarlo todo: que haya stock suficiente en esa línea exacta (hueco y lote), que el destino admita la mercancía, el motivo y los permisos. Las filas de stock implicadas quedan bloqueadas durante la operación, así que dos personas no pueden sacar la misma mercancía a la vez.

**Etiquetas de producto.** Desde la ficha de un producto (con el número de copias que quieras) o desde **Productos > Colecciones** (una etiqueta por cada producto de la colección). Usan los mismos formatos que las de ubicación y llevan dos códigos: un **QR** con `PRD:` y el SKU, y un **código de barras Code 128** con el SKU, que leen también las pistolas lectoras convencionales.

**Escáner.** La cámara del móvil o la tablet lee tanto QR como códigos de barras (Code 128, Code 39, EAN-13, EAN-8, UPC, ITF y Data Matrix). Se usa en tres sitios:

- **Entradas:** escanear la etiqueta de un hueco para elegir dónde se deja la mercancía, o la de un producto que ya existe para no tener que buscarlo.
- **Salidas y traslados:** escanear la etiqueta del producto o la del hueco.
- **Pistola lectora USB o Bluetooth:** funciona sin configurar nada. Actúa como un teclado que «escribe» el código, así que basta con tener el cursor en la casilla de código de las salidas y traslados.

Si se escanea una etiqueta del tipo equivocado (por ejemplo, la de un hueco cuando se espera un producto), la aplicación lo indica en lugar de fallar.

## Trazabilidad

**Historial filtrable.** La sección **Trazabilidad** muestra todos los movimientos en una línea temporal agrupada por días. Se puede filtrar por producto, lote, tipo de movimiento, usuario, persona de contacto, ubicación (un hueco concreto o parte de un código, como `P01` para todo un pasillo), rango de fechas y texto libre (pedido, albarán, destino o notas). Los filtros se guardan en la dirección de la página, así que una búsqueda se puede compartir copiando el enlace o guardar en favoritos.

Cada movimiento indica cuánto quedaba después: del producto en general o, si se filtra por lote, de ese lote. Se accede también desde la ficha de un producto («Ver historial completo») y desde la de un hueco («Historial»).

**Informe de lote.** Cada lote tiene su propia página, accesible desde la ficha del producto, desde cualquier movimiento o desde el filtro de trazabilidad. Reúne en una sola pantalla:

- **Origen:** primera entrada, persona de contacto y albarán.
- **Cifras:** cuánto entró, cuánto salió, los ajustes y cuánto queda.
- **Dónde está ahora:** huecos y cantidades.
- **A quién se ha enviado:** salidas agrupadas por destino, con fechas y documentos.
- **Recorrido completo** de principio a fin.

Es la pantalla pensada para una incidencia o una retirada de producto. Con el botón «Imprimir informe» sale una versión limpia, sin menús, que también se puede guardar como PDF.

Las vistas `v_trazabilidad` y `v_lotes` solo leen datos. Para cualquier lote se cumple siempre que *entrado − salido + ajustes = stock actual*; la comprobación 26 lo verifica.

## Panel principal

Es la primera pantalla al entrar. De un vistazo muestra:

- **Accesos directos** a registrar una entrada, una salida o un traslado (para quien tenga permiso).
- **Indicadores:** referencias activas, unidades en stock, unidades que han entrado y salido hoy y en la semana (desde el lunes), y ocupación del almacén. La ocupación es un porcentaje si los huecos tienen capacidad definida; si no, indica cuántos huecos tienen mercancía.
- **Gráfico de entradas y salidas** de los últimos 14 días, 12 semanas o 12 meses.
- **Ajustes negativos:** los productos que más unidades han perdido en ajustes de inventario (recuentos, roturas, errores) en los últimos 30 días, con enlace a esos ajustes en Trazabilidad. No cuenta el stock retirado al eliminar productos.
- **Caducidades:** lotes con stock caducados o que caducan en los próximos 30 días.
- El aviso de **stock bajo** sigue disponible en el filtro «Stock bajo» del catálogo.
- **Ocupación por pasillo**, con una barra por pasillo que se pone roja a partir del 90 %.
- **Últimos movimientos.**

«Hoy» y «esta semana» se calculan con la zona horaria del dispositivo de cada usuario, no con la del servidor. Los administradores ven además un aviso destacado si el stock no cuadrara con el historial; no debería aparecer nunca.

## Informes

La sección **Informes** (administradores, responsables y usuarios de consulta) ofrece cinco informes:

| Informe | Filtros | Contenido |
|---|---|---|
| Stock actual | Colección, almacén; por ubicación y lote o total por producto | Qué hay y dónde, con lote y caducidad |
| Movimientos | Fechas, tipo, usuario, colección | Cada operación con todos sus datos |
| Actividad por usuario | Fechas | Operaciones y unidades registradas por cada persona |
| Resumen por colección | Fechas | Referencias, stock actual y unidades entradas y salidas |
| Ocupación por ubicación | Almacén; por hueco, estantería o pasillo | Capacidad, unidades y porcentaje de ocupación |

Cada informe muestra una vista previa de las 100 primeras filas, con totales calculados sobre todas. Se descarga en tres formatos:

- **Excel (.xlsx):** con cabecera fija, números y fechas como valores reales (se pueden sumar y filtrar) y fila de totales.
- **CSV:** con punto y coma y coma decimal, que Excel en español abre directamente con las tildes bien.
- **PDF:** con título, filtros aplicados, fecha, autor y número de página. Si el informe tiene más de seis columnas, sale en horizontal.

Las exportaciones incluyen todas las filas del informe, no solo las de la vista previa, hasta un máximo de 100.000. Para listados muy largos, Excel es el formato más cómodo.

**Catálogo.** El listado de productos se filtra por nombre o SKU, colección, persona de contacto, stock bajo y **ubicación**. En la ubicación vale cualquier parte de un código: `P01` (todo un pasillo), `P01-E03` (una estantería) o el código completo de un hueco. La ficha de cada producto incluye su **historial completo** en línea temporal, con el stock que quedaba tras cada movimiento.

## Eliminar elementos y registro de modificaciones

Los **administradores** pueden eliminar almacenes, pasillos, estanterías, niveles, huecos, productos, colecciones y contactos:

- **De uno en uno:** desde el menú de cada elemento o desde su ficha.
- **En bloque:** en **Productos**, **Colecciones** y **Contactos**, cada fila tiene una casilla, y otra casilla marca toda la página. En **Ubicaciones**, el botón **Seleccionar para eliminar** activa un modo en el que se marcan pasillos o estanterías enteras con su casilla, o huecos sueltos pulsándolos. Una barra inferior indica cuánto hay seleccionado y permite eliminarlo todo de una vez.

Antes de eliminar se muestra la lista de lo que se va a eliminar y se puede escribir un motivo. Si alguno de los elementos no se puede eliminar, los demás se eliminan igualmente y se explica el motivo de cada uno.

Qué significa eliminar:

- El elemento **desaparece de toda la aplicación**: catálogo, mapa, buscadores, selectores e informes de stock. Su código o nombre se puede volver a usar.
- **El historial no se pierde.** Los movimientos son inmutables, así que Trazabilidad y los informes de movimientos siguen mostrando lo eliminado, marcado como «(eliminado)».
- **Productos con stock:** el stock se retira con un ajuste de motivo «Retirada al eliminar el producto», para que el stock siga cuadrando con el historial.
- **Ubicaciones con mercancía:** no se eliminan. La aplicación indica qué hay y dónde, para vaciarlas antes con una salida o un traslado.
- **Colecciones con productos:** no se eliminan hasta que no les quede ninguno.

El apartado **Modificaciones** (solo administradores) recoge cada eliminación y cada edición de ubicaciones, productos, colecciones y contactos, con fecha, usuario, motivo y detalle:

- en las ediciones, cada campo con su valor anterior y el nuevo;
- en las eliminaciones, los huecos que incluía y el stock retirado.

Se puede filtrar y exportar a Excel. El registro no se puede modificar ni borrar, ni siquiera desde Supabase.

**Productos nuevos: notas obligatorias.** Al registrar la entrada de un producto nuevo, el campo **Notas** del apartado 3 es obligatorio. Sirve para dejar constancia del motivo de la entrada y de quién se recibe. La base de datos también lo exige.

**Permisos del catálogo.** Las colecciones las gestiona el administrador. Los contactos los puede crear cualquiera que registre entradas; los editan responsables y administradores y solo el administrador los elimina (y solo si no aparecen en ningún movimiento). Las fichas de producto las editan responsables y administradores; un producto dado de baja conserva su historial pero no admite más entradas.

## Comprobaciones

1. Entra como administrador y verás el menú **Usuarios**.
2. Invita a un compañero con rol Operario; debe recibir el correo, crear su contraseña y llegar a **Mi perfil**.
3. Entra como ese operario: no verá **Usuarios** y, si escribe `/usuarios` en la dirección, verá «Sin acceso a esta sección».
4. Como administrador, desactívalo: al intentar entrar verá «Tu cuenta está desactivada».
5. Prueba «He olvidado mi contraseña» y revisa **Usuarios > Registro de accesos**.

**Fase 2**

6. Como administrador, entra en **Ubicaciones**, crea el almacén y un pasillo con, por ejemplo, 3 estanterías de 4 niveles y 5 huecos. Deben aparecer 60 huecos.
7. Añade un hueco con el botón **+** de un nivel, bloquea otro desde su ficha y comprueba que se ve rayado.
8. Escribe `E02-N3` en el buscador: solo deben quedar resaltados los huecos de ese nivel.
9. Imprime las etiquetas de una estantería en PDF y escanea un QR con el móvil: debe leerse `UBI:ALM1-P01-E02-N3-H01` (o el código que corresponda).
10. Entra como operario: verás el mapa y podrás imprimir etiquetas, pero no aparecerán los botones de crear, editar ni eliminar.

**Fase 3**

11. Como administrador, crea dos colecciones en **Productos > Colecciones**.
12. Entra como operario, ve a **Entradas > Registrar entrada** y da de alta un producto nuevo desde el móvil: foto con la cámara, colección, 20 unidades, escanea la etiqueta de un hueco y crea un contacto nuevo.
13. Registra otra entrada del mismo producto: debe proponerte el hueco donde ya está y el contacto de la vez anterior.
14. Intenta meter en un hueco con capacidad más unidades de las que caben: el formulario debe avisar y no dejar guardar.
15. Abre el producto: debe mostrar el stock total, en qué hueco está y los dos movimientos. En **Ubicaciones**, ese hueco debe aparecer coloreado y su ficha debe listar el producto.
16. En el SQL Editor de Supabase ejecuta `select * from v_descuadres_stock;`: no debe devolver ninguna fila.

**Fase 4**

17. Imprime la etiqueta de un producto en PDF y, en **Salidas > Registrar salida**, escanéala: deben aparecer los huecos donde está.
18. Registra una salida de parte del stock y comprueba que la ficha del producto y el mapa reflejan lo que queda.
19. Intenta sacar más de lo que hay: el formulario debe avisar y, si se fuerza, la base de datos debe rechazarlo.
20. Traslada mercancía a otro hueco escaneando la etiqueta del destino; prueba también con un hueco bloqueado (debe rechazarse).
21. Como responsable, ajusta una línea desde la ficha del producto indicando una cantidad real distinta. En sus movimientos debe aparecer el ajuste con tu nombre, el motivo y la diferencia.
22. Como operario, comprueba que no aparece el botón «Ajustar».
23. Vuelve a ejecutar `select * from v_descuadres_stock;`: sigue sin devolver filas.

**Fase 5**

24. Registra una entrada con lote y caducidad, dos salidas de ese lote a destinos distintos y un traslado. Abre el lote desde la ficha del producto: deben aparecer el origen, los dos destinos con sus cantidades, dónde queda el resto y el recorrido completo.
25. En **Trazabilidad**, filtra por ese producto y comprueba que el «Queda» del movimiento más reciente coincide con el stock de la ficha. Combina filtros (por ejemplo, un usuario y solo salidas), copia la dirección y ábrela en otra pestaña: debe mostrar lo mismo.
26. En el SQL Editor: `select codigo from v_lotes where entrado - salido + ajuste_neto <> stock_actual;` no debe devolver filas.
27. Imprime el informe de un lote en PDF y comprueba que no aparece el menú lateral.

**Fase 6**

28. Entra como operario: el panel debe mostrar los accesos directos, los indicadores, el gráfico y las alertas, pero no el menú **Informes**.
29. Registra una entrada y una salida y vuelve al panel: «Entradas hoy» y «Salidas hoy» deben reflejarlas, y también la barra de hoy del gráfico.
30. Pon un stock mínimo mayor que el stock actual en un producto: debe aparecer en la alerta «Stock bajo», y el enlace «Ver los…» debe abrir el catálogo ya filtrado.
31. Como usuario de consulta, abre **Informes > Movimientos** con el mes actual y descárgalo en Excel, CSV y PDF. Comprueba que el Excel suma bien la columna de cantidades y que el CSV se abre con las tildes correctas.
32. En **Ocupación por ubicación**, cambia la agrupación a pasillo y comprueba que los totales coinciden con el panel.

**Mejoras finales**

33. Imprime la etiqueta de un producto y, en **Salidas > Registrar salida**, escanea con el móvil su **código de barras** (no el QR): debe mostrar dónde está el producto.
34. En **Productos**, escribe `P01` en el filtro de ubicación: solo deben quedar los productos con stock en ese pasillo.
35. Abre un enlace con filtros, por ejemplo `/trazabilidad?tipos=salida`, en una ventana sin sesión iniciada: tras entrar, debes llegar a esa misma página con el filtro aplicado.

**Eliminación y modificaciones**

36. En **Ubicaciones**, pulsa **Seleccionar para eliminar**, marca una estantería vacía y un hueco con mercancía y pulsa **Eliminar**. La estantería debe eliminarse y el hueco quedar bloqueado, con el motivo («Tiene mercancía…»).
37. En **Productos**, marca dos productos (uno con stock) y elimínalos. En su lugar, en **Trazabilidad**, el que tenía stock debe mostrar un ajuste «Retirada al eliminar el producto» y su nombre con «(eliminado)».
38. Abre **Modificaciones**: deben aparecer las eliminaciones con tu nombre, el motivo, los huecos incluidos y el stock retirado. Edita el nombre de un pasillo y comprueba que aparece la edición con el valor anterior y el nuevo.
39. Entra como operario: no deben aparecer casillas, el botón **Seleccionar para eliminar** ni el menú **Modificaciones**.
40. Registra la entrada de un producto nuevo sin notas: el formulario no debe dejar guardarla.

## Base de datos en resumen

| Migración | Contenido |
|---|---|
| 001 | Roles, perfiles, permisos, auditoría de accesos y fotos de perfil |
| 002 | Almacenes, pasillos, estanterías, niveles, huecos y generadores |
| 003 | Colecciones, contactos, productos, lotes y fotos de producto |
| 004 | Movimientos inmutables, stock por ubicación y registro de entradas |
| 005 | Salidas, traslados y ajustes |
| 006 | Vistas de trazabilidad y resumen de lotes |
| 007 | Indicadores del panel, series para gráficos e informes |
| 008 | Filtro del catálogo por ubicación |
| 009 | Eliminación de elementos, registro de modificaciones y ajustes negativos del panel |

Las nueve se aplican en orden (o todas juntas con `supabase/instalar_todo.sql`) y se pueden repetir sin efectos. Se han probado sobre una base de datos montada con los scripts oficiales de inicialización de Supabase, su servicio de almacenamiento y la extensión `supautils`, ejecutándolas como el usuario `postgres` del SQL Editor. Esas pruebas incluyen un proyecto nuevo, varias repeticiones seguidas, una instalación previa con la versión anterior y un proyecto sin permisos por defecto. Todas las escrituras de mercancía pasan por funciones (`registrar_entrada`, `registrar_salida`, `registrar_traslado`, `registrar_ajuste`) que validan permisos y datos. Nadie puede escribir directamente en `movimientos` ni en `stock_por_ubicacion`.

## Cómo se ha probado

Además de las pruebas de la base de datos descritas arriba, la aplicación completa se ha probado de extremo a extremo en una réplica local de Supabase. La réplica usaba los componentes oficiales: PostgreSQL con los scripts de inicialización de Supabase y la extensión `supautils`, Supabase Auth (GoTrue) con sus migraciones, PostgREST, la Edge Function ejecutada con Deno y un servidor de correo de pruebas. Sobre ella se ha usado la aplicación compilada en un navegador Chromium real, en tamaño de escritorio y de móvil:

- Acceso con contraseña incorrecta y correcta; invitación de un usuario desde la aplicación, recepción del correo, creación de la contraseña desde el enlace y bloqueo de las secciones no permitidas según el rol.
- Entrada de un producto nuevo con foto, sugerencia de ubicación en la siguiente entrada, aviso de capacidad, salida localizando el producto por su SKU, traslado y ajuste.
- Lectura con la cámara del código de barras y del QR de etiquetas generadas por la propia aplicación.
- Panel, mapa del almacén, filtro del catálogo por ubicación, historial, etiquetas y descarga de informes en Excel, CSV y PDF, revisando el contenido de cada archivo.
- Desactivación de un usuario y comprobación de que ya no puede entrar.

## Estructura

```
supabase/
  instalar_todo.sql     todas las migraciones en un solo archivo para el SQL Editor
  migrations/           esquema SQL por fases
  functions/            Edge Functions (gestión de usuarios)
  scripts/              administrador inicial y datos de ejemplo
  plantillas-email/     correos de invitación y recuperación en español
src/
  app/                  rutas y menú
  components/           piezas de interfaz reutilizables
  features/             un módulo por carpeta (auth, usuarios, perfil…)
  lib/                  cliente Supabase, permisos, utilidades
  types/                modelos de datos
```
