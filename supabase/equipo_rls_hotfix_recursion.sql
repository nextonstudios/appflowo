-- ============================================================
-- Flowo Teams — HOTFIX: recursión infinita en políticas RLS
-- ------------------------------------------------------------
-- Síntoma: las tareas desaparecen de la app (error silenciado).
-- Error real: 42P17 - infinite recursion detected in policy
--   for relation "tareas"
--
-- Causa: la política de SELECT en tareas consultaba
--   tarea_asignaciones directamente, y las políticas de
--   tarea_asignaciones volvían a consultar tareas => ciclo.
--
-- Solución (patrón oficial Supabase): mover TODOS los cruces
-- entre tablas a funciones SECURITY DEFINER. Al ejecutarse como
-- dueño, sus lecturas internas no disparan el RLS de otras
-- tablas y la cadena de evaluación se corta.
--
-- Idempotente: puedes correrlo varias veces sin romper nada.
-- Ejecutar: Dashboard > SQL Editor > New query > pegar > Run
-- ============================================================

-- ── Funciones helper (SECURITY DEFINER) ─────────────────────

-- Proyecto al que pertenece una tarea
create or replace function public._proyecto_de_tarea(p_tarea_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select t.proyecto_id from public.tareas t where t.id = p_tarea_id;
$$;

comment on function public._proyecto_de_tarea(uuid) is 'proyecto_id de una tarea (definer: evita recursion RLS tareas<->tarea_asignaciones)';

-- ¿El usuario actual está asignado a la tarea?
create or replace function public._asignado_a(p_tarea_id uuid)
returns boolean
language sql stable security definer set search_path = public
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
language sql stable security definer set search_path = public
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
language sql stable security definer set search_path = public
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
language sql stable security definer set search_path = public
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
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.proyectos p
    where p.id = p_proyecto_id
      and p.equipo_id is not null
      and public._es_admin_equipo(p.equipo_id)
  );
$$;

comment on function public._admin_del_proyecto_equipo(uuid) is 'True si soy admin del equipo del proyecto';

grant execute on function public._proyecto_de_tarea(uuid) to authenticated;
grant execute on function public._asignado_a(uuid) to authenticated;
grant execute on function public._es_creador_de_tarea(uuid) to authenticated;
grant execute on function public._proyecto_en_mi_equipo(uuid) to authenticated;
grant execute on function public._puede_ver_proyecto_equipo(uuid) to authenticated;
grant execute on function public._admin_del_proyecto_equipo(uuid) to authenticated;

-- ── Políticas corregidas: TAREAS (sin lectura cruda de
--    tarea_asignaciones) ──────────────────────────────────────

drop policy if exists "tareas_equipo_select" on public.tareas;
create policy "tareas_equipo_select"
  on public.tareas for select to authenticated
  using (
    user_id = auth.uid()
    or public._puede_ver_proyecto_equipo(tareas.proyecto_id)
    or public._asignado_a(tareas.id)
  );

drop policy if exists "tareas_equipo_insert" on public.tareas;
create policy "tareas_equipo_insert"
  on public.tareas for insert to authenticated
  with check (
    user_id = auth.uid()
    or public._proyecto_en_mi_equipo(tareas.proyecto_id)
  );

drop policy if exists "tareas_equipo_update" on public.tareas;
create policy "tareas_equipo_update"
  on public.tareas for update to authenticated
  using (
    user_id = auth.uid()
    or public._proyecto_en_mi_equipo(tareas.proyecto_id)
  );

drop policy if exists "tareas_equipo_delete" on public.tareas;
create policy "tareas_equipo_delete"
  on public.tareas for delete to authenticated
  using (
    user_id = auth.uid()
    or public._admin_del_proyecto_equipo(tareas.proyecto_id)
  );

-- ── Políticas corregidas: TAREA_ASIGNACIONES (sin lectura
--    cruda de tareas) ────────────────────────────────────────

drop policy if exists "tarea_asignaciones_select" on public.tarea_asignaciones;
create policy "tarea_asignaciones_select"
  on public.tarea_asignaciones for select to authenticated
  using (
    user_id = auth.uid()
    or public._proyecto_en_mi_equipo(
         public._proyecto_de_tarea(tarea_asignaciones.tarea_id)
       )
  );

drop policy if exists "tarea_asignaciones_insert" on public.tarea_asignaciones;
create policy "tarea_asignaciones_insert"
  on public.tarea_asignaciones for insert to authenticated
  with check (
    public._proyecto_en_mi_equipo(
      public._proyecto_de_tarea(tarea_asignaciones.tarea_id)
    )
    or public._es_creador_de_tarea(tarea_asignaciones.tarea_id)
  );

drop policy if exists "tarea_asignaciones_delete" on public.tarea_asignaciones;
create policy "tarea_asignaciones_delete"
  on public.tarea_asignaciones for delete to authenticated
  using (
    public._proyecto_en_mi_equipo(
      public._proyecto_de_tarea(tarea_asignaciones.tarea_id)
    )
    or user_id = auth.uid()
  );

-- NOTA: la verificación se hace en un script APARTE después de este
-- (ver equipo_verificacion_post_hotfix.sql). Aquí NO va ningún bloque
-- begin/rollback: dentro de la transacción del SQL Editor haría
-- rollback de TODA la migración.

-- Recargar cache de PostgREST
notify pgrst, 'reload schema';
