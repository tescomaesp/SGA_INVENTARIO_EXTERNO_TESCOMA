-- =====================================================================
-- SGA · Migración 004 · Movimientos y stock
--
-- Regla única para todos los tipos: la cantidad SALE de hueco_origen y
-- ENTRA en hueco_destino.
--   entrada  → solo destino        salida → solo origen
--   traslado → origen y destino    ajuste → uno de los dos (resta o suma)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Movimientos: registro inmutable de todo lo que pasa en el almacén
-- ---------------------------------------------------------------------
-- Se puede ejecutar más de una vez: si ya se aplicó, no duplica nada ni da error.

-- Requisito: la migración anterior tiene que estar aplicada
do $requisito$
begin
  if to_regclass('public.productos') is null then
    raise exception 'Falta la migración anterior: ejecuta primero 003_catalogo.sql y después esta.';
  end if;
end;
$requisito$;

create table if not exists public.movimientos (
  id                bigint generated always as identity primary key,
  tipo              text not null check (tipo in ('entrada', 'salida', 'traslado', 'ajuste')),
  producto_id       uuid not null references public.productos (id) on delete restrict,
  lote_id           uuid references public.lotes (id) on delete restrict,
  hueco_origen_id   uuid references public.huecos (id) on delete restrict,
  hueco_destino_id  uuid references public.huecos (id) on delete restrict,
  cantidad          numeric(14, 3) not null check (cantidad > 0 and cantidad <= 1000000000),
  motivo            text check (char_length(motivo) <= 40),
  destino_externo   text check (char_length(destino_externo) <= 200),
  contacto_id       uuid references public.contactos (id) on delete restrict,
  documento         text check (char_length(documento) <= 60),        -- nº de albarán, pedido…
  notas             text check (char_length(notas) <= 500),
  usuario_id        uuid not null references public.perfiles (id) on delete restrict,
  fecha             timestamptz not null default now(),
  constraint movimientos_huecos_segun_tipo check (
    case tipo
      when 'entrada'  then hueco_destino_id is not null and hueco_origen_id is null
      when 'salida'   then hueco_origen_id  is not null and hueco_destino_id is null
      when 'traslado' then hueco_origen_id  is not null and hueco_destino_id is not null and hueco_origen_id <> hueco_destino_id
      when 'ajuste'   then (hueco_origen_id is null) <> (hueco_destino_id is null)
    end
  )
);

create index if not exists movimientos_producto_fecha_idx on public.movimientos (producto_id, fecha desc);
create index if not exists movimientos_usuario_fecha_idx  on public.movimientos (usuario_id, fecha desc);
create index if not exists movimientos_fecha_idx          on public.movimientos (fecha desc);
create index if not exists movimientos_tipo_fecha_idx     on public.movimientos (tipo, fecha desc);
create index if not exists movimientos_origen_idx         on public.movimientos (hueco_origen_id);
create index if not exists movimientos_destino_idx        on public.movimientos (hueco_destino_id);
create index if not exists movimientos_lote_idx           on public.movimientos (lote_id);
create index if not exists movimientos_contacto_idx       on public.movimientos (contacto_id);

-- Inmutabilidad: ni siquiera un administrador puede editar o borrar un movimiento.
-- Los errores se corrigen con un movimiento de ajuste, que también queda registrado.
create or replace function public.movimientos_inmutables()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Los movimientos no se pueden modificar ni eliminar. Registra un ajuste para corregirlo.'
    using errcode = '42501';
end;
$$;

create or replace trigger movimientos_sin_cambios
  before update or delete on public.movimientos
  for each row execute function public.movimientos_inmutables();

create or replace trigger movimientos_sin_vaciado
  before truncate on public.movimientos
  for each statement execute function public.movimientos_inmutables();

-- ---------------------------------------------------------------------
-- Stock actual por producto, hueco y lote (lo mantiene un trigger)
-- ---------------------------------------------------------------------
create table if not exists public.stock_por_ubicacion (
  id              bigint generated always as identity primary key,
  producto_id     uuid not null references public.productos (id) on delete restrict,
  hueco_id        uuid not null references public.huecos (id) on delete restrict,
  lote_id         uuid references public.lotes (id) on delete restrict,
  cantidad        numeric(14, 3) not null check (cantidad >= 0),
  actualizado_en  timestamptz not null default now(),
  constraint stock_unico unique nulls not distinct (producto_id, hueco_id, lote_id)
);
create index if not exists stock_hueco_idx on public.stock_por_ubicacion (hueco_id);

