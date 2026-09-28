-- =====================================================================
-- SGA · Migración 002 · Ubicaciones
-- Almacén > Pasillo > Estantería > Nivel > Hueco
-- Código completo de un hueco: ALM1-P01-E03-N2-H04
-- =====================================================================

-- ---------------------------------------------------------------------
-- Normalización de códigos: mayúsculas, sin espacios. El guion se reserva
-- como separador del código completo, así que no se admite en cada parte.
-- ---------------------------------------------------------------------
-- Se puede ejecutar más de una vez: si ya se aplicó, no duplica nada ni da error.

-- Requisito: la migración anterior tiene que estar aplicada
do $requisito$
begin
  if to_regprocedure('public.tiene_permiso(text)') is null then
    raise exception 'Falta la migración anterior: ejecuta primero 001_roles_perfiles.sql y después esta.';
  end if;
end;
$requisito$;

create or replace function public.normalizar_codigo()
returns trigger
language plpgsql
as $$
begin
  new.codigo := upper(regexp_replace(coalesce(new.codigo, ''), '\s+', '', 'g'));
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------
create table if not exists public.almacenes (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null unique check (codigo ~ '^[A-Z0-9]{1,12}$'),
  nombre      text not null check (char_length(nombre) between 1 and 80),
  direccion   text check (char_length(direccion) <= 200),
  creado_en   timestamptz not null default now()
);

create table if not exists public.pasillos (
  id          uuid primary key default gen_random_uuid(),
  almacen_id  uuid not null references public.almacenes (id) on delete cascade,
  codigo      text not null check (codigo ~ '^[A-Z0-9]{1,12}$'),
  descripcion text check (char_length(descripcion) <= 120),
  creado_en   timestamptz not null default now(),
  unique (almacen_id, codigo)
);

create table if not exists public.estanterias (
  id          uuid primary key default gen_random_uuid(),
  pasillo_id  uuid not null references public.pasillos (id) on delete cascade,
  codigo      text not null check (codigo ~ '^[A-Z0-9]{1,12}$'),
  descripcion text check (char_length(descripcion) <= 120),
  creado_en   timestamptz not null default now(),
  unique (pasillo_id, codigo)
);

create table if not exists public.niveles (
  id             uuid primary key default gen_random_uuid(),
  estanteria_id  uuid not null references public.estanterias (id) on delete cascade,
  codigo         text not null check (codigo ~ '^[A-Z0-9]{1,12}$'),
  orden          smallint not null check (orden between 1 and 99),   -- 1 = nivel del suelo
  creado_en      timestamptz not null default now(),
  unique (estanteria_id, codigo),
  unique (estanteria_id, orden)
);

create table if not exists public.huecos (
  id          uuid primary key default gen_random_uuid(),
  nivel_id    uuid not null references public.niveles (id) on delete cascade,
  codigo      text not null check (codigo ~ '^[A-Z0-9]{1,12}$'),
  capacidad   integer check (capacidad is null or capacidad > 0),   -- unidades; vacío = sin límite definido
  activo      boolean not null default true,                         -- false = bloqueado (no admite mercancía)
  notas       text check (char_length(notas) <= 200),
  creado_en   timestamptz not null default now(),
  unique (nivel_id, codigo)
);

create index if not exists pasillos_almacen_idx     on public.pasillos (almacen_id);
create index if not exists estanterias_pasillo_idx  on public.estanterias (pasillo_id);
create index if not exists niveles_estanteria_idx   on public.niveles (estanteria_id);
create index if not exists huecos_nivel_idx         on public.huecos (nivel_id);

create or replace trigger almacenes_codigo   before insert or update of codigo on public.almacenes   for each row execute function public.normalizar_codigo();
create or replace trigger pasillos_codigo    before insert or update of codigo on public.pasillos    for each row execute function public.normalizar_codigo();
create or replace trigger estanterias_codigo before insert or update of codigo on public.estanterias for each row execute function public.normalizar_codigo();
create or replace trigger niveles_codigo     before insert or update of codigo on public.niveles     for each row execute function public.normalizar_codigo();
create or replace trigger huecos_codigo      before insert or update of codigo on public.huecos      for each row execute function public.normalizar_codigo();

