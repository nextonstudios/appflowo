-- ============================================================
-- Flowo Teams — Funciones helper
-- Ejecutar UNA SOLA VEZ en Supabase:
--   Dashboard > SQL Editor > New query > pegar > Run
--
-- Este archivo es idempotente: puedes correrlo sin romper nada.
-- Requiere: equipos.sql y equipos_alteraciones.sql ejecutados antes.
-- Orden de ejecución: 4 de 5
-- ============================================================

-- ── _es_miembro_equipo ─────────────────────────────────────
-- Verifica si un usuario es miembro de un equipo.
-- Security definer para que las politicas RLS puedan usarla.
create or replace function public._es_miembro_equipo(
  p_equipo_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.equipo_miembros
    where equipo_id = p_equipo_id
      and user_id = p_user_id
  );
$$;

comment on function public._es_miembro_equipo is 'True si el usuario es miembro del equipo (cualquier rol)';

-- ── _es_admin_equipo ───────────────────────────────────────
-- Verifica si un usuario es admin del equipo (o el owner).
create or replace function public._es_admin_equipo(
  p_equipo_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.equipo_miembros em
    join public.equipos e on e.id = em.equipo_id
    where em.equipo_id = p_equipo_id
      and em.user_id = p_user_id
      and (em.rol = 'admin' or e.owner_id = p_user_id)
  );
$$;

comment on function public._es_admin_equipo is 'True si el usuario es admin del equipo o el owner';

