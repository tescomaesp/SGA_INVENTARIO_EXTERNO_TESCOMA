-- =====================================================================
-- SGA · INSTALACIÓN COMPLETA DE LA BASE DE DATOS
--
-- Este archivo contiene las 7 migraciones de supabase/migrations en orden.
-- Pégalo entero en Supabase > SQL Editor > New query y pulsa "Run".
--
-- · Se puede ejecutar más de una vez sin problema (no duplica nada).
-- · Si Supabase pide confirmación por contener operaciones "destructivas"
--   (revoke, drop policy…), confírmala: son necesarias para los permisos.
-- · Al terminar, comprueba que aparecen las 7 filas:
--     select * from public.sga_migraciones order by numero;
--
-- Archivo generado a partir de supabase/migrations: si cambias una
-- migración, vuelve a generarlo o ejecuta las migraciones sueltas.
-- =====================================================================


-- ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
-- migrations/001_roles_perfiles.sql
-- ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼

-- =====================================================================
-- SGA · Migración 001 · Roles, perfiles, permisos y auditoría de accesos
-- =====================================================================

-- ---------------------------------------------------------------------
-- Registro de migraciones aplicadas (solo informativo)
-- ---------------------------------------------------------------------
create table if not exists public.sga_migraciones (
  numero      smallint primary key,
  nombre      text not null,
  aplicada_en timestamptz not null default now()
);
alter table public.sga_migraciones enable row level security;
revoke all on public.sga_migraciones from anon, authenticated;

-- ---------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------
-- Se puede ejecutar más de una vez: si ya se aplicó, no duplica nada ni da error.

create table if not exists public.roles (
  id          text primary key check (id in ('admin', 'responsable', 'operario', 'consulta')),
  nombre      text not null,
  descripcion text not null,
  orden       smallint not null
);

insert into public.roles (id, nombre, descripcion, orden) values
  ('admin',       'Administrador',          'Gestiona usuarios, roles, ubicaciones y colecciones. Acceso total.', 1),
  ('responsable', 'Responsable de almacén', 'Registra y edita entradas, salidas y traslados. Hace ajustes y consulta informes.', 2),
  ('operario',    'Operario',               'Registra entradas, salidas y traslados. Consulta el stock.', 3),
  ('consulta',    'Consulta',               'Solo lectura: stock, historial e informes.', 4)
on conflict (id) do update set nombre = excluded.nombre, descripcion = excluded.descripcion, orden = excluded.orden;

-- ---------------------------------------------------------------------
-- Perfiles (1:1 con auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.perfiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  email           text not null unique,
  nombre_completo text not null default '' check (char_length(nombre_completo) <= 120),
  telefono        text check (char_length(telefono) <= 30),
  foto_url        text check (char_length(foto_url) <= 300),   -- ruta dentro del bucket "avatares"
  puesto          text check (char_length(puesto) <= 80),
  rol_id          text not null default 'consulta' references public.roles (id),
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

create index if not exists perfiles_rol_idx on public.perfiles (rol_id);

-- Mantiene actualizado_en
create or replace function public.tocar_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create or replace trigger perfiles_actualizado_en
  before update on public.perfiles
  for each row execute function public.tocar_actualizado_en();

-- Crea el perfil automáticamente cuando se invita/crea un usuario.
-- El rol NUNCA se toma de los metadatos del usuario (los controla el propio
-- usuario): siempre nace como "consulta" y lo asigna la Edge Function.
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, email, nombre_completo, telefono, puesto)
  values (
    new.id,
    lower(new.email),
    left(coalesce(new.raw_user_meta_data ->> 'nombre_completo', ''), 120),
    left(new.raw_user_meta_data ->> 'telefono', 30),
    left(new.raw_user_meta_data ->> 'puesto', 80)
  );
  return new;
end;
$$;

create or replace trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();

-- ---------------------------------------------------------------------
-- Funciones de permisos (fuente de verdad en servidor)
-- La matriz está duplicada en src/lib/permisos.ts solo para la interfaz.
-- ---------------------------------------------------------------------
create or replace function public.rol_actual()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.rol_id
  from public.perfiles p
  where p.id = auth.uid() and p.activo
