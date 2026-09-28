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

Opción A, desde el navegador: abre **SQL Editor** y ejecuta, en orden, cada archivo de `supabase/migrations/` (`001_roles_perfiles.sql`, `002_ubicaciones.sql`, `003_catalogo.sql`, `004_movimientos_stock.sql`, `005_salidas_traslados.sql`, `006_trazabilidad.sql` y `007_panel_informes.sql`).

Opción B, con la CLI:

```bash
supabase login
supabase link --project-ref TU_REF_DE_PROYECTO
supabase db push
```

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

Sube el repositorio a Vercel o Netlify, define las variables de `.env` en su panel y usa `npm run build` como comando de compilación (carpeta de salida `dist`). Los archivos `vercel.json` y `public/_redirects` ya están incluidos para que las rutas funcionen al recargar la página. Recuerda actualizar *Site URL*, *Redirect URLs* y el secreto `SITE_URL` con el dominio final.

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

**Etiquetas de producto.** Desde la ficha de un producto (con el número de copias que quieras) o desde **Productos > Colecciones** (una etiqueta por cada producto de la colección). Usan los mismos formatos que las de ubicación. El QR contiene `PRD:` seguido del SKU; al escanearlo en una salida o traslado se localiza el producto al instante.

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
- **Alertas:** productos por debajo de su stock mínimo, y lotes con stock caducados o que caducan en los próximos 30 días.
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

Las siete se aplican en orden sobre un proyecto de Supabase vacío. Todas las escrituras de mercancía pasan por funciones (`registrar_entrada`, `registrar_salida`, `registrar_traslado`, `registrar_ajuste`) que validan permisos y datos. Nadie puede escribir directamente en `movimientos` ni en `stock_por_ubicacion`.

## Estructura

```
supabase/
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
