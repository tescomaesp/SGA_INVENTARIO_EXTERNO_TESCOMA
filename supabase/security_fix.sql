-- =====================================================================
-- SGA · security_fix.sql · Blindaje de seguridad (es la misma migración 010_seguridad.sql)
--
-- Resultado de la auditoría de seguridad. Refuerza lo que ya había, sin
-- aflojar ninguna regla de los roles (cada rol sigue pudiendo solo lo suyo):
--   A. RLS activada en todas las tablas.
--   B. Fuera cualquier política que se aplique a anon o a public.
--   C. anon sin permisos sobre tablas, vistas y secuencias (también futuras).
--   D. Funciones sin el permiso implícito de PUBLIC ni de anon.
--   E. search_path fijo en todas las funciones.
--   F. Ningún espacio de archivos público.
-- Única excepción para usuarios sin sesión: registrar_acceso_fallido(), que
-- solo anota en el registro de auditoría los intentos de acceso fallidos.
-- =====================================================================
-- Se puede ejecutar más de una vez: si ya se aplicó, no duplica nada ni da error.

-- Requisito: la migración anterior tiene que estar aplicada
do $requisito$
begin
  if to_regprocedure('public.eliminar_elementos(jsonb,text)') is null then
    raise exception 'Falta la migración anterior: ejecuta primero 009_eliminaciones_registro.sql y después esta.';
  end if;
end;
$requisito$;

-- ---------------------------------------------------------------------
-- A. Row Level Security activada en TODAS las tablas del esquema public
--    (sin políticas, una tabla con RLS no es accesible desde la API)
-- ---------------------------------------------------------------------
do $rls$
declare t record;
begin
  for t in
    select c.oid::regclass as tabla
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  loop
    execute format('alter table %s enable row level security', t.tabla);
    raise notice 'RLS activada en %', t.tabla;
  end loop;
end;
$rls$;

-- ---------------------------------------------------------------------
-- B. Ninguna política para usuarios sin sesión: se eliminan las que se
--    apliquen a «anon» o a «public» (todos los roles), en datos y archivos
-- ---------------------------------------------------------------------
do $politicas$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname in ('public', 'storage') and roles && array['anon', 'public']::name[]
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    raise notice 'Política abierta eliminada: % en %.%', p.policyname, p.schemaname, p.tablename;
  end loop;
end;
$politicas$;

-- ---------------------------------------------------------------------
-- C. Sin sesión no se puede leer ni escribir nada: anon pierde todo permiso
--    sobre tablas, vistas y secuencias, también sobre las que se creen después
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- ---------------------------------------------------------------------
-- D. Funciones: se retira el permiso implícito de PUBLIC y el de anon.
--    Quien ya podía usarlas con sesión (authenticated) o el servidor
--    (service_role) lo conserva, para no romper ninguna pantalla.
-- ---------------------------------------------------------------------
do $funciones$
declare
  f record;
  v_auth boolean;
  v_srv boolean;
begin
  for f in
    select p.oid, p.oid::regprocedure as firma
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f', 'p')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    v_auth := has_function_privilege('authenticated', f.oid, 'execute');
    v_srv  := has_function_privilege('service_role', f.oid, 'execute');
    execute format('revoke execute on function %s from public, anon', f.firma);
    if v_auth then execute format('grant execute on function %s to authenticated', f.firma); end if;
    if v_srv  then execute format('grant execute on function %s to service_role', f.firma); end if;
  end loop;
end;
$funciones$;
alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------------------------------------------------------------------
-- E. Ruta de búsqueda fija en las funciones que no la tenían
--    (evita que se pueda suplantar una tabla o función con otra del mismo nombre)
-- ---------------------------------------------------------------------
do $ruta$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f', 'p')
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = public, extensions', f.firma);
  end loop;
end;
$ruta$;

-- ---------------------------------------------------------------------
-- F. Archivos: ningún espacio de almacenamiento público
--    (las fotos solo se ven con sesión, a través de enlaces firmados)
-- ---------------------------------------------------------------------
update storage.buckets set public = false where public;

-- ---------------------------------------------------------------------
-- Excepción documentada: la pantalla de acceso anota los intentos fallidos
-- ---------------------------------------------------------------------
grant execute on function public.registrar_acceso_fallido(text) to anon;

insert into public.sga_migraciones (numero, nombre) values (10, '010_seguridad.sql')
on conflict (numero) do update set nombre = excluded.nombre, aplicada_en = now();

-- ---------------------------------------------------------------------
-- Comprobación final: todo debe dar 0 (o solo las excepciones documentadas)
-- ---------------------------------------------------------------------
select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity)            as tablas_sin_rls,
  (select count(*) from pg_policies
    where schemaname in ('public', 'storage') and roles && array['anon', 'public']::name[])      as politicas_para_anonimos,
  (select count(distinct table_name) from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public')                                          as tablas_accesibles_sin_sesion,
  (select string_agg(p.oid::regprocedure::text, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'))      as funciones_sin_sesion,
  (select count(*) from storage.buckets where public)                                            as archivos_publicos;
