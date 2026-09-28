-- =====================================================================
-- SGA · Migración 005 · Salidas, traslados y ajustes
-- Todas las funciones escriben en "movimientos"; el trigger
-- aplicar_movimiento() (migración 004) actualiza el stock y rechaza
-- cualquier operación que deje una ubicación en negativo.
-- =====================================================================

-- Motivos admitidos (la interfaz muestra el texto en español)
-- Se puede ejecutar más de una vez: si ya se aplicó, no duplica nada ni da error.

-- Requisito: la migración anterior tiene que estar aplicada
do $requisito$
begin
  if to_regclass('public.movimientos') is null then
    raise exception 'Falta la migración anterior: ejecuta primero 004_movimientos_stock.sql y después esta.';
  end if;
end;
$requisito$;

alter table public.movimientos drop constraint if exists movimientos_motivo_valido;
alter table public.movimientos add constraint movimientos_motivo_valido check (
  motivo is null
  or (tipo = 'salida' and motivo in ('envio', 'devolucion', 'merma', 'uso_interno', 'otro'))
  or (tipo = 'ajuste' and motivo in ('recuento', 'rotura', 'error_registro', 'otro'))
);

-- Stock disponible de un producto/lote en un hueco, bloqueando la fila hasta el final de la operación
create or replace function public._stock_bloqueado(p_producto_id uuid, p_hueco_id uuid, p_lote_id uuid)
returns numeric
language sql
security definer
set search_path = ''
as $$
  select coalesce((
    select s.cantidad from public.stock_por_ubicacion s
    where s.producto_id = p_producto_id and s.hueco_id = p_hueco_id and s.lote_id is not distinct from p_lote_id
    for update
  ), 0)
$$;

