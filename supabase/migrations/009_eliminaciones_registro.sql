-- =====================================================================
-- SGA · Migración 009 · Eliminación de elementos y registro de modificaciones
--
-- · El administrador puede eliminar almacenes, pasillos, estanterías, niveles,
--   huecos, productos, colecciones y contactos, de uno en uno o en bloque.
-- · Eliminar = desaparece de toda la aplicación, pero el historial de
--   movimientos (inmutable) se conserva y sigue mostrando lo eliminado.
-- · Cada eliminación y cada edición queda en public.registro_modificaciones
--   con quién, cuándo y qué exactamente.
-- · Productos con stock: se retira con un ajuste (motivo «eliminacion»).
--   Ubicaciones con mercancía: no se eliminan hasta vaciarlas.
-- =====================================================================
-- Se puede ejecutar más de una vez: si ya se aplicó, no duplica nada ni da error.

-- Requisito: la migración anterior tiene que estar aplicada
do $requisito$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'v_productos' and column_name = 'codigos_ubicacion') then
    raise exception 'Falta la migración anterior: ejecuta primero 008_mejoras.sql y después esta.';
  end if;
end;
$requisito$;

-- ---------------------------------------------------------------------
-- 1. Marca de eliminado en cada tabla
-- ---------------------------------------------------------------------
alter table public.almacenes add column if not exists eliminado_en timestamptz;
alter table public.almacenes add column if not exists eliminado_por uuid references public.perfiles (id);
alter table public.pasillos add column if not exists eliminado_en timestamptz;
alter table public.pasillos add column if not exists eliminado_por uuid references public.perfiles (id);
alter table public.estanterias add column if not exists eliminado_en timestamptz;
alter table public.estanterias add column if not exists eliminado_por uuid references public.perfiles (id);
alter table public.niveles add column if not exists eliminado_en timestamptz;
alter table public.niveles add column if not exists eliminado_por uuid references public.perfiles (id);
alter table public.huecos add column if not exists eliminado_en timestamptz;
alter table public.huecos add column if not exists eliminado_por uuid references public.perfiles (id);
alter table public.productos add column if not exists eliminado_en timestamptz;
alter table public.productos add column if not exists eliminado_por uuid references public.perfiles (id);
alter table public.colecciones add column if not exists eliminado_en timestamptz;
alter table public.colecciones add column if not exists eliminado_por uuid references public.perfiles (id);
alter table public.contactos add column if not exists eliminado_en timestamptz;
alter table public.contactos add column if not exists eliminado_por uuid references public.perfiles (id);

-- Los códigos y nombres solo tienen que ser únicos entre lo NO eliminado
-- (así se puede volver a crear un P01 después de eliminar el anterior)
alter table public.almacenes   drop constraint if exists almacenes_codigo_key;
alter table public.pasillos    drop constraint if exists pasillos_almacen_id_codigo_key;
alter table public.estanterias drop constraint if exists estanterias_pasillo_id_codigo_key;
alter table public.niveles     drop constraint if exists niveles_estanteria_id_codigo_key;
alter table public.niveles     drop constraint if exists niveles_estanteria_id_orden_key;
alter table public.huecos      drop constraint if exists huecos_nivel_id_codigo_key;
create unique index if not exists almacenes_codigo_activo   on public.almacenes (codigo) where eliminado_en is null;
create unique index if not exists pasillos_codigo_activo    on public.pasillos (almacen_id, codigo) where eliminado_en is null;
create unique index if not exists estanterias_codigo_activo on public.estanterias (pasillo_id, codigo) where eliminado_en is null;
create unique index if not exists niveles_codigo_activo     on public.niveles (estanteria_id, codigo) where eliminado_en is null;
create unique index if not exists niveles_orden_activo      on public.niveles (estanteria_id, orden) where eliminado_en is null;
create unique index if not exists huecos_codigo_activo      on public.huecos (nivel_id, codigo) where eliminado_en is null;
-- Mismo nombre que el índice de la 003, para que repetir aquella no lo vuelva a crear completo
do $indice$
begin
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'colecciones_nombre_unico' and indexdef not like '%eliminado_en%') then
    drop index public.colecciones_nombre_unico;
  end if;
end;
$indice$;
create unique index if not exists colecciones_nombre_unico on public.colecciones (lower(trim(nombre))) where eliminado_en is null;

