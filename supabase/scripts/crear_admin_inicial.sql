-- =====================================================================
-- Convierte en administrador al primer usuario.
--
-- 1. En el panel de Supabase: Authentication > Users > "Add user" >
--    "Create new user", con tu email y una contraseña, marcando
--    "Auto Confirm User".
-- 2. Cambia el email de abajo y ejecuta este script en el SQL Editor.
-- =====================================================================

update public.perfiles
set rol_id = 'admin',
    nombre_completo = coalesce(nullif(nombre_completo, ''), 'Administrador')
where email = lower('tu-email@empresa.com');

-- Debe devolver una fila con rol_id = 'admin'
select id, email, nombre_completo, rol_id, activo
from public.perfiles
where rol_id = 'admin';
