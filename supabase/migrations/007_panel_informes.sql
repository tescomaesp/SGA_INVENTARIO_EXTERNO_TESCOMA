-- =====================================================================
-- SGA · Migración 007 · Panel principal e informes
-- Solo lectura. Todas las funciones se ejecutan con los permisos del
-- usuario (las políticas de seguridad siguen aplicándose).
-- =====================================================================

-- Zona horaria válida o, si no lo es, UTC (así "hoy" es el día local del usuario)
-- Se puede ejecutar más de una vez: si ya se aplicó, no duplica nada ni da error.

-- Requisito: la migración anterior tiene que estar aplicada
do $requisito$
begin
  if to_regclass('public.v_trazabilidad') is null then
    raise exception 'Falta la migración anterior: ejecuta primero 006_trazabilidad.sql y después esta.';
  end if;
end;
$requisito$;

create or replace function public._zona_valida(p_zona text)
returns text
language sql
stable
set search_path = ''
as $$
  select case when exists (select 1 from pg_catalog.pg_timezone_names where name = p_zona) then p_zona else 'UTC' end
$$;

-- ---------------------------------------------------------------------
-- Indicadores del panel principal
-- ---------------------------------------------------------------------
create or replace function public.panel_indicadores(p_zona text default 'Europe/Madrid')
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_zona   text := public._zona_valida(p_zona);
  v_ahora  timestamp := now() at time zone v_zona;
  v_hoy    timestamptz := date_trunc('day', v_ahora) at time zone v_zona;
  v_semana timestamptz := date_trunc('week', v_ahora) at time zone v_zona;   -- desde el lunes
  v_fecha  date := v_ahora::date;
  r jsonb;
begin
  if not public.tiene_permiso('ver_stock') then
    raise exception 'No tienes permiso para ver el panel' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'referencias',           (select count(*) from public.productos where activo),
    'referencias_con_stock', (select count(distinct producto_id) from public.stock_por_ubicacion),
    'unidades',              (select coalesce(sum(cantidad), 0) from public.stock_por_ubicacion),
    'stock_bajo',            (select count(*) from public.v_productos where activo and stock_bajo),
    'hoy', (
      select jsonb_build_object(
        'entradas',         count(*) filter (where tipo = 'entrada'),
        'unidades_entrada', coalesce(sum(cantidad) filter (where tipo = 'entrada'), 0),
        'salidas',          count(*) filter (where tipo = 'salida'),
        'unidades_salida',  coalesce(sum(cantidad) filter (where tipo = 'salida'), 0),
        'traslados',        count(*) filter (where tipo = 'traslado'),
        'ajustes',          count(*) filter (where tipo = 'ajuste'))
      from public.movimientos where fecha >= v_hoy),
    'semana', (
      select jsonb_build_object(
        'entradas',         count(*) filter (where tipo = 'entrada'),
        'unidades_entrada', coalesce(sum(cantidad) filter (where tipo = 'entrada'), 0),
        'salidas',          count(*) filter (where tipo = 'salida'),
        'unidades_salida',  coalesce(sum(cantidad) filter (where tipo = 'salida'), 0),
        'traslados',        count(*) filter (where tipo = 'traslado'),
        'ajustes',          count(*) filter (where tipo = 'ajuste'))
      from public.movimientos where fecha >= v_semana),
    'huecos', (
      select jsonb_build_object(
        'total',                  count(*),
        'con_mercancia',          count(*) filter (where o.unidades > 0),
        'bloqueados',             count(*) filter (where not h.activo),
        'llenos',                 count(*) filter (where h.capacidad is not null and o.unidades >= h.capacidad),
        'capacidad',              coalesce(sum(h.capacidad), 0),
        'unidades_con_capacidad', coalesce(sum(o.unidades) filter (where h.capacidad is not null), 0))
      from public.huecos h
      join public.v_ocupacion_huecos o on o.hueco_id = h.id),
    'caducan_pronto', (
      select count(distinct l.id) from public.lotes l
      join public.stock_por_ubicacion s on s.lote_id = l.id
      where l.fecha_caducidad between v_fecha and v_fecha + 30),
    'caducados', (
      select count(distinct l.id) from public.lotes l
      join public.stock_por_ubicacion s on s.lote_id = l.id
      where l.fecha_caducidad < v_fecha),
    -- Comprobación de integridad: solo para administradores (recalcula todo el historial)
    'descuadres', case when public.tiene_permiso('gestionar_usuarios')
                    then (select count(*) from public.v_descuadres_stock) end
  ) into r;

  return r;
