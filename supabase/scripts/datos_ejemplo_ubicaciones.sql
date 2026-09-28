-- =====================================================================
-- Datos de ejemplo para probar el módulo de ubicaciones (opcional).
-- Crea el almacén ALM1 con dos pasillos:
--   P01: 4 estanterías de 4 niveles × 3 huecos (capacidad 50)
--   P02: 2 estanterías de 5 niveles × 4 huecos (sin capacidad definida)
-- Ejecútalo en el SQL Editor después de crear el administrador inicial.
-- =====================================================================
do $$
declare
  v_admin text;
  v_almacen uuid;
begin
  select id::text into v_admin from public.perfiles where rol_id = 'admin' and activo limit 1;
  if v_admin is null then
    raise exception 'Primero crea el administrador inicial (crear_admin_inicial.sql)';
  end if;
  -- Actúa como el administrador para que se apliquen las comprobaciones de permisos
  perform set_config('request.jwt.claim.sub', v_admin, true);

  insert into public.almacenes (codigo, nombre, direccion)
  values ('ALM1', 'Almacén central', 'Polígono industrial, nave 4')
  on conflict (codigo) do nothing
  returning id into v_almacen;

  if v_almacen is null then
    raise notice 'El almacén ALM1 ya existía; no se ha creado nada.';
    return;
  end if;

  perform public.generar_pasillo(v_almacen, 'P01', 4, 4, 3, 50, 'Zona de recepción');
  perform public.generar_pasillo(v_almacen, 'P02', 2, 5, 4, null, 'Carga pesada');
end;
$$;

select count(*) as huecos_creados from public.v_huecos where almacen_codigo = 'ALM1';