-- ---------------------------------------------------------------------
-- 2. Lo eliminado deja de verse en toda la aplicación (lectura filtrada)
--    y solo se elimina a través de eliminar_elementos()
-- ---------------------------------------------------------------------
drop policy if exists almacenes_lectura on public.almacenes;
create policy almacenes_lectura on public.almacenes for select to authenticated using (public.tiene_permiso('ver_stock') and eliminado_en is null);
drop policy if exists pasillos_lectura on public.pasillos;
create policy pasillos_lectura on public.pasillos for select to authenticated using (public.tiene_permiso('ver_stock') and eliminado_en is null);
drop policy if exists estanterias_lectura on public.estanterias;
create policy estanterias_lectura on public.estanterias for select to authenticated using (public.tiene_permiso('ver_stock') and eliminado_en is null);
drop policy if exists niveles_lectura on public.niveles;
create policy niveles_lectura on public.niveles for select to authenticated using (public.tiene_permiso('ver_stock') and eliminado_en is null);
drop policy if exists huecos_lectura on public.huecos;
create policy huecos_lectura on public.huecos for select to authenticated using (public.tiene_permiso('ver_stock') and eliminado_en is null);
drop policy if exists productos_lectura on public.productos;
create policy productos_lectura on public.productos for select to authenticated using (public.tiene_permiso('ver_stock') and eliminado_en is null);
drop policy if exists colecciones_lectura on public.colecciones;
create policy colecciones_lectura on public.colecciones for select to authenticated using (public.tiene_permiso('ver_stock') and eliminado_en is null);
drop policy if exists contactos_lectura on public.contactos;
create policy contactos_lectura on public.contactos for select to authenticated using (public.tiene_permiso('ver_stock') and eliminado_en is null);
revoke delete on public.almacenes, public.pasillos, public.estanterias, public.niveles, public.huecos, public.productos, public.colecciones, public.contactos from authenticated;

-- Motivo de ajuste nuevo: el stock que se retira al eliminar un producto
alter table public.movimientos drop constraint if exists movimientos_motivo_valido;
alter table public.movimientos add constraint movimientos_motivo_valido check (
  motivo is null
  or (tipo = 'salida' and motivo in ('envio', 'devolucion', 'merma', 'uso_interno', 'otro'))
  or (tipo = 'ajuste' and motivo in ('recuento', 'rotura', 'error_registro', 'otro', 'eliminacion'))
);

-- ---------------------------------------------------------------------
-- 3. Registro de modificaciones (inmutable, solo lo ven los administradores)
-- ---------------------------------------------------------------------
create table if not exists public.registro_modificaciones (
  id              bigint generated always as identity primary key,
  fecha           timestamptz not null default now(),
  usuario_id      uuid,
  usuario_nombre  text not null,
  accion          text not null check (accion in ('eliminacion', 'edicion')),
  entidad         text not null check (entidad in ('almacen', 'pasillo', 'estanteria', 'nivel', 'hueco', 'producto', 'coleccion', 'contacto')),
  entidad_id      uuid not null,
  descripcion     text not null,
  motivo          text check (char_length(motivo) <= 500),
  detalle         jsonb not null default '{}'::jsonb
);
create index if not exists registro_modificaciones_fecha_idx   on public.registro_modificaciones (fecha desc);
create index if not exists registro_modificaciones_usuario_idx on public.registro_modificaciones (usuario_id, fecha desc);
create index if not exists registro_modificaciones_entidad_idx on public.registro_modificaciones (entidad, entidad_id);

create or replace function public.registro_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'El registro de modificaciones no se puede cambiar ni borrar' using errcode = '42501';
end;
$$;

create or replace trigger registro_modificaciones_sin_cambios
  before update or delete on public.registro_modificaciones
  for each row execute function public.registro_inmutable();

alter table public.registro_modificaciones enable row level security;
drop policy if exists registro_modificaciones_lectura on public.registro_modificaciones;
create policy registro_modificaciones_lectura on public.registro_modificaciones
  for select to authenticated using (public.tiene_permiso('gestionar_usuarios'));
revoke all on public.registro_modificaciones from anon;
revoke insert, update, delete, truncate on public.registro_modificaciones from authenticated;
grant select on public.registro_modificaciones to authenticated;
grant all on public.registro_modificaciones to service_role;

-- Nombre legible de quien hace la operación
create or replace function public._nombre_usuario_actual()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select coalesce(nullif(nombre_completo, ''), email) from public.perfiles where id = auth.uid()), 'Sistema')
$$;

