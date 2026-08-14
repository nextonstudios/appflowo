-- ============================================================
-- Eliminar cuenta de Flowo
-- Ejecutar UNA SOLA VEZ en Supabase:
--   Dashboard > SQL Editor > New query > pegar > Run
--
-- Crea una función que la app llama (supabase.rpc("eliminar_cuenta"))
-- cuando el usuario confirma "Eliminar cuenta".
-- Borra todos los datos del usuario y el usuario de auth.
-- ============================================================

create or replace function public.eliminar_cuenta()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'No autorizado';
  end if;

  -- Hijos primero (por si hay llaves foráneas sin ON DELETE CASCADE)
  delete from public.registros_tiempo where user_id = uid;
  delete from public.tareas where user_id = uid;
  delete from public.facturas where user_id = uid;
  delete from public.portal_mensajes
    where proyecto_id in (select id from public.proyectos where user_id = uid);
  delete from public.portal_tokens
    where cliente_id in (select id from public.clientes where user_id = uid);

  -- Padres
  delete from public.proyectos where user_id = uid;
  delete from public.clientes where user_id = uid;
  delete from public.integraciones where user_id = uid;
  delete from public.perfiles where user_id = uid;

  -- Por último, el usuario
  delete from auth.users where id = uid;
end;
$$;

grant execute on function public.eliminar_cuenta() to authenticated;