-- ── _contar_miembros ───────────────────────────────────────
-- Cuenta los miembros actuales de un equipo.
create or replace function public._contar_miembros(p_equipo_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.equipo_miembros
  where equipo_id = p_equipo_id;
$$;

-- ── _puede_agregar_miembro ─────────────────────────────────
-- Verifica si el equipo tiene cupo disponible segun su plan.
create or replace function public._puede_agregar_miembro(p_equipo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.equipos
    where id = p_equipo_id
      and max_miembros > public._contar_miembros(p_equipo_id)
  );
$$;

comment on function public._puede_agregar_miembro is 'True si el equipo aun puede agregar miembros segun su limite de plan';

-- ── _mi_equipos ────────────────────────────────────────────
-- Lista los equipos a los que pertenece el usuario actual.
create or replace function public._mi_equipos(p_user_id uuid default auth.uid())
returns table (
  equipo_id uuid,
  nombre text,
  slug text,
  logo_url text,
  rol text,
  total_miembros integer,
  plan text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.nombre,
    e.slug,
    e.logo_url,
    em.rol,
    public._contar_miembros(e.id),
    e.plan
  from public.equipo_miembros em
  join public.equipos e on e.id = em.equipo_id
  where em.user_id = p_user_id
  order by em.joined_at;
$$;

comment on function public._mi_equipos is 'Equipos del usuario con su rol en cada uno. Para el selector de equipos del sidebar';

-- ── _calcular_horas_periodo ────────────────────────────────
-- Horas trabajadas por un miembro en un rango de fechas.
create or replace function public._calcular_horas_periodo(
  p_user_id uuid,
  p_equipo_id uuid,
  p_fecha_inicio date,
  p_fecha_fin date
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(duracion), 0) / 3600.0
  from public.registros_tiempo
  where user_id = p_user_id
    and equipo_id = p_equipo_id
    and fecha >= p_fecha_inicio
    and fecha <= p_fecha_fin;
$$;

comment on function public._calcular_horas_periodo is 'Suma de horas registradas (duracion esta en segundos, se convierte a horas)';

-- ── _calcular_deuda_periodo ────────────────────────────────
-- Cuanto se le debe a un miembro en un periodo.
-- Salario fijo: devuelve el salario completo.
-- Por horas: horas trabajadas x tarifa.
create or replace function public._calcular_deuda_periodo(
  p_user_id uuid,
  p_equipo_id uuid,
  p_fecha_inicio date,
  p_fecha_fin date
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case
    when cp.tipo_pago = 'fijo' then coalesce(cp.salario_mensual, 0)
    when cp.tipo_pago = 'horas' then
      round(public._calcular_horas_periodo(p_user_id, p_equipo_id, p_fecha_inicio, p_fecha_fin)
        * coalesce(cp.tarifa_hora, 0), 2)
    else 0
  end
  from public.equipo_configuracion_pago cp
  where cp.user_id = p_user_id
    and cp.equipo_id = p_equipo_id
    and cp.activo = true
  limit 1;
$$;

comment on function public._calcular_deuda_periodo is 'Monto a pagar al trabajador por el periodo. Si no hay configuracion de pago, devuelve null implicito';

-- ── _total_pagado_periodo ──────────────────────────────────
-- Total ya pagado a un miembro dentro de un periodo.
create or replace function public._total_pagado_periodo(
  p_user_id uuid,
  p_equipo_id uuid,
  p_fecha_inicio date,
  p_fecha_fin date
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(monto), 0)
  from public.equipo_pagos
  where user_id = p_user_id
    and equipo_id = p_equipo_id
    and estado = 'pagado'
    and fecha_pago >= p_fecha_inicio
    and fecha_pago <= p_fecha_fin;
$$;

-- ── _score_actividad_promedio ──────────────────────────────
-- Score promedio de actividad de un registro de tiempo.
create or replace function public._score_actividad_registro(p_registro_tiempo_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(round(avg(activity_score)), 0)::integer
  from public.registros_actividad
  where registro_tiempo_id = p_registro_tiempo_id;
$$;

-- ── Helpers anti-recursión RLS ─────────────────────────────
-- Los cruces tareas <-> tarea_asignaciones <-> proyectos NO deben
-- hacerse dentro de las políticas (causan 42P17 infinite recursion).
-- Se encapsulan en funciones SECURITY DEFINER: sus lecturas internas
-- no disparan el RLS de otras tablas.

-- Proyecto al que pertenece una tarea
create or replace function public._proyecto_de_tarea(p_tarea_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.proyecto_id from public.tareas t where t.id = p_tarea_id;
$$;

comment on function public._proyecto_de_tarea(uuid) is 'proyecto_id de una tarea (definer: evita recursion RLS tareas<->tarea_asignaciones)';

-- ¿El usuario actual está asignado a la tarea?
create or replace function public._asignado_a(p_tarea_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tarea_asignaciones ta
    where ta.tarea_id = p_tarea_id
      and ta.user_id = auth.uid()
  );
$$;

comment on function public._asignado_a(uuid) is 'True si auth.uid() tiene asignacion en la tarea';

-- ¿El usuario actual creó la tarea?
create or replace function public._es_creador_de_tarea(p_tarea_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tareas t
    where t.id = p_tarea_id
      and t.user_id = auth.uid()
  );
$$;

comment on function public._es_creador_de_tarea(uuid) is 'True si auth.uid() es el creador (user_id) de la tarea';

-- ¿El proyecto pertenece a un equipo donde soy miembro?
create or replace function public._proyecto_en_mi_equipo(p_proyecto_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.proyectos p
    where p.id = p_proyecto_id
      and p.equipo_id is not null
      and public._es_miembro_equipo(p.equipo_id)
  );
$$;

comment on function public._proyecto_en_mi_equipo(uuid) is 'True si el proyecto es de un equipo donde soy miembro';

-- ¿Puedo VER el proyecto de equipo? (respeta proyectos privados)
create or replace function public._puede_ver_proyecto_equipo(p_proyecto_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.proyectos p
    where p.id = p_proyecto_id
      and p.equipo_id is not null
      and public._es_miembro_equipo(p.equipo_id)
      and (
        p.es_privado = false
        or p.created_by = auth.uid()
        or p.user_id = auth.uid()
        or public._es_admin_equipo(p.equipo_id)
      )
  );
$$;

comment on function public._puede_ver_proyecto_equipo(uuid) is 'True si puedo ver el proyecto de equipo (publico, o privado siendo creador/admin)';

-- ¿Soy admin del equipo al que pertenece el proyecto?
create or replace function public._admin_del_proyecto_equipo(p_proyecto_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.proyectos p
    where p.id = p_proyecto_id
      and p.equipo_id is not null
      and public._es_admin_equipo(p.equipo_id)
  );
$$;

comment on function public._admin_del_proyecto_equipo(uuid) is 'True si soy admin del equipo del proyecto';

-- ── Permisos de ejecucion ──────────────────────────────────
grant execute on function public._es_miembro_equipo(uuid, uuid) to authenticated;
grant execute on function public._es_admin_equipo(uuid, uuid) to authenticated;
grant execute on function public._contar_miembros(uuid) to authenticated;
grant execute on function public._puede_agregar_miembro(uuid) to authenticated;
grant execute on function public._mi_equipos(uuid) to authenticated;
grant execute on function public._calcular_horas_periodo(uuid, uuid, date, date) to authenticated;
grant execute on function public._calcular_deuda_periodo(uuid, uuid, date, date) to authenticated;
grant execute on function public._total_pagado_periodo(uuid, uuid, date, date) to authenticated;
grant execute on function public._score_actividad_registro(uuid) to authenticated;
grant execute on function public._proyecto_de_tarea(uuid) to authenticated;
grant execute on function public._asignado_a(uuid) to authenticated;
grant execute on function public._es_creador_de_tarea(uuid) to authenticated;
grant execute on function public._proyecto_en_mi_equipo(uuid) to authenticated;
grant execute on function public._puede_ver_proyecto_equipo(uuid) to authenticated;
grant execute on function public._admin_del_proyecto_equipo(uuid) to authenticated;
