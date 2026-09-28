-- =====================================================================
-- Datos de ejemplo del catálogo (opcional): colecciones y contactos
-- para poder registrar la primera entrada nada más instalar.
-- Se puede ejecutar varias veces sin duplicar nada.
-- =====================================================================
insert into public.colecciones (nombre, descripcion) values
  ('Básicos', 'Referencias permanentes'),
  ('Primavera-Verano 2026', 'Temporada actual'),
  ('Otoño-Invierno 2026', 'Próxima temporada')
on conflict do nothing;

insert into public.contactos (nombre, empresa, telefono, email)
select v.nombre, v.empresa, v.telefono, v.email
from (values
  ('Laura Martín', 'Textiles del Norte', '600 111 222', 'laura@textilesnorte.example'),
  ('Jorge Ruiz', 'Transportes Ruiz', '600 333 444', null)
) as v(nombre, empresa, telefono, email)
where not exists (select 1 from public.contactos c where c.nombre = v.nombre);

select (select count(*) from public.colecciones) as colecciones, (select count(*) from public.contactos) as contactos;
