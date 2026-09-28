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
