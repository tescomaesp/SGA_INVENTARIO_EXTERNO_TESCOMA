-- =====================================================================
-- SGA · Migración 011 · Préstamos para eventos, devoluciones y carga inicial
--
-- El almacén presta la mercancía para eventos: todo lo que sale debe volver.
--   · Salidas: motivo nuevo «prestamo» (Préstamo para evento). El evento o
--     destino es obligatorio en toda salida que no sea merma.
--   · Pendiente de devolver (por producto y evento) =
--       todas las salidas salvo merma − devoluciones registradas.
--   · Devolución = entrada con motivo «devolucion_prestamo» y el evento del
--     que vuelve; no puede superar lo pendiente de ese evento.
--   · Carga inicial: alta de productos con sus cantidades de partida
--     (uno a uno o importando una hoja de cálculo). Entrada con motivo
--     «carga_inicial», sin persona de contacto.
-- =====================================================================
-- Se puede ejecutar más de una vez: si ya se aplicó, no duplica nada ni da error.

do $requisito$
begin
  if to_regprocedure('public.eliminar_elementos(jsonb,text)') is null then
    raise exception 'Falta una migración anterior: ejecuta primero hasta la 010 y después esta.';
  end if;
end;
$requisito$;

-- ---------------------------------------------------------------------
-- 1. Motivos admitidos
-- ---------------------------------------------------------------------
alter table public.movimientos drop constraint if exists movimientos_motivo_valido;
alter table public.movimientos add constraint movimientos_motivo_valido check (
  motivo is null
  or (tipo = 'salida'  and motivo in ('prestamo', 'envio', 'devolucion', 'merma', 'uso_interno', 'otro'))
  or (tipo = 'ajuste'  and motivo in ('recuento', 'rotura', 'error_registro', 'otro', 'eliminacion'))
  or (tipo = 'entrada' and motivo in ('devolucion_prestamo', 'carga_inicial'))
);

-- Para calcular lo pendiente de cada producto y evento sin recorrer todo el historial
create index if not exists movimientos_prestamos_idx
  on public.movimientos (producto_id, lower(coalesce(destino_externo, '')))
  where tipo = 'salida' or (tipo = 'entrada' and motivo = 'devolucion_prestamo');

