-- =====================================================================
-- SGA · Migración 006 · Trazabilidad
-- Vistas de solo lectura sobre "movimientos": no cambian ningún dato.
-- =====================================================================

-- Índice para seguir un lote y para buscar por documento o destino
-- Se puede ejecutar más de una vez: si ya se aplicó, no duplica nada ni da error.

-- Requisito: la migración anterior tiene que estar aplicada
do $requisito$
begin
  if to_regprocedure('public.registrar_salida(uuid,uuid,numeric,text,uuid,text,text,text)') is null then
    raise exception 'Falta la migración anterior: ejecuta primero 005_salidas_traslados.sql y después esta.';
  end if;
end;
$requisito$;

create index if not exists movimientos_lote_fecha_idx on public.movimientos (lote_id, fecha, id) where lote_id is not null;
create index if not exists movimientos_documento_idx  on public.movimientos (lower(documento)) where documento is not null;
create index if not exists movimientos_prod_fecha_id_idx on public.movimientos (producto_id, fecha, id);

-- ---------------------------------------------------------------------
-- Movimientos con su efecto en el stock total y el saldo tras cada uno
--   variacion:      cuánto cambia el stock total del producto (un traslado no lo cambia)
--   saldo_producto: stock total del producto justo después del movimiento
--   saldo_lote:     stock del lote justo después del movimiento
-- Al filtrar por producto_id, PostgreSQL solo calcula el saldo de ese producto.
-- ---------------------------------------------------------------------
create or replace view public.v_trazabilidad
with (security_invoker = true)
as
with base as (
  select
    m.*,
    case m.tipo
      when 'entrada'  then m.cantidad
      when 'salida'   then -m.cantidad
      when 'traslado' then 0
      else case when m.hueco_destino_id is not null then m.cantidad else -m.cantidad end
    end as variacion
  from public.v_movimientos m
)
select
  b.*,
  sum(b.variacion) over (partition by b.producto_id order by b.fecha, b.id) as saldo_producto,
  case when b.lote_id is not null
    then sum(b.variacion) over (partition by b.producto_id, b.lote_id order by b.fecha, b.id)
  end as saldo_lote
from base b;

-- ---------------------------------------------------------------------
-- Resumen de cada lote: origen (primera entrada), cantidades y stock
-- ---------------------------------------------------------------------
create or replace view public.v_lotes
with (security_invoker = true)
as
select
  l.id, l.codigo, l.fecha_caducidad, l.creado_en,
  l.producto_id, p.sku, p.nombre as producto_nombre, p.foto_url,
  e.fecha        as primera_entrada,
  e.contacto_id,
  ct.nombre      as contacto_nombre,
  ct.empresa     as contacto_empresa,
  e.documento    as documento_entrada,
  coalesce(t.entrado, 0)::numeric      as entrado,
  coalesce(t.salido, 0)::numeric       as salido,
  coalesce(t.ajuste_neto, 0)::numeric  as ajuste_neto,
  coalesce(s.stock, 0)::numeric        as stock_actual,
  coalesce(s.ubicaciones, 0)::integer  as ubicaciones,
  coalesce(t.destinos, 0)::integer     as destinos,
  coalesce(t.movimientos, 0)::integer  as movimientos
from public.lotes l
join public.productos p on p.id = l.producto_id
left join lateral (
  select m.fecha, m.contacto_id, m.documento
  from public.movimientos m
  where m.lote_id = l.id and m.tipo = 'entrada'
  order by m.fecha, m.id
  limit 1
) e on true
left join public.contactos ct on ct.id = e.contacto_id
left join lateral (
  select
    sum(m.cantidad) filter (where m.tipo = 'entrada') as entrado,
    sum(m.cantidad) filter (where m.tipo = 'salida')  as salido,
    sum(case when m.hueco_destino_id is not null then m.cantidad else -m.cantidad end) filter (where m.tipo = 'ajuste') as ajuste_neto,
    count(distinct m.destino_externo) filter (where m.tipo = 'salida' and m.destino_externo is not null) as destinos,
    count(*) as movimientos
  from public.movimientos m
  where m.lote_id = l.id
) t on true
left join lateral (
  select sum(s.cantidad) as stock, count(*) as ubicaciones
  from public.stock_por_ubicacion s
  where s.lote_id = l.id
) s on true;

revoke all on public.v_trazabilidad, public.v_lotes from anon;
grant select on public.v_trazabilidad, public.v_lotes to authenticated;

-- ---------------------------------------------------------------------
-- Registro de la migración aplicada (select * from public.sga_migraciones;)
-- ---------------------------------------------------------------------
insert into public.sga_migraciones (numero, nombre) values (6, '006_trazabilidad.sql')
on conflict (numero) do update set nombre = excluded.nombre, aplicada_en = now();