$$;

create or replace function public.tiene_permiso(p_accion text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case p_accion
      when 'ver_stock'             then true
      when 'registrar_movimientos' then x.r in ('admin', 'responsable', 'operario')
      when 'editar_productos'      then x.r in ('admin', 'responsable')
      when 'ajustes'               then x.r in ('admin', 'responsable')
      when 'informes'              then x.r in ('admin', 'responsable', 'consulta')
      when 'gestionar_ubicaciones' then x.r = 'admin'
      when 'gestionar_usuarios'    then x.r = 'admin'
      else false
    end
    from (select public.rol_actual() as r) x
    where x.r is not null
  ), false)
$$;

revoke execute on function public.rol_actual()         from public, anon;
revoke execute on function public.tiene_permiso(text)  from public, anon;
grant  execute on function public.rol_actual()         to authenticated;
grant  execute on function public.tiene_permiso(text)  to authenticated;

-- ---------------------------------------------------------------------
-- Seguridad a nivel de fila
-- ---------------------------------------------------------------------
alter table public.roles    enable row level security;
alter table public.perfiles enable row level security;

drop policy if exists roles_lectura on public.roles;
create policy roles_lectura on public.roles
  for select to authenticated
  using (true);

-- Cualquier usuario activo ve los perfiles (para mostrar "quién hizo qué").
drop policy if exists perfiles_lectura on public.perfiles;
create policy perfiles_lectura on public.perfiles
  for select to authenticated
  using (public.rol_actual() is not null);

-- Cada usuario edita solo su propio perfil…
drop policy if exists perfiles_editar_propio on public.perfiles;
create policy perfiles_editar_propio on public.perfiles
  for update to authenticated
  using (id = auth.uid() and public.rol_actual() is not null)
  with check (id = auth.uid());

-- …y solo estas columnas. Rol, email y estado se cambian desde la Edge Function.
revoke insert, update, delete on public.perfiles from anon, authenticated;
grant  update (nombre_completo, telefono, foto_url, puesto) on public.perfiles to authenticated;

revoke insert, update, delete on public.roles from anon, authenticated;

-- ---------------------------------------------------------------------
-- Auditoría de accesos
-- ---------------------------------------------------------------------
create table if not exists public.auditoria_accesos (
  id         bigint generated always as identity primary key,
  usuario_id uuid references auth.users (id) on delete set null,
  email      text,
  evento     text not null check (evento in ('login', 'logout', 'login_fallido')),
  ip         text,
  user_agent text,
  fecha      timestamptz not null default now()
);

create index if not exists auditoria_accesos_fecha_idx   on public.auditoria_accesos (fecha desc);
create index if not exists auditoria_accesos_usuario_idx on public.auditoria_accesos (usuario_id, fecha desc);

alter table public.auditoria_accesos enable row level security;

drop policy if exists auditoria_lectura_admin on public.auditoria_accesos;
create policy auditoria_lectura_admin on public.auditoria_accesos
  for select to authenticated
  using (public.tiene_permiso('gestionar_usuarios'));

revoke insert, update, delete on public.auditoria_accesos from anon, authenticated;

-- Lee IP y navegador de las cabeceras de la petición a la API
create or replace function public._cabeceras_peticion(out ip text, out user_agent text)
language plpgsql
stable
set search_path = ''
as $$
declare
  h json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
begin
  ip         := left(trim(split_part(coalesce(h ->> 'x-forwarded-for', h ->> 'x-real-ip', ''), ',', 1)), 64);
  user_agent := left(h ->> 'user-agent', 300);
end;
$$;