-- Nombre de evento normalizado: sin espacios sobrantes
create or replace function public._normalizar_evento(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g'), '')
$$;

-- ---------------------------------------------------------------------
-- 2. Salidas: «Préstamo para evento» y evento obligatorio salvo en merma
-- ---------------------------------------------------------------------
create or replace function public.registrar_salida(
  p_producto_id     uuid,
  p_hueco_id        uuid,
  p_cantidad        numeric,
  p_motivo          text,
  p_lote_id         uuid default null,
  p_destino_externo text default null,
  p_documento       text default null,
  p_notas           text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_disponible numeric;
  v_mov bigint;
  v_evento text := public._normalizar_evento(p_destino_externo);
begin
  perform public._exigir_permiso('registrar_movimientos');

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero';
  end if;
  if p_motivo is null or p_motivo not in ('prestamo', 'envio', 'devolucion', 'merma', 'uso_interno', 'otro') then
    raise exception 'Indica el motivo de la salida';
  end if;
  if p_motivo = 'otro' and nullif(trim(p_notas), '') is null then
    raise exception 'Si el motivo es «otro», explica en las notas qué ha pasado';
  end if;
  if p_motivo <> 'merma' and v_evento is null then
    raise exception 'Indica el evento o destino: todo lo que sale tiene que volver y así se sabe dónde está';
  end if;

  v_disponible := public._stock_bloqueado(p_producto_id, p_hueco_id, p_lote_id);
  if v_disponible < p_cantidad then
    raise exception 'En % solo hay % unidades de este producto%', public._codigo_hueco(p_hueco_id), trim_scale(v_disponible),
      case when p_lote_id is not null then ' y lote' else '' end
      using hint = 'stock_insuficiente';
  end if;

  insert into public.movimientos (tipo, producto_id, lote_id, hueco_origen_id, cantidad, motivo, destino_externo, documento, notas, usuario_id)
  values ('salida', p_producto_id, p_lote_id, p_hueco_id, p_cantidad, p_motivo,
          v_evento, nullif(trim(p_documento), ''), nullif(trim(p_notas), ''), auth.uid())
  returning id into v_mov;

  return jsonb_build_object('movimiento_id', v_mov, 'restante', v_disponible - p_cantidad);
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Lo que está fuera pendiente de volver, por producto y evento
--    (las salidas antiguas sin destino aparecen como «Sin evento indicado»)
-- ---------------------------------------------------------------------
create or replace view public.v_prestamos_pendientes
with (security_invoker = true)
as
select
  p.id as producto_id, p.sku, p.nombre, p.foto_url,
  t.evento, t.clave_evento, t.salido, t.devuelto, t.salido - t.devuelto as pendiente,
  t.primera_salida, t.ultima_salida, t.ultima_devolucion,
  (select m.hueco_origen_id from public.movimientos m
    where m.producto_id = p.id and m.tipo = 'salida' and coalesce(m.motivo, '') <> 'merma'
      and lower(coalesce(m.destino_externo, '')) = t.clave_evento
    order by m.fecha desc, m.id desc limit 1) as hueco_ultima_salida
from (
  select
    m.producto_id,
    lower(coalesce(m.destino_externo, ''))                                    as clave_evento,
    coalesce((array_agg(m.destino_externo order by m.fecha, m.id) filter (where m.tipo = 'salida'))[1], '') as evento,
    coalesce(sum(m.cantidad) filter (where m.tipo = 'salida'), 0)::numeric    as salido,
    coalesce(sum(m.cantidad) filter (where m.tipo = 'entrada'), 0)::numeric   as devuelto,
    min(m.fecha) filter (where m.tipo = 'salida')                              as primera_salida,
    max(m.fecha) filter (where m.tipo = 'salida')                              as ultima_salida,
    max(m.fecha) filter (where m.tipo = 'entrada')                             as ultima_devolucion
  from public.movimientos m
  where (m.tipo = 'salida' and coalesce(m.motivo, '') <> 'merma')
     or (m.tipo = 'entrada' and m.motivo = 'devolucion_prestamo')
  group by m.producto_id, lower(coalesce(m.destino_externo, ''))
) t
join public.productos p on p.id = t.producto_id
where t.salido - t.devuelto > 0;

revoke all on public.v_prestamos_pendientes from anon;
grant select on public.v_prestamos_pendientes to authenticated;

-- ---------------------------------------------------------------------
-- 4. Registrar una devolución de préstamo
-- ---------------------------------------------------------------------
create or replace function public.registrar_devolucion(
  p_producto_id uuid,
  p_evento      text,
  p_cantidad    numeric,
  p_hueco_id    uuid,
  p_contacto_id uuid default null,
  p_notas       text default null,
  p_lote        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clave     text := lower(coalesce(public._normalizar_evento(p_evento), ''));
  v_evento    text;
  v_pendiente numeric;
  v_lote      uuid;
  v_mov       bigint;
  v_libre     numeric;
begin
  perform public._exigir_permiso('registrar_movimientos');

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero';
  end if;
  if not exists (select 1 from public.productos where id = p_producto_id and eliminado_en is null) then
    raise exception 'El producto no existe o ha sido eliminado';
  end if;
  if p_contacto_id is not null and not exists (select 1 from public.contactos where id = p_contacto_id and eliminado_en is null) then
    raise exception 'La persona de contacto no existe';
  end if;

  -- Dos devoluciones simultáneas del mismo producto no pueden saldar dos veces lo mismo
  perform pg_advisory_xact_lock(hashtextextended('devolucion:' || p_producto_id::text, 0));

  select
    coalesce(sum(cantidad) filter (where tipo = 'salida'), 0) - coalesce(sum(cantidad) filter (where tipo = 'entrada'), 0),
    (array_agg(destino_externo order by fecha, id) filter (where tipo = 'salida'))[1]
  into v_pendiente, v_evento
  from public.movimientos
  where producto_id = p_producto_id
    and lower(coalesce(destino_externo, '')) = v_clave
    and ((tipo = 'salida' and coalesce(motivo, '') <> 'merma') or (tipo = 'entrada' and motivo = 'devolucion_prestamo'));

  if coalesce(v_pendiente, 0) <= 0 then
    raise exception 'Este producto no tiene nada pendiente de devolver de ese evento';
  end if;
  if p_cantidad > v_pendiente then
    raise exception 'De ese evento solo quedan % unidades pendientes de devolver', trim_scale(v_pendiente);
  end if;

  v_libre := public._reservar_hueco_destino(p_hueco_id, p_cantidad);
  if nullif(trim(p_lote), '') is not null then
    v_lote := public._obtener_lote(p_producto_id, p_lote, null);
  end if;

  insert into public.movimientos (tipo, producto_id, lote_id, hueco_destino_id, cantidad, motivo, destino_externo, contacto_id, notas, usuario_id)
  values ('entrada', p_producto_id, v_lote, p_hueco_id, p_cantidad, 'devolucion_prestamo',
          nullif(v_evento, ''), p_contacto_id, nullif(trim(p_notas), ''), auth.uid())
  returning id into v_mov;

  return jsonb_build_object('movimiento_id', v_mov, 'pendiente', v_pendiente - p_cantidad, 'espacio_libre', v_libre);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Alta de un producto con sus cantidades de partida
--    p_ubicaciones: [{"hueco_id": "<uuid>", "cantidad": 10, "lote": "opcional"}, …]
-- ---------------------------------------------------------------------
create or replace function public.alta_producto(
  p_nombre        text,
  p_coleccion_id  uuid,
  p_foto_url      text default null,
  p_contacto_id   uuid default null,
  p_stock_minimo  numeric default 0,
  p_notas         text default null,
  p_ubicaciones   jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_producto public.productos;
  u          jsonb;
  v_hueco    uuid;
  v_cantidad numeric;
  v_lote     uuid;
  v_total    numeric := 0;
begin
  perform public._exigir_permiso('editar_productos');

  if nullif(trim(p_nombre), '') is null then
    raise exception 'Indica el nombre del producto';
  end if;
  if p_coleccion_id is null or not exists (select 1 from public.colecciones where id = p_coleccion_id and activa and eliminado_en is null) then
    raise exception 'Elige una colección válida';
  end if;
  if p_contacto_id is not null and not exists (select 1 from public.contactos where id = p_contacto_id and eliminado_en is null) then
    raise exception 'La persona de contacto no existe';
  end if;
  if p_foto_url is not null and split_part(p_foto_url, '/', 1) <> auth.uid()::text then
    raise exception 'La foto no es válida';
  end if;
  if coalesce(p_stock_minimo, 0) < 0 then
    raise exception 'El stock mínimo no puede ser negativo';
  end if;
  if jsonb_typeof(coalesce(p_ubicaciones, '[]'::jsonb)) <> 'array' then
    raise exception 'Las ubicaciones no son válidas';
  end if;

  insert into public.productos (nombre, foto_url, coleccion_id, contacto_id, stock_minimo, notas, creado_por)
  values (regexp_replace(trim(p_nombre), '\s+', ' ', 'g'), p_foto_url, p_coleccion_id, p_contacto_id,
          coalesce(p_stock_minimo, 0), nullif(trim(p_notas), ''), auth.uid())
  returning * into v_producto;

  for u in select * from jsonb_array_elements(coalesce(p_ubicaciones, '[]'::jsonb)) loop
    v_hueco := (u ->> 'hueco_id')::uuid;
    v_cantidad := (u ->> 'cantidad')::numeric;
    if v_hueco is null or v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cada ubicación necesita un hueco y una cantidad mayor que cero';
    end if;
    perform public._reservar_hueco_destino(v_hueco, v_cantidad);
    v_lote := case when nullif(trim(u ->> 'lote'), '') is not null then public._obtener_lote(v_producto.id, u ->> 'lote', null) end;
    insert into public.movimientos (tipo, producto_id, lote_id, hueco_destino_id, cantidad, motivo, notas, usuario_id)
    values ('entrada', v_producto.id, v_lote, v_hueco, v_cantidad, 'carga_inicial', 'Carga inicial del producto', auth.uid());
    v_total := v_total + v_cantidad;
  end loop;

  return jsonb_build_object('producto_id', v_producto.id, 'sku', v_producto.sku, 'unidades', v_total);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Carga masiva desde una hoja de cálculo
--    p_filas: [{"fila": 2, "nombre": "…", "coleccion": "…", "ubicacion": "ALM1-P01-E01-N1-H01",
--               "cantidad": 10, "stock_minimo": 2, "notas": "…"}, …]
--    Las filas con el mismo nombre y colección son el mismo producto en varias ubicaciones.
--    Todo o nada: si hay algún error no se guarda nada y se devuelven todos los errores.
--    Con p_simular = true solo valida (no guarda nada aunque todo esté bien).
-- ---------------------------------------------------------------------
create or replace function public.cargar_productos(p_filas jsonb, p_simular boolean default true, p_crear_colecciones boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g           record;
  f           jsonb;
  v_col       uuid;
  v_prod      public.productos;
  v_hueco     uuid;
  v_cantidad  numeric;
  v_minimo    numeric;
  v_errores   jsonb := '[]'::jsonb;
  v_productos jsonb := '[]'::jsonb;
  v_cols_new  text[] := '{}';
  v_unidades  numeric := 0;
  v_codigo    text;
  v_fila      int;
begin
  perform public._exigir_permiso('editar_productos');
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'El archivo no tiene filas con productos';
  end if;
  if jsonb_array_length(p_filas) > 3000 then
    raise exception 'Como máximo 3.000 filas por importación: divide el archivo en varias partes';
  end if;

  begin
    for g in
      select lower(public._normalizar_evento(x ->> 'nombre')) as k_nombre,
             lower(public._normalizar_evento(x ->> 'coleccion')) as k_col,
             jsonb_agg(x order by (x ->> 'fila')::int) as filas
      from jsonb_array_elements(p_filas) x
      group by 1, 2
      order by min((x ->> 'fila')::int)
    loop
      f := g.filas -> 0;
      v_fila := (f ->> 'fila')::int;
      begin
        if g.k_nombre is null then
          raise exception 'Falta el nombre del producto';
        end if;
        if g.k_col is null then
          raise exception 'Falta la colección';
        end if;

        select id into v_col from public.colecciones where lower(trim(nombre)) = g.k_col and eliminado_en is null;
        if v_col is null then
          if not p_crear_colecciones then
            raise exception 'La colección «%» no existe', public._normalizar_evento(f ->> 'coleccion');
          end if;
          insert into public.colecciones (nombre) values (public._normalizar_evento(f ->> 'coleccion')) returning id into v_col;
          v_cols_new := v_cols_new || public._normalizar_evento(f ->> 'coleccion');
        end if;

        select * into v_prod from public.productos
        where lower(regexp_replace(trim(nombre), '\s+', ' ', 'g')) = g.k_nombre and coleccion_id = v_col and eliminado_en is null
        limit 1;
        if found then
          raise exception 'Ya existe en el catálogo (%): quita la fila o cambia el nombre', v_prod.sku;
        end if;

        begin
          select max(nullif(replace(trim(x ->> 'stock_minimo'), ',', '.'), '')::numeric) into v_minimo from jsonb_array_elements(g.filas) x;
        exception when others then
          raise exception 'El stock mínimo no es un número';
        end;
        insert into public.productos (nombre, coleccion_id, stock_minimo, notas, creado_por)
        values (public._normalizar_evento(f ->> 'nombre'), v_col, greatest(coalesce(v_minimo, 0), 0),
                (select nullif(trim(x ->> 'notas'), '') from jsonb_array_elements(g.filas) x where nullif(trim(x ->> 'notas'), '') is not null limit 1),
                auth.uid())
        returning * into v_prod;

        for f in select * from jsonb_array_elements(g.filas) loop
          v_fila := (f ->> 'fila')::int;
          v_codigo := upper(public._normalizar_evento(f ->> 'ubicacion'));
          begin
            v_cantidad := nullif(replace(trim(f ->> 'cantidad'), ',', '.'), '')::numeric;
          exception when others then
            raise exception 'La cantidad «%» no es un número', f ->> 'cantidad';
          end;
          if v_codigo is null and coalesce(v_cantidad, 0) = 0 then
            continue;   -- solo la ficha, sin stock en esta fila
          end if;
          if v_codigo is null then
            raise exception 'Indica la ubicación de las % unidades', trim_scale(v_cantidad);
          end if;
          if v_cantidad is null or v_cantidad <= 0 then
            raise exception 'La cantidad en % debe ser mayor que cero', v_codigo;
          end if;
          -- Solo huecos vigentes (un hueco eliminado puede compartir código con uno nuevo)
          select vh.id into v_hueco
          from public.v_huecos vh join public.huecos h on h.id = vh.id
          where vh.codigo_completo = v_codigo and h.eliminado_en is null;
          if v_hueco is null then
            raise exception 'La ubicación % no existe', v_codigo;
          end if;
          perform public._reservar_hueco_destino(v_hueco, v_cantidad);
          insert into public.movimientos (tipo, producto_id, hueco_destino_id, cantidad, motivo, notas, usuario_id)
          values ('entrada', v_prod.id, v_hueco, v_cantidad, 'carga_inicial', 'Carga inicial desde hoja de cálculo', auth.uid());
          v_unidades := v_unidades + v_cantidad;
        end loop;

        v_productos := v_productos || jsonb_build_object('sku', v_prod.sku, 'nombre', v_prod.nombre);
      exception when others then
        v_errores := v_errores || jsonb_build_object(
          'fila', v_fila,
          'producto', coalesce(public._normalizar_evento(g.filas -> 0 ->> 'nombre'), '(sin nombre)'),
          'mensaje', sqlerrm,
          'filas', (select jsonb_agg((x ->> 'fila')::int) from jsonb_array_elements(g.filas) x));
      end;
    end loop;

    if jsonb_array_length(v_errores) > 0 or p_simular then
      raise exception using errcode = 'P0001', message = '__deshacer_carga__';
    end if;
  exception when sqlstate 'P0001' then
    if sqlerrm <> '__deshacer_carga__' then
      raise;
    end if;
    -- se deshace todo lo hecho en el bloque; los totales calculados se devuelven igualmente
  end;

  return jsonb_build_object(
    'guardado', jsonb_array_length(v_errores) = 0 and not p_simular,
    'productos', jsonb_array_length(v_productos),
    'unidades', v_unidades,
    'colecciones_nuevas', to_jsonb(v_cols_new),
    'errores', v_errores,
    'creados', case when jsonb_array_length(v_errores) = 0 and not p_simular then v_productos else '[]'::jsonb end);
end;
$$;

revoke execute on function public._normalizar_evento(text) from public, anon;
grant execute on function public._normalizar_evento(text) to authenticated;
revoke execute on function public.registrar_salida(uuid, uuid, numeric, text, uuid, text, text, text) from public, anon;
grant execute on function public.registrar_salida(uuid, uuid, numeric, text, uuid, text, text, text) to authenticated;
revoke execute on function public.registrar_devolucion(uuid, text, numeric, uuid, uuid, text, text) from public, anon;
grant execute on function public.registrar_devolucion(uuid, text, numeric, uuid, uuid, text, text) to authenticated;
revoke execute on function public.alta_producto(text, uuid, text, uuid, numeric, text, jsonb) from public, anon;
grant execute on function public.alta_producto(text, uuid, text, uuid, numeric, text, jsonb) to authenticated;
revoke execute on function public.cargar_productos(jsonb, boolean, boolean) from public, anon;
grant execute on function public.cargar_productos(jsonb, boolean, boolean) to authenticated;

insert into public.sga_migraciones (numero, nombre) values (11, '011_prestamos_carga_inicial.sql')
on conflict (numero) do update set nombre = excluded.nombre, aplicada_en = now();
