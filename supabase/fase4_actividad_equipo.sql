-- ============================================================
-- Flowo Teams — FASE 4: Actividad y anti-fraude (RPCs de lectura)
--
-- Las tablas (registros_actividad, alertas_actividad) y sus RLS ya
-- existen desde el instalador v2 (PARTE 2). Aquí solo agregamos las
-- funciones agregadas que consume el panel "Actividad" de admins.
--
-- Idempotente. Correr en Supabase SQL Editor.
-- ============================================================

-- ── _actividad_equipo ──────────────────────────────────────
-- Resumen por miembro para los últimos N días:
-- horas registradas vs horas reales, score promedio y alertas.
-- Solo admins del equipo obtienen datos (otros reciben vacío).
create or replace function public._actividad_equipo(
  p_equipo_id uuid,
  p_dias integer default 7
)
returns table (
  user_id uuid,
  nombre text,
  email text,
  rol text,
  horas_registradas numeric,
  horas_reales numeric,
  score_promedio integer,
  alertas_total bigint,
  alertas_sin_responder bigint,
  pausas_automaticas bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public._es_admin_equipo(p_equipo_id) then
    return;
  end if;

  return query
  select
    m.user_id,
    m.nombre,
    m.email,
    m.rol::text,
    coalesce(tot.hrs, 0)::numeric,
    coalesce(tot.reales, 0)::numeric,
    coalesce(tot.score, 0)::integer,
    coalesce(al.total, 0)::bigint,
    coalesce(al.sin_resp, 0)::bigint,
    coalesce(al.pausas, 0)::bigint
  from public.equipo_miembros m
  left join lateral (
    select
      sum(r.duracion) / 3600.0          as hrs,
      sum(r.horas_reales) / 3600.0      as reales,
      round(avg(r.activity_score))      as score
    from public.registros_tiempo r
    where r.user_id = m.user_id
      and r.equipo_id = p_equipo_id
      and r.fecha >= (current_date - p_dias)
  ) tot on true
  left join lateral (
    select
      count(*)                                              as total,
      count(*) filter (where al.respondida_en is null)      as sin_resp,
      count(*) filter (where al.pausada_automaticamente)    as pausas
    from public.alertas_actividad al
    where al.user_id = m.user_id
      and al.equipo_id = p_equipo_id
      and al.enviada_en >= now() - make_interval(days => p_dias)
  ) al on true
  where m.equipo_id = p_equipo_id
    and m.estado = 'activo'
  order by m.nombre;
end;
$$;

comment on function public._actividad_equipo(uuid, integer) is
  'Resumen anti-fraude por miembro (admins): horas registradas/reales, score y alertas';

-- ── _alertas_recientes_equipo ──────────────────────────────
-- Últimas alertas "¿Sigues trabajando?" con su respuesta.
create or replace function public._alertas_recientes_equipo(
  p_equipo_id uuid,
  p_limite integer default 20
)
returns table (
  id uuid,
  user_id uuid,
  nombre text,
  enviada_en timestamptz,
  respondida_en timestamptz,
  respuesta text,
  pausada_automaticamente boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    al.id,
    al.user_id,
    m.nombre,
    al.enviada_en,
    al.respondida_en,
    al.respuesta,
    al.pausada_automaticamente
  from public.alertas_actividad al
  join public.equipo_miembros m
    on m.user_id = al.user_id and m.equipo_id = al.equipo_id
  where al.equipo_id = p_equipo_id
    and public._es_admin_equipo(p_equipo_id)
  order by al.enviada_en desc
  limit p_limite;
$$;

comment on function public._alertas_recientes_equipo(uuid, integer) is
  'Últimas alertas de actividad del equipo (solo admins)';

grant execute on function public._actividad_equipo(uuid, integer) to authenticated;
grant execute on function public._alertas_recientes_equipo(uuid, integer) to authenticated;