-- ---------------------------------------------------------------------
-- Seguridad: todos los usuarios activos leen; solo admin modifica
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['almacenes', 'pasillos', 'estanterias', 'niveles', 'huecos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_lectura', t);
    execute format('drop policy if exists %I on public.%I', t || '_alta', t);
    execute format('drop policy if exists %I on public.%I', t || '_edicion', t);
    execute format('drop policy if exists %I on public.%I', t || '_baja', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.tiene_permiso(''ver_stock''))', t || '_lectura', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.tiene_permiso(''gestionar_ubicaciones''))', t || '_alta', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.tiene_permiso(''gestionar_ubicaciones'')) with check (public.tiene_permiso(''gestionar_ubicaciones''))', t || '_edicion', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.tiene_permiso(''gestionar_ubicaciones''))', t || '_baja', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Vista plana de huecos con su código completo (búsqueda, etiquetas y,
-- en la fase 3, selector de ubicación en las entradas)
-- ---------------------------------------------------------------------
create or replace view public.v_huecos
with (security_invoker = true)
as
select
  h.id,
  a.codigo || '-' || p.codigo || '-' || e.codigo || '-' || n.codigo || '-' || h.codigo as codigo_completo,
  h.codigo,
  h.capacidad,
  h.activo,
  h.notas,
  n.id  as nivel_id,       n.codigo as nivel_codigo,  n.orden as nivel_orden,
  e.id  as estanteria_id,  e.codigo as estanteria_codigo,
  p.id  as pasillo_id,     p.codigo as pasillo_codigo,
  a.id  as almacen_id,     a.codigo as almacen_codigo, a.nombre as almacen_nombre
from public.huecos h
join public.niveles     n on n.id = h.nivel_id
join public.estanterias e on e.id = n.estanteria_id
join public.pasillos    p on p.id = e.pasillo_id
join public.almacenes   a on a.id = p.almacen_id;

-- Ocupación por hueco. En esta fase aún no hay stock, así que devuelve ceros;
-- la migración 004 la sustituye con los datos reales manteniendo las mismas
-- columnas. Solo se crea si no existe, para no pisar la versión de la 004
-- si esta migración se vuelve a ejecutar más tarde.
do $vista$
begin
  if to_regclass('public.v_ocupacion_huecos') is null then
    create view public.v_ocupacion_huecos
    with (security_invoker = true)
    as
    select
      h.id           as hueco_id,
      h.almacen_id,
      0::numeric     as unidades,
      0::integer     as referencias
    from public.v_huecos h;
  end if;
end;
$vista$;

revoke all on public.v_huecos, public.v_ocupacion_huecos from anon;
grant select on public.v_huecos, public.v_ocupacion_huecos to authenticated;

-- ---------------------------------------------------------------------
-- Generadores: crear estructura completa de una vez
-- (se ejecutan con los permisos del usuario: la RLS sigue aplicándose)
-- ---------------------------------------------------------------------
create or replace function public._exigir_gestion_ubicaciones()
returns void
language plpgsql
stable
as $$
begin
  if not public.tiene_permiso('gestionar_ubicaciones') then
    raise exception 'No tienes permiso para gestionar ubicaciones' using errcode = '42501';
  end if;
end;
$$;

create or replace function public._validar_rango(p_valor integer, p_min integer, p_max integer, p_nombre text)
returns void
language plpgsql
immutable
as $$
begin
  if p_valor is null or p_valor < p_min or p_valor > p_max then
    raise exception 'El número de % debe estar entre % y %', p_nombre, p_min, p_max using errcode = '22023';
  end if;
end;
$$;

-- Añade un nivel con N huecos (H01…Hn) a una estantería. Devuelve el id del nivel.
create or replace function public.anadir_nivel(p_estanteria_id uuid, p_huecos integer, p_capacidad integer default null)
returns uuid
language plpgsql
as $$
declare
  v_orden smallint;
  v_nivel uuid;
begin
  perform public._exigir_gestion_ubicaciones();
  perform public._validar_rango(p_huecos, 1, 50, 'huecos por nivel');

  select coalesce(max(orden), 0) + 1 into v_orden from public.niveles where estanteria_id = p_estanteria_id;
  if v_orden > 20 then
    raise exception 'Una estantería no puede tener más de 20 niveles' using errcode = '22023';
  end if;

  insert into public.niveles (estanteria_id, codigo, orden)
  values (p_estanteria_id, 'N' || v_orden, v_orden)
  returning id into v_nivel;

  insert into public.huecos (nivel_id, codigo, capacidad)
  select v_nivel, 'H' || lpad(i::text, 2, '0'), p_capacidad
  from generate_series(1, p_huecos) i;

  return v_nivel;