end;
$$;

-- ---------------------------------------------------------------------
-- Serie de entradas y salidas por día, semana o mes (rellena con ceros)
-- ---------------------------------------------------------------------
create or replace function public.serie_movimientos(
  p_desde date, p_hasta date, p_agrupar text default 'dia', p_zona text default 'Europe/Madrid')
returns table (periodo date, entradas numeric, salidas numeric, n_entradas integer, n_salidas integer)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_zona   text := public._zona_valida(p_zona);
  v_unidad text;
begin
  if not public.tiene_permiso('ver_stock') then
    raise exception 'No tienes permiso para ver estos datos' using errcode = '42501';
  end if;
  v_unidad := case p_agrupar when 'dia' then 'day' when 'semana' then 'week' when 'mes' then 'month' end;
  if v_unidad is null then
    raise exception 'Agrupación no válida: usa dia, semana o mes';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'El rango de fechas no es válido';
  end if;
  if p_hasta - p_desde > 3660 then
    raise exception 'El rango máximo es de 10 años';
  end if;

  return query
  with periodos as (
    select g::date as periodo
    from generate_series(date_trunc(v_unidad, p_desde::timestamp), date_trunc(v_unidad, p_hasta::timestamp), ('1 ' || v_unidad)::interval) g
  ),
  mov as (
    select date_trunc(v_unidad, m.fecha at time zone v_zona)::date as periodo, m.tipo, m.cantidad
    from public.movimientos m
    where m.tipo in ('entrada', 'salida')
      and m.fecha >= (p_desde::timestamp at time zone v_zona)
      and m.fecha <  ((p_hasta + 1)::timestamp at time zone v_zona)
  )
  select
    p.periodo,
    coalesce(sum(m.cantidad) filter (where m.tipo = 'entrada'), 0)::numeric,
    coalesce(sum(m.cantidad) filter (where m.tipo = 'salida'), 0)::numeric,
    (count(*) filter (where m.tipo = 'entrada'))::integer,
    (count(*) filter (where m.tipo = 'salida'))::integer
  from periodos p
  left join mov m on m.periodo = p.periodo
  group by p.periodo
  order by p.periodo;
end;
$$;

-- ---------------------------------------------------------------------
-- Vistas para informes
-- ---------------------------------------------------------------------

-- Stock actual línea a línea con colección y contacto
create or replace view public.v_informe_stock
with (security_invoker = true)
as
select
  s.producto_id, s.sku, s.producto_nombre,
  p.coleccion_id, c.nombre as coleccion_nombre,
  ct.nombre as contacto_nombre,
  s.almacen_id, s.almacen_nombre, s.hueco_id, s.codigo_completo,
  s.lote_codigo, s.fecha_caducidad,
  s.cantidad, p.stock_minimo, s.actualizado_en
from public.v_stock s
join public.productos   p on p.id = s.producto_id
join public.colecciones c on c.id = p.coleccion_id
left join public.contactos ct on ct.id = p.contacto_id;

-- Movimientos con la colección del producto
create or replace view public.v_informe_movimientos
with (security_invoker = true)
as
select m.*, p.coleccion_id, c.nombre as coleccion_nombre
from public.v_movimientos m
join public.productos   p on p.id = m.producto_id
join public.colecciones c on c.id = p.coleccion_id;

-- Ocupación de cada hueco con su ruta
create or replace view public.v_informe_ubicaciones
with (security_invoker = true)
as
select
  h.id, h.codigo_completo, h.almacen_id, h.almacen_codigo, h.almacen_nombre,
  h.pasillo_codigo, h.estanteria_codigo, h.nivel_codigo, h.codigo as hueco_codigo,
  h.capacidad, h.activo,
  o.unidades, o.referencias,
  case when h.capacidad is not null then round(o.unidades * 100.0 / h.capacidad, 1) end as porcentaje
from public.v_huecos h
join public.v_ocupacion_huecos o on o.hueco_id = h.id;

revoke all on public.v_informe_stock, public.v_informe_movimientos, public.v_informe_ubicaciones from anon;
grant select on public.v_informe_stock, public.v_informe_movimientos, public.v_informe_ubicaciones to authenticated;

-- ---------------------------------------------------------------------
-- Actividad por usuario en un periodo
-- ---------------------------------------------------------------------
create or replace function public.informe_por_usuario(p_desde date, p_hasta date, p_zona text default 'Europe/Madrid')
returns table (
  usuario_id uuid, usuario_nombre text, email text, activo boolean,
  entradas integer, unidades_entrada numeric, salidas integer, unidades_salida numeric,
  traslados integer, unidades_traslado numeric, ajustes integer, total integer, ultimo_movimiento timestamptz)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_zona text := public._zona_valida(p_zona);
