-- =====================================================================
-- SGA · Migración 008 · Filtro del catálogo por ubicación
-- Añade a v_productos la columna codigos_ubicacion (códigos de los huecos
-- donde hay stock de cada producto). La misma definición está ya en la 004,
-- así que da igual en qué orden se repitan.
-- =====================================================================
-- Se puede ejecutar más de una vez: si ya se aplicó, no duplica nada ni da error.

-- Requisito: la migración anterior tiene que estar aplicada
do $requisito$
begin
  if to_regprocedure('public.panel_indicadores(text)') is null then
    raise exception 'Falta la migración anterior: ejecuta primero 007_panel_informes.sql y después esta.';
  end if;
end;
$requisito$;

create or replace view public.v_productos
with (security_invoker = true)
as
select
  p.id, p.sku, p.nombre, p.foto_url, p.stock_minimo, p.notas, p.activo, p.creado_en,
  p.coleccion_id, c.nombre  as coleccion_nombre,
  p.contacto_id,  ct.nombre as contacto_nombre,
  coalesce(st.unidades, 0)::numeric      as stock_total,
  coalesce(st.ubicaciones, 0)::integer   as ubicaciones,
  (p.stock_minimo > 0 and coalesce(st.unidades, 0) < p.stock_minimo) as stock_bajo,
  coalesce(st.codigos, '')               as codigos_ubicacion   -- para filtrar el catálogo por ubicación
from public.productos p
join public.colecciones c on c.id = p.coleccion_id
left join public.contactos ct on ct.id = p.contacto_id
left join lateral (
  select sum(s.cantidad) as unidades, count(distinct s.hueco_id) as ubicaciones,
         string_agg(distinct h.codigo_completo, ' ') as codigos
  from public.stock_por_ubicacion s
  join public.v_huecos h on h.id = s.hueco_id
  where s.producto_id = p.id
) st on true;

revoke all on public.v_productos from anon;
grant select on public.v_productos to authenticated, service_role;

insert into public.sga_migraciones (numero, nombre) values (8, '008_mejoras.sql')
on conflict (numero) do update set nombre = excluded.nombre, aplicada_en = now();