create or replace function public.aplicar_movimiento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_disponible numeric;
begin
  -- Resta del origen (salida, traslado, ajuste negativo)
  if new.hueco_origen_id is not null then
    select s.cantidad into v_disponible
    from public.stock_por_ubicacion s
    where s.producto_id = new.producto_id
      and s.hueco_id = new.hueco_origen_id
      and s.lote_id is not distinct from new.lote_id
    for update;

    if coalesce(v_disponible, 0) < new.cantidad then
      raise exception 'Stock insuficiente en la ubicación: hay % y se intentan sacar %',
        trim_scale(coalesce(v_disponible, 0)), trim_scale(new.cantidad)
        using errcode = 'P0001', hint = 'stock_insuficiente';
    end if;

    if v_disponible = new.cantidad then
      delete from public.stock_por_ubicacion s
      where s.producto_id = new.producto_id and s.hueco_id = new.hueco_origen_id and s.lote_id is not distinct from new.lote_id;
    else
      update public.stock_por_ubicacion s
      set cantidad = s.cantidad - new.cantidad, actualizado_en = now()
      where s.producto_id = new.producto_id and s.hueco_id = new.hueco_origen_id and s.lote_id is not distinct from new.lote_id;
    end if;
  end if;

  -- Suma al destino (entrada, traslado, ajuste positivo)
  if new.hueco_destino_id is not null then
    insert into public.stock_por_ubicacion as s (producto_id, hueco_id, lote_id, cantidad)
    values (new.producto_id, new.hueco_destino_id, new.lote_id, new.cantidad)
    on conflict on constraint stock_unico
    do update set cantidad = s.cantidad + excluded.cantidad, actualizado_en = now();
  end if;

  return new;
end;
$$;

create or replace trigger movimientos_aplicar_stock
  after insert on public.movimientos
  for each row execute function public.aplicar_movimiento();

-- ---------------------------------------------------------------------
-- Seguridad: todos leen; nadie escribe directamente.
-- Los movimientos solo se crean a través de las funciones registrar_*.
-- ---------------------------------------------------------------------
alter table public.movimientos          enable row level security;
alter table public.stock_por_ubicacion  enable row level security;

drop policy if exists movimientos_lectura on public.movimientos;
create policy movimientos_lectura on public.movimientos         for select to authenticated using (public.tiene_permiso('ver_stock'));
drop policy if exists stock_lectura on public.stock_por_ubicacion;
create policy stock_lectura       on public.stock_por_ubicacion for select to authenticated using (public.tiene_permiso('ver_stock'));

revoke all on public.movimientos, public.stock_por_ubicacion from anon;
revoke insert, update, delete, truncate on public.movimientos, public.stock_por_ubicacion from authenticated;