create or replace function public.registrar_acceso(p_evento text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida';
  end if;
  if p_evento not in ('login', 'logout') then
    raise exception 'Evento no válido: %', p_evento;
  end if;

  select * into c from public._cabeceras_peticion();

  insert into public.auditoria_accesos (usuario_id, email, evento, ip, user_agent)
  select auth.uid(), p.email, p_evento, c.ip, c.user_agent
  from public.perfiles p
  where p.id = auth.uid();
end;
$$;

create or replace function public.registrar_acceso_fallido(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  select * into c from public._cabeceras_peticion();

  insert into public.auditoria_accesos (email, evento, ip, user_agent)
  values (left(lower(trim(p_email)), 254), 'login_fallido', c.ip, c.user_agent);
end;
$$;

revoke execute on function public._cabeceras_peticion()           from public, anon, authenticated;
revoke execute on function public.registrar_acceso(text)          from public, anon;
revoke execute on function public.registrar_acceso_fallido(text)  from public;
grant  execute on function public.registrar_acceso(text)          to authenticated;
grant  execute on function public.registrar_acceso_fallido(text)  to anon, authenticated;

-- ---------------------------------------------------------------------
-- Almacenamiento: fotos de perfil (bucket privado, URLs firmadas)
-- Estructura: avatares/<id_usuario>/<archivo>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists avatares_lectura on storage.objects;
create policy avatares_lectura on storage.objects
  for select to authenticated
  using (bucket_id = 'avatares' and public.rol_actual() is not null);

drop policy if exists avatares_subir_propio on storage.objects;
create policy avatares_subir_propio on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatares_actualizar_propio on storage.objects;
create policy avatares_actualizar_propio on storage.objects
  for update to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatares_borrar_propio on storage.objects;
create policy avatares_borrar_propio on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- Permisos explícitos (no se depende de los permisos por defecto del proyecto)
-- ---------------------------------------------------------------------
grant select on public.roles, public.perfiles, public.auditoria_accesos to authenticated;
grant all on public.roles, public.perfiles, public.auditoria_accesos to service_role;
grant usage, select on all sequences in schema public to service_role;
revoke all on public.roles, public.perfiles, public.auditoria_accesos from anon;

-- ---------------------------------------------------------------------
-- Registro de la migración aplicada (select * from public.sga_migraciones;)
-- ---------------------------------------------------------------------
insert into public.sga_migraciones (numero, nombre) values (1, '001_roles_perfiles.sql')
on conflict (numero) do update set nombre = excluded.nombre, aplicada_en = now();


-- ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
-- migrations/002_ubicaciones.sql
-- ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼

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


-- ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
-- migrations/003_catalogo.sql
-- ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼

-- =====================================================================
-- SGA · Migración 003 · Catálogo: colecciones, contactos, productos y lotes
-- =====================================================================
-- Se puede ejecutar más de una vez: si ya se aplicó, no duplica nada ni da error.

-- Requisito: la migración anterior tiene que estar aplicada
do $requisito$
begin
  if to_regclass('public.huecos') is null then
    raise exception 'Falta la migración anterior: ejecuta primero 002_ubicaciones.sql y después esta.';
  end if;
end;
$requisito$;

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- Colecciones (agrupación de productos). Las gestiona el administrador.
-- ---------------------------------------------------------------------
create table if not exists public.colecciones (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (char_length(trim(nombre)) between 1 and 80),
  descripcion text check (char_length(descripcion) <= 200),
  activa      boolean not null default true,
  creado_en   timestamptz not null default now()
);
create unique index if not exists colecciones_nombre_unico on public.colecciones (lower(trim(nombre)));

-- ---------------------------------------------------------------------
-- Contactos (proveedor o responsable de la mercancía)
-- ---------------------------------------------------------------------
create table if not exists public.contactos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (char_length(trim(nombre)) between 1 and 120),
  empresa     text check (char_length(empresa) <= 120),
  telefono    text check (char_length(telefono) <= 30),
  email       text check (email is null or (char_length(email) <= 254 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')),
  notas       text check (char_length(notas) <= 300),
  creado_por  uuid references public.perfiles (id) default auth.uid(),
  creado_en   timestamptz not null default now()
);
create index if not exists contactos_nombre_trgm on public.contactos using gin (lower(nombre || ' ' || coalesce(empresa, '')) extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------
-- Productos (ficha de catálogo; el stock vive en stock_por_ubicacion)
-- ---------------------------------------------------------------------
create sequence if not exists public.productos_sku_seq;

create table if not exists public.productos (
  id              uuid primary key default gen_random_uuid(),
  sku             text not null unique default ('P' || lpad(nextval('public.productos_sku_seq')::text, 6, '0')),
  nombre          text not null check (char_length(trim(nombre)) between 1 and 150),
  foto_url        text check (char_length(foto_url) <= 300),          -- ruta en el bucket "productos"
  coleccion_id    uuid not null references public.colecciones (id),
  contacto_id     uuid references public.contactos (id),              -- contacto habitual
  stock_minimo    numeric(14, 3) not null default 0 check (stock_minimo >= 0),
  notas           text check (char_length(notas) <= 500),
  activo          boolean not null default true,
  creado_por      uuid references public.perfiles (id) default auth.uid(),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
alter sequence public.productos_sku_seq owned by public.productos.sku;

create index if not exists productos_coleccion_idx on public.productos (coleccion_id);
create index if not exists productos_contacto_idx  on public.productos (contacto_id);
create index if not exists productos_busqueda_trgm on public.productos using gin (lower(nombre || ' ' || sku) extensions.gin_trgm_ops);

create or replace trigger productos_actualizado_en
  before update on public.productos
  for each row execute function public.tocar_actualizado_en();

-- El SKU no se puede cambiar una vez creado (va impreso en etiquetas)
create or replace function public.proteger_sku()
returns trigger
language plpgsql
as $$
begin
  if new.sku is distinct from old.sku then
    raise exception 'El SKU de un producto no se puede modificar';
  end if;
  return new;
end;
$$;
create or replace trigger productos_sku_inmutable before update of sku on public.productos
  for each row execute function public.proteger_sku();

-- ---------------------------------------------------------------------
-- Lotes
-- ---------------------------------------------------------------------
create table if not exists public.lotes (
  id               uuid primary key default gen_random_uuid(),
  producto_id      uuid not null references public.productos (id) on delete cascade,
  codigo           text not null check (char_length(trim(codigo)) between 1 and 60),
  fecha_caducidad  date,
  creado_en        timestamptz not null default now(),
  unique (producto_id, codigo)
);

-- ---------------------------------------------------------------------
-- Seguridad
-- ---------------------------------------------------------------------
alter table public.colecciones enable row level security;
alter table public.contactos   enable row level security;
alter table public.productos   enable row level security;
alter table public.lotes       enable row level security;

-- Colecciones: todos leen; el administrador gestiona
drop policy if exists colecciones_lectura on public.colecciones;
create policy colecciones_lectura on public.colecciones for select to authenticated using (public.tiene_permiso('ver_stock'));
drop policy if exists colecciones_alta on public.colecciones;
create policy colecciones_alta    on public.colecciones for insert to authenticated with check (public.tiene_permiso('gestionar_ubicaciones'));
drop policy if exists colecciones_edicion on public.colecciones;
create policy colecciones_edicion on public.colecciones for update to authenticated using (public.tiene_permiso('gestionar_ubicaciones')) with check (public.tiene_permiso('gestionar_ubicaciones'));
drop policy if exists colecciones_baja on public.colecciones;
create policy colecciones_baja    on public.colecciones for delete to authenticated using (public.tiene_permiso('gestionar_ubicaciones'));

-- Contactos: quien registra entradas puede crearlos; responsables los editan; el administrador los borra
drop policy if exists contactos_lectura on public.contactos;
create policy contactos_lectura on public.contactos for select to authenticated using (public.tiene_permiso('ver_stock'));
drop policy if exists contactos_alta on public.contactos;
create policy contactos_alta    on public.contactos for insert to authenticated with check (public.tiene_permiso('registrar_movimientos'));
drop policy if exists contactos_edicion on public.contactos;
create policy contactos_edicion on public.contactos for update to authenticated using (public.tiene_permiso('editar_productos')) with check (public.tiene_permiso('editar_productos'));
drop policy if exists contactos_baja on public.contactos;
create policy contactos_baja    on public.contactos for delete to authenticated using (public.tiene_permiso('gestionar_usuarios'));

-- Productos: se crean al registrar una entrada (función registrar_entrada);
-- los responsables editan las fichas; el administrador borra los que nunca se han movido
drop policy if exists productos_lectura on public.productos;
create policy productos_lectura on public.productos for select to authenticated using (public.tiene_permiso('ver_stock'));
drop policy if exists productos_edicion on public.productos;
create policy productos_edicion on public.productos for update to authenticated using (public.tiene_permiso('editar_productos')) with check (public.tiene_permiso('editar_productos'));
drop policy if exists productos_baja on public.productos;
create policy productos_baja    on public.productos for delete to authenticated using (public.tiene_permiso('gestionar_usuarios'));

drop policy if exists lotes_lectura on public.lotes;
create policy lotes_lectura on public.lotes for select to authenticated using (public.tiene_permiso('ver_stock'));
drop policy if exists lotes_edicion on public.lotes;
create policy lotes_edicion on public.lotes for update to authenticated using (public.tiene_permiso('editar_productos')) with check (public.tiene_permiso('editar_productos'));

revoke all on public.colecciones, public.contactos, public.productos, public.lotes from anon;
revoke insert on public.productos, public.lotes from authenticated;
-- Campos que no se editan a mano
revoke update on public.productos from authenticated;
grant  update (nombre, foto_url, coleccion_id, contacto_id, stock_minimo, notas, activo) on public.productos to authenticated;
revoke update on public.contactos from authenticated;
grant  update (nombre, empresa, telefono, email, notas) on public.contactos to authenticated;
revoke update on public.lotes from authenticated;
grant  update (fecha_caducidad) on public.lotes to authenticated;

-- ---------------------------------------------------------------------
-- Fotos de producto (bucket privado)
-- Se suben a productos/<id_usuario>/<archivo> antes de registrar la entrada.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('productos', 'productos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists productos_foto_lectura on storage.objects;
create policy productos_foto_lectura on storage.objects
  for select to authenticated
  using (bucket_id = 'productos' and public.tiene_permiso('ver_stock'));

drop policy if exists productos_foto_subida on storage.objects;
create policy productos_foto_subida on storage.objects
  for insert to authenticated
  with check (bucket_id = 'productos' and public.tiene_permiso('registrar_movimientos')
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists productos_foto_borrado on storage.objects;
create policy productos_foto_borrado on storage.objects
  for delete to authenticated
  using (bucket_id = 'productos' and public.tiene_permiso('editar_productos'));

-- ---------------------------------------------------------------------
-- Permisos explícitos (no se depende de los permisos por defecto del proyecto).
-- Las columnas editables de productos, contactos y lotes se concedieron arriba.
-- ---------------------------------------------------------------------
grant select on public.colecciones, public.contactos, public.productos, public.lotes to authenticated;
grant insert, update, delete on public.colecciones to authenticated;
grant insert, delete on public.contactos to authenticated;
grant delete on public.productos to authenticated;
grant all on public.colecciones, public.contactos, public.productos, public.lotes to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------
-- Registro de la migración aplicada (select * from public.sga_migraciones;)
-- ---------------------------------------------------------------------
insert into public.sga_migraciones (numero, nombre) values (3, '003_catalogo.sql')
on conflict (numero) do update set nombre = excluded.nombre, aplicada_en = now();


-- ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
-- migrations/004_movimientos_stock.sql
-- ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼

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


-- ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
-- migrations/005_salidas_traslados.sql
-- ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼

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


-- ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
-- migrations/006_trazabilidad.sql
-- ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼

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


-- ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
-- migrations/007_panel_informes.sql
-- ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼

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


-- Comprobación final: deben aparecer las 7 migraciones
select numero, nombre, aplicada_en from public.sga_migraciones order by numero;