begin
  if not public.tiene_permiso('informes') then
    raise exception 'No tienes permiso para ver informes' using errcode = '42501';
  end if;
  return query
  select
    u.id, u.nombre_completo, u.email, u.activo,
    (count(m.id) filter (where m.tipo = 'entrada'))::integer,
    coalesce(sum(m.cantidad) filter (where m.tipo = 'entrada'), 0)::numeric,
    (count(m.id) filter (where m.tipo = 'salida'))::integer,
    coalesce(sum(m.cantidad) filter (where m.tipo = 'salida'), 0)::numeric,
    (count(m.id) filter (where m.tipo = 'traslado'))::integer,
    coalesce(sum(m.cantidad) filter (where m.tipo = 'traslado'), 0)::numeric,
    (count(m.id) filter (where m.tipo = 'ajuste'))::integer,
    count(m.id)::integer,
    max(m.fecha)
  from public.perfiles u
  left join public.movimientos m
    on m.usuario_id = u.id
   and m.fecha >= (p_desde::timestamp at time zone v_zona)
   and m.fecha <  ((p_hasta + 1)::timestamp at time zone v_zona)
  group by u.id
  having count(m.id) > 0 or u.activo
  order by count(m.id) desc, u.nombre_completo;
end;
$$;

-- ---------------------------------------------------------------------
-- Resumen por colección: stock actual y flujo del periodo
-- ---------------------------------------------------------------------
create or replace function public.informe_por_coleccion(p_desde date, p_hasta date, p_zona text default 'Europe/Madrid')
returns table (
  coleccion_id uuid, coleccion_nombre text, activa boolean, referencias integer, referencias_stock_bajo integer,
  stock_actual numeric, unidades_entrada numeric, unidades_salida numeric, movimientos integer)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_zona text := public._zona_valida(p_zona);
begin
  if not public.tiene_permiso('informes') then
    raise exception 'No tienes permiso para ver informes' using errcode = '42501';
  end if;
  return query
  select
    c.id, c.nombre, c.activa,
    coalesce(pr.referencias, 0)::integer,
    coalesce(pr.bajo, 0)::integer,
    coalesce(pr.stock, 0)::numeric,
    coalesce(mv.entrada, 0)::numeric,
    coalesce(mv.salida, 0)::numeric,
    coalesce(mv.total, 0)::integer
  from public.colecciones c
  left join lateral (
    select count(*) filter (where vp.activo) as referencias,
           count(*) filter (where vp.activo and vp.stock_bajo) as bajo,
           sum(vp.stock_total) as stock
    from public.v_productos vp where vp.coleccion_id = c.id
  ) pr on true
  left join lateral (
    select sum(m.cantidad) filter (where m.tipo = 'entrada') as entrada,
           sum(m.cantidad) filter (where m.tipo = 'salida')  as salida,
           count(*) as total
    from public.movimientos m
    join public.productos p on p.id = m.producto_id
    where p.coleccion_id = c.id
      and m.fecha >= (p_desde::timestamp at time zone v_zona)
      and m.fecha <  ((p_hasta + 1)::timestamp at time zone v_zona)
  ) mv on true
  order by c.nombre;
end;
$$;

revoke execute on function public._zona_valida(text)                          from public, anon;
revoke execute on function public.panel_indicadores(text)                     from public, anon;
revoke execute on function public.serie_movimientos(date, date, text, text)   from public, anon;
revoke execute on function public.informe_por_usuario(date, date, text)       from public, anon;
revoke execute on function public.informe_por_coleccion(date, date, text)     from public, anon;
grant  execute on function public._zona_valida(text)                          to authenticated;
grant  execute on function public.panel_indicadores(text)                     to authenticated;
grant  execute on function public.serie_movimientos(date, date, text, text)   to authenticated;
grant  execute on function public.informe_por_usuario(date, date, text)       to authenticated;
grant  execute on function public.informe_por_coleccion(date, date, text)     to authenticated;

-- ---------------------------------------------------------------------
-- Registro de la migración aplicada (select * from public.sga_migraciones;)
-- ---------------------------------------------------------------------
insert into public.sga_migraciones (numero, nombre) values (7, '007_panel_informes.sql')
on conflict (numero) do update set nombre = excluded.nombre, aplicada_en = now();