-- Descripción legible de un elemento (código completo, SKU y nombre…)
create or replace function public._describir(p_tabla text, p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r text;
begin
  case p_tabla
    when 'almacenes' then select a.codigo || ' (' || a.nombre || ')' into r from public.almacenes a where a.id = p_id;
    when 'pasillos' then select a.codigo || '-' || p.codigo into r from public.pasillos p join public.almacenes a on a.id = p.almacen_id where p.id = p_id;
    when 'estanterias' then select a.codigo || '-' || p.codigo || '-' || e.codigo into r from public.estanterias e join public.pasillos p on p.id = e.pasillo_id join public.almacenes a on a.id = p.almacen_id where e.id = p_id;
    when 'niveles' then select a.codigo || '-' || p.codigo || '-' || e.codigo || '-' || n.codigo into r from public.niveles n join public.estanterias e on e.id = n.estanteria_id join public.pasillos p on p.id = e.pasillo_id join public.almacenes a on a.id = p.almacen_id where n.id = p_id;
    when 'huecos' then select codigo_completo into r from public.v_huecos where id = p_id;
    when 'productos' then select sku || ' ' || nombre into r from public.productos where id = p_id;
    when 'colecciones' then select nombre into r from public.colecciones where id = p_id;
    when 'contactos' then select nombre || coalesce(' (' || empresa || ')', '') into r from public.contactos where id = p_id;
  end case;
  return coalesce(r, p_id::text);
end;
$$;

-- Ediciones: se guarda cada campo cambiado con su valor anterior y el nuevo
create or replace function public.registrar_edicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_viejo jsonb := to_jsonb(old);
  v_nuevo jsonb := to_jsonb(new);
  v_cambios jsonb := '{}'::jsonb;
  k text;
begin
  if old.eliminado_en is distinct from new.eliminado_en then
    return new;   -- las eliminaciones se registran en eliminar_elementos(), con más detalle
  end if;
  for k in select jsonb_object_keys(v_nuevo) loop
    continue when k in ('actualizado_en', 'creado_en', 'eliminado_en', 'eliminado_por');
    if v_viejo -> k is distinct from v_nuevo -> k then
      v_cambios := v_cambios || jsonb_build_object(k, jsonb_build_object('antes', v_viejo -> k, 'despues', v_nuevo -> k));
    end if;
  end loop;
  if v_cambios = '{}'::jsonb then
    return new;
  end if;
  insert into public.registro_modificaciones (usuario_id, usuario_nombre, accion, entidad, entidad_id, descripcion, detalle)
  values (auth.uid(), public._nombre_usuario_actual(), 'edicion',
          case tg_table_name when 'almacenes' then 'almacen' when 'pasillos' then 'pasillo' when 'estanterias' then 'estanteria'
            when 'niveles' then 'nivel' when 'huecos' then 'hueco' when 'productos' then 'producto' when 'colecciones' then 'coleccion' else 'contacto' end,
          new.id, public._describir(tg_table_name, new.id), jsonb_build_object('cambios', v_cambios));
  return new;
end;
$$;
create or replace trigger almacenes_registro_edicion after update on public.almacenes for each row execute function public.registrar_edicion();
create or replace trigger pasillos_registro_edicion after update on public.pasillos for each row execute function public.registrar_edicion();
create or replace trigger estanterias_registro_edicion after update on public.estanterias for each row execute function public.registrar_edicion();
create or replace trigger niveles_registro_edicion after update on public.niveles for each row execute function public.registrar_edicion();
create or replace trigger huecos_registro_edicion after update on public.huecos for each row execute function public.registrar_edicion();
create or replace trigger productos_registro_edicion after update on public.productos for each row execute function public.registrar_edicion();
create or replace trigger colecciones_registro_edicion after update on public.colecciones for each row execute function public.registrar_edicion();
create or replace trigger contactos_registro_edicion after update on public.contactos for each row execute function public.registrar_edicion();

revoke execute on function public._nombre_usuario_actual() from public, anon, authenticated;
revoke execute on function public._describir(text, uuid)   from public, anon, authenticated;
revoke execute on function public.registrar_edicion()      from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Eliminar elementos (uno o muchos a la vez). Solo administradores.
--    p_elementos: [{"tipo": "hueco|nivel|estanteria|pasillo|almacen|producto|coleccion|contacto", "id": "<uuid>"}, …]
--    Cada elemento se procesa por separado: si uno no se puede eliminar, los demás sí.
--    Devuelve {"eliminados": [...], "bloqueados": [{"descripcion", "motivo"}]}
-- ---------------------------------------------------------------------
create or replace function public.eliminar_elementos(p_elementos jsonb, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e            jsonb;
  v_tipo       text;
  v_id         uuid;
  v_tabla      text;
  v_desc       text;
  v_detalle    jsonb;
  v_huecos     uuid[];
  v_mercancia  text;
  v_n          integer;
  v_retirado   jsonb;
  s            record;
  v_ahora      timestamptz := now();
  v_yo         uuid := auth.uid();
  v_nombre     text := public._nombre_usuario_actual();
  v_motivo     text := nullif(trim(p_motivo), '');
  v_eliminados jsonb := '[]'::jsonb;
  v_bloqueados jsonb := '[]'::jsonb;
begin
  if not public.tiene_permiso('gestionar_usuarios') then
    raise exception 'Solo un administrador puede eliminar elementos' using errcode = '42501';
  end if;
  if p_elementos is null or jsonb_typeof(p_elementos) <> 'array' or jsonb_array_length(p_elementos) = 0 then
    raise exception 'No se ha indicado nada que eliminar';
  end if;
  if jsonb_array_length(p_elementos) > 500 then
    raise exception 'Como máximo se pueden eliminar 500 elementos de una vez';
  end if;

  for e in select * from jsonb_array_elements(p_elementos) loop
    v_tipo := e ->> 'tipo';
    v_desc := null;
    begin
      v_id := (e ->> 'id')::uuid;
      v_tabla := case v_tipo when 'almacen' then 'almacenes' when 'pasillo' then 'pasillos' when 'estanteria' then 'estanterias'
        when 'nivel' then 'niveles' when 'hueco' then 'huecos' when 'producto' then 'productos' when 'coleccion' then 'colecciones' when 'contacto' then 'contactos' end;
      if v_tabla is null then
        raise exception 'Tipo de elemento no válido: %', coalesce(v_tipo, '(vacío)');
      end if;
      execute format('select count(*) from public.%I where id = $1 and eliminado_en is null', v_tabla) into v_n using v_id;
      if v_n = 0 then
        raise exception 'No existe o ya estaba eliminado';
      end if;
      v_desc := public._describir(v_tabla, v_id);
      v_detalle := jsonb_build_object('tipo', v_tipo);

      -- ---------------- Ubicaciones: solo si están vacías; arrastran lo que contienen
      if v_tipo in ('almacen', 'pasillo', 'estanteria', 'nivel', 'hueco') then
        select coalesce(array_agg(h.id), '{}') into v_huecos
        from public.huecos h
        join public.niveles n on n.id = h.nivel_id
        join public.estanterias es on es.id = n.estanteria_id
        join public.pasillos pa on pa.id = es.pasillo_id
        where h.eliminado_en is null
          and case v_tipo when 'hueco' then h.id when 'nivel' then n.id when 'estanteria' then es.id when 'pasillo' then pa.id else pa.almacen_id end = v_id;

        perform 1 from public.huecos where id = any (v_huecos) for update;   -- nadie puede dejar mercancía mientras tanto
        select string_agg(format('%s uds de %s en %s', trim_scale(s2.cantidad), p2.nombre, h2.codigo_completo), '; ' order by h2.codigo_completo)
          into v_mercancia
        from (select * from public.stock_por_ubicacion where hueco_id = any (v_huecos) order by cantidad desc limit 3) s2
        join public.productos p2 on p2.id = s2.producto_id
        join public.v_huecos h2 on h2.id = s2.hueco_id;
        if v_mercancia is not null then
          select count(*) into v_n from public.stock_por_ubicacion where hueco_id = any (v_huecos);
          raise exception 'Tiene mercancía (%): vacíalo con una salida o un traslado antes de eliminarlo', v_mercancia || case when v_n > 3 then format(' y %s líneas más', v_n - 3) else '' end;
        end if;

        update public.huecos set eliminado_en = v_ahora, eliminado_por = v_yo where id = any (v_huecos);
        if v_tipo in ('almacen', 'pasillo', 'estanteria', 'nivel') then
          update public.niveles n set eliminado_en = v_ahora, eliminado_por = v_yo
          from public.estanterias es, public.pasillos pa
          where es.id = n.estanteria_id and pa.id = es.pasillo_id and n.eliminado_en is null
            and case v_tipo when 'nivel' then n.id when 'estanteria' then es.id when 'pasillo' then pa.id else pa.almacen_id end = v_id;
        end if;
        if v_tipo in ('almacen', 'pasillo', 'estanteria') then
          update public.estanterias es set eliminado_en = v_ahora, eliminado_por = v_yo
          from public.pasillos pa
          where pa.id = es.pasillo_id and es.eliminado_en is null
            and case v_tipo when 'estanteria' then es.id when 'pasillo' then pa.id else pa.almacen_id end = v_id;
        end if;
        if v_tipo in ('almacen', 'pasillo') then
          update public.pasillos set eliminado_en = v_ahora, eliminado_por = v_yo
          where eliminado_en is null and case v_tipo when 'pasillo' then id else almacen_id end = v_id;
        end if;
        if v_tipo = 'almacen' then
          update public.almacenes set eliminado_en = v_ahora, eliminado_por = v_yo where id = v_id;
        end if;
        v_detalle := v_detalle || jsonb_build_object('huecos_eliminados', coalesce(array_length(v_huecos, 1), 0));

      -- ---------------- Producto: se retira su stock con ajustes registrados
      elsif v_tipo = 'producto' then
        v_retirado := '[]'::jsonb;
        for s in
          select st.*, h.codigo_completo, l.codigo as lote_codigo
          from public.stock_por_ubicacion st
          join public.v_huecos h on h.id = st.hueco_id
          left join public.lotes l on l.id = st.lote_id
          where st.producto_id = v_id
          order by h.codigo_completo
          for update of st
        loop
          insert into public.movimientos (tipo, producto_id, lote_id, hueco_origen_id, cantidad, motivo, notas, usuario_id)
          values ('ajuste', v_id, s.lote_id, s.hueco_id, s.cantidad, 'eliminacion',
                  left('Stock retirado al eliminar el producto' || coalesce('. ' || v_motivo, ''), 500), v_yo);
          v_retirado := v_retirado || jsonb_build_object('ubicacion', s.codigo_completo, 'lote', s.lote_codigo, 'cantidad', s.cantidad);
        end loop;
        update public.productos set eliminado_en = v_ahora, eliminado_por = v_yo, activo = false where id = v_id;
        select v_detalle || jsonb_build_object('sku', p.sku, 'nombre', p.nombre, 'coleccion', c.nombre, 'stock_retirado', v_retirado)
          into v_detalle
        from public.productos p join public.colecciones c on c.id = p.coleccion_id where p.id = v_id;

      -- ---------------- Colección: solo si no le quedan productos
      elsif v_tipo = 'coleccion' then
        select count(*) into v_n from public.productos where coleccion_id = v_id and eliminado_en is null;
        if v_n > 0 then
          raise exception 'Tiene % producto(s): elimínalos o cámbialos de colección antes', v_n;
        end if;
        update public.colecciones set eliminado_en = v_ahora, eliminado_por = v_yo where id = v_id;

      -- ---------------- Contacto: su nombre se conserva en el historial
      elsif v_tipo = 'contacto' then
        select v_detalle || jsonb_build_object('nombre', nombre, 'empresa', empresa, 'telefono', telefono, 'email', email)
          into v_detalle from public.contactos where id = v_id;
        update public.contactos set eliminado_en = v_ahora, eliminado_por = v_yo where id = v_id;
      end if;

      insert into public.registro_modificaciones (fecha, usuario_id, usuario_nombre, accion, entidad, entidad_id, descripcion, motivo, detalle)
      values (v_ahora, v_yo, v_nombre, 'eliminacion', v_tipo, v_id, v_desc, v_motivo, v_detalle);
      v_eliminados := v_eliminados || jsonb_build_object('tipo', v_tipo, 'id', v_id, 'descripcion', v_desc);
    exception when others then
      v_bloqueados := v_bloqueados || jsonb_build_object('tipo', v_tipo, 'id', e ->> 'id', 'descripcion', coalesce(v_desc, v_tipo), 'motivo', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('eliminados', v_eliminados, 'bloqueados', v_bloqueados);
end;
$$;

revoke execute on function public.eliminar_elementos(jsonb, text) from public, anon;
grant  execute on function public.eliminar_elementos(jsonb, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Entradas y ajustes no admiten elementos eliminados; producto nuevo exige notas
-- ---------------------------------------------------------------------
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
  select h.id, h.activo, h.capacidad, h.eliminado_en into v_hueco from public.huecos h where h.id = p_hueco_id for update;
  if not found or v_hueco.eliminado_en is not null then
    raise exception 'La ubicación indicada no existe o ha sido eliminada';
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
  if p_contacto_id is null or not exists (select 1 from public.contactos where id = p_contacto_id and eliminado_en is null) then
    raise exception 'Indica la persona de contacto';
  end if;
  if p_foto_url is not null and split_part(p_foto_url, '/', 1) <> auth.uid()::text then
    raise exception 'La foto no es válida';
  end if;

  -- Producto existente o nuevo
  if p_producto_id is not null then
    select * into v_producto from public.productos where id = p_producto_id;
    if not found or v_producto.eliminado_en is not null then
      raise exception 'El producto no existe o ha sido eliminado';
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
    if nullif(trim(p_notas), '') is null then
      raise exception 'Para un producto nuevo, indica en las notas el motivo de la entrada y de quién se recibe';
    end if;
    if p_coleccion_id is null or not exists (select 1 from public.colecciones where id = p_coleccion_id and activa and eliminado_en is null) then
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
  if not exists (select 1 from public.huecos where id = p_hueco_id and eliminado_en is null) then
    raise exception 'La ubicación indicada no existe o ha sido eliminada';
  end if;
  if not exists (select 1 from public.productos where id = p_producto_id and eliminado_en is null) then
    raise exception 'El producto no existe o ha sido eliminado';
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

-- ---------------------------------------------------------------------
-- 6. Vistas de historial: siguen mostrando productos, huecos y contactos
--    eliminados (con el nombre marcado «(eliminado)»). Se ejecutan con los
--    privilegios del propietario y comprueban el permiso del usuario.
-- ---------------------------------------------------------------------
create or replace view public.v_movimientos
with (security_invoker = false)
as
select
  m.id, m.tipo, m.fecha, m.cantidad, m.motivo, m.destino_externo, m.documento, m.notas,
  m.producto_id, p.sku, p.nombre || case when p.eliminado_en is not null then ' (eliminado)' else '' end as producto_nombre, p.foto_url,
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
left join public.contactos ct on ct.id = m.contacto_id
where public.tiene_permiso('ver_stock');

create or replace view public.v_lotes
with (security_invoker = false)
as
select
  l.id, l.codigo, l.fecha_caducidad, l.creado_en,
  l.producto_id, p.sku, p.nombre || case when p.eliminado_en is not null then ' (eliminado)' else '' end as producto_nombre, p.foto_url,
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
) s on true
where public.tiene_permiso('ver_stock');

create or replace view public.v_informe_movimientos
with (security_invoker = false)
as
select m.*, p.coleccion_id, c.nombre as coleccion_nombre
from public.v_movimientos m
join public.productos   p on p.id = m.producto_id
join public.colecciones c on c.id = p.coleccion_id
where public.tiene_permiso('ver_stock');

revoke all on public.v_movimientos, public.v_lotes, public.v_informe_movimientos from anon;
grant select on public.v_movimientos, public.v_lotes, public.v_informe_movimientos to authenticated;

-- ---------------------------------------------------------------------
-- 7. Panel: productos con más unidades perdidas en ajustes negativos
--    (no cuenta el stock retirado al eliminar productos)
-- ---------------------------------------------------------------------
create or replace function public.panel_ajustes_negativos(p_dias integer default 30)
returns table (producto_id uuid, sku text, nombre text, foto_url text, unidades numeric, ajustes integer, ultimo timestamptz)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.tiene_permiso('ver_stock') then
    raise exception 'No tienes permiso para ver estos datos' using errcode = '42501';
  end if;
  return query
  select p.id, p.sku, p.nombre, p.foto_url, sum(m.cantidad)::numeric, count(*)::integer, max(m.fecha)
  from public.movimientos m
  join public.productos p on p.id = m.producto_id
  where m.tipo = 'ajuste'
    and m.hueco_origen_id is not null
    and coalesce(m.motivo, '') <> 'eliminacion'
    and m.fecha >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 3660)))
  group by p.id
  order by sum(m.cantidad) desc, max(m.fecha) desc
  limit 8;
end;
$$;
revoke execute on function public.panel_ajustes_negativos(integer) from public, anon;
grant  execute on function public.panel_ajustes_negativos(integer) to authenticated;

-- ---------------------------------------------------------------------
-- Registro de la migración aplicada
-- ---------------------------------------------------------------------
insert into public.sga_migraciones (numero, nombre) values (9, '009_eliminaciones_registro.sql')
on conflict (numero) do update set nombre = excluded.nombre, aplicada_en = now();
