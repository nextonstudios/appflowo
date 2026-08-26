-- ============================================================
-- Flowo Teams - RPCs de equipos (PARTE 6 extraida)
-- crear_equipo / _miembros_equipo / _mis_invitaciones
-- Idempotente. Ejecutar en SQL Editor.
-- ============================================================

-- PARTE 6: RPCs de equipos
-- ============================================================

-- ── crear_equipo ───────────────────────────────────────────
-- Crea el equipo + membresia owner(admin) + config por defecto.
-- Es security definer y atomica porque la politica RLS de
-- equipo_miembros exige ser admin para insertar, pero al crear
-- un equipo nuevo nadie es miembro todavia (deadlock sin RPC).
create or replace function public.crear_equipo(
  p_nombre text,
  p_moneda text default 'USD',
  p_region text default 'global'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_slug text;
begin
  if p_nombre is null or length(trim(p_nombre)) < 2 then
    raise exception 'nombre_invalido';
  end if;

  -- Slug unico a partir del nombre
  v_slug := lower(regexp_replace(trim(p_nombre), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := regexp_replace(v_slug, '^-+|-+$', '', 'g');
  if v_slug is null or length(v_slug) = 0 then
    v_slug := 'equipo';
  end if;
  if length(v_slug) > 40 then
    v_slug := left(v_slug, 40);
  end if;
  if exists (select 1 from public.equipos where slug = v_slug) then
    v_slug := v_slug || '-' || substr(encode(gen_random_bytes(3), 'hex'), 1, 4);
  end if;

  insert into public.equipos (nombre, slug, owner_id, moneda, plan_region)
  values (trim(p_nombre), v_slug, auth.uid(), p_moneda, p_region)
  returning id into v_id;

  insert into public.equipo_miembros (equipo_id, user_id, rol)
  values (v_id, auth.uid(), 'admin');

  insert into public.equipo_config (equipo_id) values (v_id);

  return v_id;
end;
$$;

comment on function public.crear_equipo is 'Crea equipo + membresia admin del owner + config. Atomica. Devuelve el id del equipo';

grant execute on function public.crear_equipo(text, text, text) to authenticated;

-- ── _miembros_equipo ───────────────────────────────────────
-- Lista de miembros con nombre/email resolviendo auth.users.
-- Necesaria porque perfiles es privado por usuario (RLS propio)
-- y los miembros del equipo necesitan verse entre si.
create or replace function public._miembros_equipo(p_equipo_id uuid)
returns table (
  user_id uuid,
  rol text,
  custom_role_id uuid,
  nombre text,
  email text,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    em.user_id,
    em.rol,
    em.custom_role_id,
    coalesce(
      nullif(u.raw_user_meta_data->>'nombre', ''),
      split_part(coalesce(u.email, ''), '@', 1),
      'Miembro'
    ) as nombre,
    u.email,
    em.joined_at
  from public.equipo_miembros em
  join auth.users u on u.id = em.user_id
  where em.equipo_id = p_equipo_id
    and public._es_miembro_equipo(p_equipo_id, auth.uid())
  order by em.joined_at;
$$;

comment on function public._miembros_equipo is 'Miembros del equipo con nombre/email. Solo accesible para miembros del equipo';

grant execute on function public._miembros_equipo(uuid) to authenticated;

-- ── _mis_invitaciones ──────────────────────────────────────
-- Invitaciones pendientes dirigidas al email del usuario actual.
-- Permite mostrar en la app "Te invitaron a X" sin dar acceso
-- general a la tabla de invitaciones.
create or replace function public._mis_invitaciones()
returns table (
  id uuid,
  equipo_id uuid,
  rol text,
  token text,
  equipo_nombre text,
  equipo_logo text,
  invited_by_nombre text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.id,
    i.equipo_id,
    i.rol,
    i.token,
    e.nombre as equipo_nombre,
    e.logo_url as equipo_logo,
    coalesce(
      nullif(u.raw_user_meta_data->>'nombre', ''),
      split_part(coalesce(u.email, ''), '@', 1)
    ) as invited_by_nombre,
    i.expires_at
  from public.equipo_invitaciones i
  join public.equipos e on e.id = i.equipo_id
  left join auth.users u on u.id = i.invited_by
  where lower(i.email) = lower(coalesce(auth.email(), ''))
    and i.accepted_at is null
    and i.expires_at > now();
$$;

comment on function public._mis_invitaciones is 'Invitaciones vigentes pendientes para el email del usuario autenticado';

grant execute on function public._mis_invitaciones() to authenticated;
