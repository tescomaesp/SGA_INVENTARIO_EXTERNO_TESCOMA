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