-- ---------------------------------------------------------------------
-- Utilidades compartidas por las funciones de registro
-- ---------------------------------------------------------------------
create or replace function public._exigir_permiso(p_accion text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.tiene_permiso(p_accion) then
    raise exception 'No tienes permiso para hacer esta operación' using errcode = '42501';
  end if;
end;
$$;

-- Bloquea el hueco (serializa operaciones simultáneas) y comprueba que admite mercancía.
-- Devuelve el espacio libre, o null si el hueco no tiene capacidad definida.
create or replace function public._reservar_hueco_destino(p_hueco_id uuid, p_cantidad numeric)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hueco record;
  v_ocupado numeric;
  v_codigo text;
begin
  select h.id, h.activo, h.capacidad into v_hueco from public.huecos h where h.id = p_hueco_id for update;
  if not found then
    raise exception 'La ubicación indicada no existe';
  end if;
  select codigo_completo into v_codigo from public.v_huecos where id = p_hueco_id;

  if not v_hueco.activo then
    raise exception 'El hueco % está bloqueado y no admite mercancía', v_codigo using hint = 'hueco_bloqueado';
  end if;

  if v_hueco.capacidad is not null then
    select coalesce(sum(cantidad), 0) into v_ocupado from public.stock_por_ubicacion where hueco_id = p_hueco_id;
    if v_ocupado + p_cantidad > v_hueco.capacidad then
      raise exception 'El hueco % solo tiene espacio para % unidades más (capacidad %)',
        v_codigo, trim_scale(greatest(v_hueco.capacidad - v_ocupado, 0)), v_hueco.capacidad
        using hint = 'capacidad_superada';
    end if;
    return v_hueco.capacidad - v_ocupado - p_cantidad;
  end if;
  return null;
end;
$$;

-- Busca o crea un lote del producto. Si ya existe y se indica otra caducidad, se respeta la original.
create or replace function public._obtener_lote(p_producto_id uuid, p_codigo text, p_caducidad date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_codigo text := nullif(trim(p_codigo), '');
begin
  if v_codigo is null then
    if p_caducidad is not null then
      raise exception 'Para indicar una fecha de caducidad hay que indicar también el lote';
    end if;
    return null;
  end if;
  insert into public.lotes (producto_id, codigo, fecha_caducidad)
  values (p_producto_id, v_codigo, p_caducidad)
  on conflict (producto_id, codigo) do update set codigo = excluded.codigo
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public._exigir_permiso(text)                     from public, anon, authenticated;
revoke execute on function public._reservar_hueco_destino(uuid, numeric)    from public, anon, authenticated;
revoke execute on function public._obtener_lote(uuid, text, date)           from public, anon, authenticated;
revoke execute on function public.aplicar_movimiento()                      from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Registrar una entrada
--
-- p_producto_id: producto existente, o null para crear uno nuevo con
--   p_nombre, p_foto_url y p_coleccion_id (obligatorios en ese caso).
-- Si el producto existe y no tenía foto, p_foto_url se le asigna.
-- ---------------------------------------------------------------------
create or replace function public.registrar_entrada(
  p_hueco_id        uuid,
  p_cantidad        numeric,
  p_contacto_id     uuid,
  p_producto_id     uuid    default null,
  p_nombre          text    default null,
  p_foto_url        text    default null,
  p_coleccion_id    uuid    default null,
  p_lote            text    default null,
  p_fecha_caducidad date    default null,
  p_documento       text    default null,
  p_notas           text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_producto  public.productos;
  v_lote      uuid;
  v_mov       bigint;
  v_libre     numeric;
begin
  perform public._exigir_permiso('registrar_movimientos');

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero';
  end if;
  if p_contacto_id is null or not exists (select 1 from public.contactos where id = p_contacto_id) then
    raise exception 'Indica la persona de contacto';
  end if;
  if p_foto_url is not null and split_part(p_foto_url, '/', 1) <> auth.uid()::text then
    raise exception 'La foto no es válida';
  end if;

  -- Producto existente o nuevo
  if p_producto_id is not null then
    select * into v_producto from public.productos where id = p_producto_id;
    if not found then
      raise exception 'El producto no existe';
    end if;
    if not v_producto.activo then
      raise exception 'El producto % está dado de baja', v_producto.sku;
    end if;
    if v_producto.foto_url is null then
      if p_foto_url is null then
        raise exception 'Este producto no tiene foto: añade una para registrar la entrada';
      end if;
      update public.productos set foto_url = p_foto_url where id = v_producto.id;
    end if;
  else
    if nullif(trim(p_nombre), '') is null then
      raise exception 'Indica el nombre del producto';
    end if;
    if p_foto_url is null then
      raise exception 'La foto del producto es obligatoria';
    end if;
    if p_coleccion_id is null or not exists (select 1 from public.colecciones where id = p_coleccion_id and activa) then
      raise exception 'Elige una colección válida';
    end if;
    insert into public.productos (nombre, foto_url, coleccion_id, contacto_id, creado_por)
    values (trim(p_nombre), p_foto_url, p_coleccion_id, p_contacto_id, auth.uid())
    returning * into v_producto;
  end if;

  v_libre := public._reservar_hueco_destino(p_hueco_id, p_cantidad);
  v_lote  := public._obtener_lote(v_producto.id, p_lote, p_fecha_caducidad);

  insert into public.movimientos (tipo, producto_id, lote_id, hueco_destino_id, cantidad, contacto_id, documento, notas, usuario_id)
  values ('entrada', v_producto.id, v_lote, p_hueco_id, p_cantidad, p_contacto_id,
          nullif(trim(p_documento), ''), nullif(trim(p_notas), ''), auth.uid())
  returning id into v_mov;

  return jsonb_build_object(
    'movimiento_id', v_mov,
    'producto_id',   v_producto.id,
    'sku',           v_producto.sku,
    'nuevo',         p_producto_id is null,
    'espacio_libre', v_libre
  );
end;
$$;

revoke execute on function public.registrar_entrada(uuid, numeric, uuid, uuid, text, text, uuid, text, date, text, text) from public, anon;
grant  execute on function public.registrar_entrada(uuid, numeric, uuid, uuid, text, text, uuid, text, date, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Vistas
-- ---------------------------------------------------------------------

-- Ocupación real (sustituye a la provisional de la migración 002)
create or replace view public.v_ocupacion_huecos
with (security_invoker = true)
as
select
  h.id                                         as hueco_id,
  h.almacen_id,
  coalesce(sum(s.cantidad), 0)::numeric        as unidades,
  count(distinct s.producto_id)::integer       as referencias
from public.v_huecos h
left join public.stock_por_ubicacion s on s.hueco_id = h.id
group by h.id, h.almacen_id;

-- Catálogo con stock total
create or replace view public.v_productos
with (security_invoker = true)
as
select
  p.id, p.sku, p.nombre, p.foto_url, p.stock_minimo, p.notas, p.activo, p.creado_en,
  p.coleccion_id, c.nombre  as coleccion_nombre,
  p.contacto_id,  ct.nombre as contacto_nombre,
  coalesce(st.unidades, 0)::numeric      as stock_total,
  coalesce(st.ubicaciones, 0)::integer   as ubicaciones,
  (p.stock_minimo > 0 and coalesce(st.unidades, 0) < p.stock_minimo) as stock_bajo
from public.productos p
join public.colecciones c on c.id = p.coleccion_id
left join public.contactos ct on ct.id = p.contacto_id
left join lateral (
  select sum(s.cantidad) as unidades, count(distinct s.hueco_id) as ubicaciones
  from public.stock_por_ubicacion s where s.producto_id = p.id
) st on true;

-- Stock con la ruta del hueco y el lote (ficha de producto y ficha de hueco)
create or replace view public.v_stock
with (security_invoker = true)
as
select
  s.id, s.producto_id, p.sku, p.nombre as producto_nombre, p.foto_url,
  s.hueco_id, h.codigo_completo, h.almacen_id, h.almacen_nombre,
  s.lote_id, l.codigo as lote_codigo, l.fecha_caducidad,
  s.cantidad, s.actualizado_en
from public.stock_por_ubicacion s
join public.productos p on p.id = s.producto_id
join public.v_huecos  h on h.id = s.hueco_id
left join public.lotes l on l.id = s.lote_id;

-- Movimientos con nombres legibles (listados)
create or replace view public.v_movimientos
with (security_invoker = true)
as
select
  m.id, m.tipo, m.fecha, m.cantidad, m.motivo, m.destino_externo, m.documento, m.notas,
  m.producto_id, p.sku, p.nombre as producto_nombre, p.foto_url,
  m.lote_id, l.codigo as lote_codigo,
  m.hueco_origen_id,  ho.codigo_completo as origen_codigo,
  m.hueco_destino_id, hd.codigo_completo as destino_codigo,
  m.contacto_id, ct.nombre as contacto_nombre,
  m.usuario_id, u.nombre_completo as usuario_nombre
from public.movimientos m
join public.productos p on p.id = m.producto_id
join public.perfiles  u on u.id = m.usuario_id
left join public.lotes     l  on l.id  = m.lote_id
left join public.v_huecos  ho on ho.id = m.hueco_origen_id
left join public.v_huecos  hd on hd.id = m.hueco_destino_id
left join public.contactos ct on ct.id = m.contacto_id;

-- Stock recalculado desde cero a partir de los movimientos (auditoría)
create or replace view public.v_stock_reconstruido
with (security_invoker = true)
as
select producto_id, hueco_id, lote_id, sum(delta)::numeric as cantidad
from (
  select producto_id, hueco_destino_id as hueco_id, lote_id, cantidad as delta from public.movimientos where hueco_destino_id is not null
  union all
  select producto_id, hueco_origen_id, lote_id, -cantidad from public.movimientos where hueco_origen_id is not null
) d
group by producto_id, hueco_id, lote_id
having sum(delta) <> 0;

-- Diferencias entre el stock guardado y el reconstruido. Debe estar siempre vacía.
create or replace view public.v_descuadres_stock
with (security_invoker = true)
as
select
  coalesce(s.producto_id, r.producto_id) as producto_id,
  coalesce(s.hueco_id, r.hueco_id)       as hueco_id,
  coalesce(s.lote_id, r.lote_id)         as lote_id,
  coalesce(s.cantidad, 0)                as stock_guardado,
  coalesce(r.cantidad, 0)                as stock_segun_movimientos
from public.stock_por_ubicacion s
full join public.v_stock_reconstruido r
  on r.producto_id = s.producto_id and r.hueco_id = s.hueco_id and r.lote_id is not distinct from s.lote_id
where coalesce(s.cantidad, 0) <> coalesce(r.cantidad, 0);

revoke all on public.v_productos, public.v_stock, public.v_movimientos, public.v_stock_reconstruido, public.v_descuadres_stock from anon;
grant select on public.v_productos, public.v_stock, public.v_movimientos, public.v_stock_reconstruido, public.v_descuadres_stock to authenticated;

-- ---------------------------------------------------------------------
-- Permisos explícitos (no se depende de los permisos por defecto del proyecto)
-- ---------------------------------------------------------------------
grant select on public.movimientos, public.stock_por_ubicacion to authenticated;
grant all on public.movimientos, public.stock_por_ubicacion to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------
-- Registro de la migración aplicada (select * from public.sga_migraciones;)
-- ---------------------------------------------------------------------
insert into public.sga_migraciones (numero, nombre) values (4, '004_movimientos_stock.sql')
on conflict (numero) do update set nombre = excluded.nombre, aplicada_en = now();