create or replace function public._codigo_hueco(p_hueco_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select codigo_completo from public.v_huecos where id = p_hueco_id
$$;

revoke execute on function public._stock_bloqueado(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public._codigo_hueco(uuid)                from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Salida
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
begin
  perform public._exigir_permiso('registrar_movimientos');

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero';
  end if;
  if p_motivo is null or p_motivo not in ('envio', 'devolucion', 'merma', 'uso_interno', 'otro') then
    raise exception 'Indica el motivo de la salida';
  end if;
  if p_motivo = 'otro' and nullif(trim(p_notas), '') is null then
    raise exception 'Si el motivo es «otro», explica en las notas qué ha pasado';
  end if;

  v_disponible := public._stock_bloqueado(p_producto_id, p_hueco_id, p_lote_id);
  if v_disponible < p_cantidad then
    raise exception 'En % solo hay % unidades de este producto%', public._codigo_hueco(p_hueco_id), trim_scale(v_disponible),
      case when p_lote_id is not null then ' y lote' else '' end
      using hint = 'stock_insuficiente';
  end if;

  insert into public.movimientos (tipo, producto_id, lote_id, hueco_origen_id, cantidad, motivo, destino_externo, documento, notas, usuario_id)
  values ('salida', p_producto_id, p_lote_id, p_hueco_id, p_cantidad, p_motivo,
          nullif(trim(p_destino_externo), ''), nullif(trim(p_documento), ''), nullif(trim(p_notas), ''), auth.uid())
  returning id into v_mov;

  return jsonb_build_object('movimiento_id', v_mov, 'restante', v_disponible - p_cantidad);
end;
$$;

-- ---------------------------------------------------------------------
-- Traslado entre huecos (se puede sacar de un hueco bloqueado, no meter)
-- ---------------------------------------------------------------------
create or replace function public.registrar_traslado(
  p_producto_id      uuid,
  p_hueco_origen_id  uuid,
  p_hueco_destino_id uuid,
  p_cantidad         numeric,
  p_lote_id          uuid default null,
  p_notas            text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_disponible numeric;
  v_libre numeric;
  v_mov bigint;
begin
  perform public._exigir_permiso('registrar_movimientos');

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero';
  end if;
  if p_hueco_origen_id = p_hueco_destino_id then
    raise exception 'El hueco de destino debe ser distinto del de origen';
  end if;

  -- Bloqueo en orden fijo (por id) para que dos traslados cruzados no se esperen mutuamente
  perform 1 from public.huecos where id in (p_hueco_origen_id, p_hueco_destino_id) order by id for update;

  v_disponible := public._stock_bloqueado(p_producto_id, p_hueco_origen_id, p_lote_id);
  if v_disponible < p_cantidad then
    raise exception 'En % solo hay % unidades de este producto', public._codigo_hueco(p_hueco_origen_id), trim_scale(v_disponible)
      using hint = 'stock_insuficiente';
  end if;

  v_libre := public._reservar_hueco_destino(p_hueco_destino_id, p_cantidad);

  insert into public.movimientos (tipo, producto_id, lote_id, hueco_origen_id, hueco_destino_id, cantidad, notas, usuario_id)
  values ('traslado', p_producto_id, p_lote_id, p_hueco_origen_id, p_hueco_destino_id, p_cantidad, nullif(trim(p_notas), ''), auth.uid())
  returning id into v_mov;

  return jsonb_build_object('movimiento_id', v_mov, 'restante_origen', v_disponible - p_cantidad, 'espacio_libre_destino', v_libre);
end;
$$;

-- ---------------------------------------------------------------------
-- Ajuste de inventario: se indica la cantidad REAL contada y se registra
-- la diferencia. No comprueba capacidad ni bloqueo: refleja lo que hay.
-- ---------------------------------------------------------------------
create or replace function public.registrar_ajuste(
  p_producto_id   uuid,
  p_hueco_id      uuid,
  p_cantidad_real numeric,
  p_motivo        text,
  p_notas         text,
  p_lote_id       uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actual numeric;
  v_diferencia numeric;
  v_mov bigint;
begin
  perform public._exigir_permiso('ajustes');

  if p_cantidad_real is null or p_cantidad_real < 0 then
    raise exception 'La cantidad real no puede ser negativa';
  end if;
  if p_motivo is null or p_motivo not in ('recuento', 'rotura', 'error_registro', 'otro') then
    raise exception 'Indica el motivo del ajuste';
  end if;
  if nullif(trim(p_notas), '') is null then
    raise exception 'Explica en las notas el motivo del ajuste: queda en el historial';
  end if;
  if not exists (select 1 from public.huecos where id = p_hueco_id) then
    raise exception 'La ubicación indicada no existe';
  end if;
  if p_lote_id is not null and not exists (select 1 from public.lotes where id = p_lote_id and producto_id = p_producto_id) then
    raise exception 'El lote no corresponde a este producto';
  end if;

  perform 1 from public.huecos where id = p_hueco_id for update;
  v_actual := public._stock_bloqueado(p_producto_id, p_hueco_id, p_lote_id);
  v_diferencia := p_cantidad_real - v_actual;

  if v_diferencia = 0 then
    raise exception 'La cantidad real coincide con la registrada (%): no hay nada que ajustar', trim_scale(v_actual);
  end if;

  insert into public.movimientos (tipo, producto_id, lote_id, hueco_origen_id, hueco_destino_id, cantidad, motivo, notas, usuario_id)
  values ('ajuste', p_producto_id, p_lote_id,
          case when v_diferencia < 0 then p_hueco_id end,
          case when v_diferencia > 0 then p_hueco_id end,
          abs(v_diferencia), p_motivo, trim(p_notas), auth.uid())
  returning id into v_mov;

  return jsonb_build_object('movimiento_id', v_mov, 'anterior', v_actual, 'diferencia', v_diferencia);
end;
$$;

revoke execute on function public.registrar_salida(uuid, uuid, numeric, text, uuid, text, text, text)  from public, anon;
revoke execute on function public.registrar_traslado(uuid, uuid, uuid, numeric, uuid, text)            from public, anon;
revoke execute on function public.registrar_ajuste(uuid, uuid, numeric, text, text, uuid)              from public, anon;
grant  execute on function public.registrar_salida(uuid, uuid, numeric, text, uuid, text, text, text)  to authenticated;
grant  execute on function public.registrar_traslado(uuid, uuid, uuid, numeric, uuid, text)            to authenticated;
grant  execute on function public.registrar_ajuste(uuid, uuid, numeric, text, text, uuid)              to authenticated;

-- ---------------------------------------------------------------------
-- Registro de la migración aplicada (select * from public.sga_migraciones;)
-- ---------------------------------------------------------------------
insert into public.sga_migraciones (numero, nombre) values (5, '005_salidas_traslados.sql')
on conflict (numero) do update set nombre = excluded.nombre, aplicada_en = now();