end;
$$;

-- Crea una estantería con niveles × huecos. Devuelve el id de la estantería.
create or replace function public.generar_estanteria(
  p_pasillo_id uuid, p_codigo text, p_niveles integer, p_huecos integer, p_capacidad integer default null, p_descripcion text default null)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  perform public._exigir_gestion_ubicaciones();
  perform public._validar_rango(p_niveles, 1, 20, 'niveles');
  perform public._validar_rango(p_huecos, 1, 50, 'huecos por nivel');

  insert into public.estanterias (pasillo_id, codigo, descripcion)
  values (p_pasillo_id, p_codigo, nullif(trim(p_descripcion), ''))
  returning id into v_id;

  for i in 1..p_niveles loop
    perform public.anadir_nivel(v_id, p_huecos, p_capacidad);
  end loop;

  return v_id;
end;
$$;

-- Crea un pasillo y, opcionalmente, sus estanterías (E01…En) ya divididas.
create or replace function public.generar_pasillo(
  p_almacen_id uuid, p_codigo text, p_estanterias integer default 0, p_niveles integer default 1,
  p_huecos integer default 1, p_capacidad integer default null, p_descripcion text default null)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  perform public._exigir_gestion_ubicaciones();
  perform public._validar_rango(p_estanterias, 0, 100, 'estanterías');

  insert into public.pasillos (almacen_id, codigo, descripcion)
  values (p_almacen_id, p_codigo, nullif(trim(p_descripcion), ''))
  returning id into v_id;

  for i in 1..p_estanterias loop
    perform public.generar_estanteria(v_id, 'E' || lpad(i::text, 2, '0'), p_niveles, p_huecos, p_capacidad);
  end loop;

  return v_id;
end;
$$;

-- Añade un hueco al final de un nivel (siguiente número libre).
create or replace function public.anadir_hueco(p_nivel_id uuid, p_capacidad integer default null)
returns uuid
language plpgsql
as $$
declare
  v_num integer;
  v_id uuid;
begin
  perform public._exigir_gestion_ubicaciones();

  select coalesce(max(substring(codigo from '^H(\d+)$')::integer), 0) + 1 into v_num
  from public.huecos where nivel_id = p_nivel_id;
  if v_num > 50 then
    raise exception 'Un nivel no puede tener más de 50 huecos' using errcode = '22023';
  end if;

  insert into public.huecos (nivel_id, codigo, capacidad)
  values (p_nivel_id, 'H' || lpad(v_num::text, 2, '0'), p_capacidad)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public._exigir_gestion_ubicaciones()                                   from public, anon;
revoke execute on function public._validar_rango(integer, integer, integer, text)                 from public, anon;
revoke execute on function public.anadir_nivel(uuid, integer, integer)                            from public, anon;
revoke execute on function public.anadir_hueco(uuid, integer)                                     from public, anon;
revoke execute on function public.generar_estanteria(uuid, text, integer, integer, integer, text) from public, anon;
revoke execute on function public.generar_pasillo(uuid, text, integer, integer, integer, integer, text) from public, anon;
grant  execute on function public._exigir_gestion_ubicaciones()                                   to authenticated;
grant  execute on function public._validar_rango(integer, integer, integer, text)                 to authenticated;
grant  execute on function public.anadir_nivel(uuid, integer, integer)                            to authenticated;
grant  execute on function public.anadir_hueco(uuid, integer)                                     to authenticated;
grant  execute on function public.generar_estanteria(uuid, text, integer, integer, integer, text) to authenticated;
grant  execute on function public.generar_pasillo(uuid, text, integer, integer, integer, integer, text) to authenticated;

-- ---------------------------------------------------------------------
-- Permisos explícitos (no se depende de los permisos por defecto del proyecto)
-- ---------------------------------------------------------------------
grant select on public.almacenes, public.pasillos, public.estanterias, public.niveles, public.huecos to authenticated;
grant insert, update, delete on public.almacenes, public.pasillos, public.estanterias, public.niveles, public.huecos to authenticated;
grant all on public.almacenes, public.pasillos, public.estanterias, public.niveles, public.huecos to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------
-- Registro de la migración aplicada (select * from public.sga_migraciones;)
-- ---------------------------------------------------------------------
insert into public.sga_migraciones (numero, nombre) values (2, '002_ubicaciones.sql')
on conflict (numero) do update set nombre = excluded.nombre, aplicada_en = now();
