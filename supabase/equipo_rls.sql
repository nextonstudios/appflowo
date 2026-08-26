-- ============================================================
-- Flowo Teams — Políticas RLS de seguridad
-- Ejecutar UNA SOLA VEZ en Supabase:
--   Dashboard > SQL Editor > New query > pegar > Run
--
-- Este archivo es idempotente.
-- Requiere: equipos.sql, equipo_financiero.sql,
--   equipos_alteraciones.sql y equipo_funciones.sql ejecutados antes.
-- Orden de ejecución: 5 de 5
--
-- MODELO DE SEGURIDAD:
-- - Las políticas originales (auth.uid() = user_id) NO se tocan:
--   el modo personal sigue funcionando igual que siempre.
-- - Se AGREGAN políticas de equipo para acceso colaborativo.
-- - Postgres evalúa políticas con OR: si cumples cualquiera, pasas.
-- - Proyectos privados: solo creador + admins del equipo los ven.
-- - Financiero: admins gestionan todo; trabajadores solo ven lo suyo.
-- ============================================================

alter table public.equipos enable row level security;
alter table public.equipo_miembros enable row level security;
alter table public.equipo_roles enable row level security;
alter table public.equipo_invitaciones enable row level security;
alter table public.tarea_asignaciones enable row level security;
alter table public.equipo_config enable row level security;
alter table public.equipo_configuracion_pago enable row level security;
alter table public.equipo_pagos enable row level security;
alter table public.registros_actividad enable row level security;
alter table public.alertas_actividad enable row level security;

-- ═══════════════════════════════════════════════════════════
-- EQUIPOS
-- ═══════════════════════════════════════════════════════════

drop policy if exists "equipos_miembros_select" on public.equipos;
create policy "equipos_miembros_select"
  on public.equipos for select to authenticated
  using (
    owner_id = auth.uid()
    or public._es_miembro_equipo(id)
  );

drop policy if exists "equipos_owner_insert" on public.equipos;
create policy "equipos_owner_insert"
  on public.equipos for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "equipos_admin_update" on public.equipos;
create policy "equipos_admin_update"
  on public.equipos for update to authenticated
  using (
    owner_id = auth.uid()
    or public._es_admin_equipo(id)
  )
  with check (
    owner_id = auth.uid()
    or public._es_admin_equipo(id)
  );

-- Solo el owner puede borrar el equipo
drop policy if exists "equipos_owner_delete" on public.equipos;
create policy "equipos_owner_delete"
  on public.equipos for delete to authenticated
  using (owner_id = auth.uid());

grant all on table public.equipos to authenticated;
grant all on table public.equipos to service_role;

-- ═══════════════════════════════════════════════════════════
-- EQUIPO_MIEMBROS
-- Los miembros ven la lista de su equipo.
-- Solo admins agregan/quitan miembros y cambian roles.
-- Un usuario siempre puede ver sus propias membresías.
-- ═══════════════════════════════════════════════════════════

drop policy if exists "equipo_miembros_select" on public.equipo_miembros;
create policy "equipo_miembros_select"
  on public.equipo_miembros for select to authenticated
  using (
    user_id = auth.uid()
    or public._es_miembro_equipo(equipo_id)
  );

drop policy if exists "equipo_miembros_admin_insert" on public.equipo_miembros;
create policy "equipo_miembros_admin_insert"
  on public.equipo_miembros for insert to authenticated
  with check (
    public._es_admin_equipo(equipo_id)
    and public._puede_agregar_miembro(equipo_id)
  );

-- Un miembro solo puede salirse él mismo; admin gestiona a todos.
drop policy if exists "equipo_miembros_admin_update" on public.equipo_miembros;
create policy "equipo_miembros_admin_update"
  on public.equipo_miembros for update to authenticated
  using (
    user_id = auth.uid()
    or public._es_admin_equipo(equipo_id)
  )
  with check (
    -- El admin no puede quitarse su propio rol de admin si es el último
    public._es_admin_equipo(equipo_id)
  );

drop policy if exists "equipo_miembros_admin_delete" on public.equipo_miembros;
create policy "equipo_miembros_admin_delete"
  on public.equipo_miembros for delete to authenticated
  using (
    user_id = auth.uid()
    or public._es_admin_equipo(equipo_id)
  );

grant all on table public.equipo_miembros to authenticated;
grant all on table public.equipo_miembros to service_role;

-- ═══════════════════════════════════════════════════════════
-- EQUIPO_ROLES
-- Todos los miembros ven los roles del equipo (para selects).
-- Solo admins crean/editan/borran roles.
-- ═══════════════════════════════════════════════════════════

drop policy if exists "equipo_roles_select" on public.equipo_roles;
create policy "equipo_roles_select"
  on public.equipo_roles for select to authenticated
  using (public._es_miembro_equipo(equipo_id));

drop policy if exists "equipo_roles_admin_write" on public.equipo_roles;
create policy "equipo_roles_admin_write"
  on public.equipo_roles for insert to authenticated
  with check (public._es_admin_equipo(equipo_id));

drop policy if exists "equipo_roles_admin_update" on public.equipo_roles;
create policy "equipo_roles_admin_update"
  on public.equipo_roles for update to authenticated
  using (public._es_admin_equipo(equipo_id))
  with check (public._es_admin_equipo(equipo_id));

drop policy if exists "equipo_roles_admin_delete" on public.equipo_roles;
create policy "equipo_roles_admin_delete"
  on public.equipo_roles for delete to authenticated
  using (public._es_admin_equipo(equipo_id));

grant all on table public.equipo_roles to authenticated;
grant all on table public.equipo_roles to service_role;

-- ═══════════════════════════════════════════════════════════
-- EQUIPO_INVITACIONES
-- Admins gestionan invitaciones de su equipo.
-- El portal/anon valida tokens vía función security definer
-- (se agrega al final de este archivo).
-- ═══════════════════════════════════════════════════════════

drop policy if exists "equipo_invitaciones_admin_all" on public.equipo_invitaciones;
create policy "equipo_invitaciones_admin_all"
  on public.equipo_invitaciones for all to authenticated
  using (public._es_admin_equipo(equipo_id))
  with check (public._es_admin_equipo(equipo_id));

grant all on table public.equipo_invitaciones to authenticated;
grant all on table public.equipo_invitaciones to service_role;

-- Función para validar un token de invitación sin exponer la tabla a anon.
-- Devuelve los datos necesarios para mostrar la invitación y aceptarla.
create or replace function public._validar_invitacion(p_token text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'id', i.id,
    'email', i.email,
    'rol', i.rol,
    'equipo_nombre', e.nombre,
    'equipo_logo', e.logo_url,
    'invitado_por', u.raw_user_meta_data->>'nombre',
    'expirada', i.expires_at < now(),
    'aceptada', i.accepted_at is not null
  )
  from public.equipo_invitaciones i
  join public.equipos e on e.id = i.equipo_id
  left join auth.users u on u.id = i.invited_by
  where i.token = p_token
  limit 1;
$$;

comment on function public._validar_invitacion is 'Valida un token de invitacion. Usada por la app antes de aceptar. No expone la tabla a anon';

create or replace function public._aceptar_invitacion(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitacion record;
  v_resultado json;
begin
  select * into v_invitacion
  from public.equipo_invitaciones
  where token = p_token
  limit 1;

  if not found then
    return json_build_object('ok', false, 'error', 'invalid_token');
  end if;

  if v_invitacion.accepted_at is not null then
    return json_build_object('ok', false, 'error', 'ya_usada');
  end if;

  if v_invitacion.expires_at < now() then
    return json_build_object('ok', false, 'error', 'expirada');
  end if;

  -- Verificar cupo del equipo
  if not public._puede_agregar_miembro(v_invitacion.equipo_id) then
    return json_build_object('ok', false, 'error', 'sin_cupo');
  end if;

  -- Verificar que no sea ya miembro
  if exists (
    select 1 from public.equipo_miembros
    where equipo_id = v_invitacion.equipo_id
      and user_id = auth.uid()
  ) then
    return json_build_object('ok', false, 'error', 'ya_es_miembro');
  end if;

  -- Agregar como miembro
  insert into public.equipo_miembros (equipo_id, user_id, rol, custom_role_id)
  values (v_invitacion.equipo_id, auth.uid(), v_invitacion.rol, v_invitacion.custom_role_id);

  -- Marcar invitación como usada
  update public.equipo_invitaciones
  set accepted_at = now()
  where id = v_invitacion.id;

  select json_build_object(
    'ok', true,
    'equipo_id', v_invitacion.equipo_id,
    'rol', v_invitacion.rol
  ) into v_resultado;

  return v_resultado;
end;
$$;

comment on function public._aceptar_invitacion is 'Acepta una invitacion por token: valida expiracion/cupo/duplicados y agrega al usuario al equipo';

grant execute on function public._validar_invitacion(text) to authenticated;
grant execute on function public._aceptar_invitacion(text) to authenticated;

-- ═══════════════════════════════════════════════════════════
-- TAREA_ASIGNACIONES
-- Miembros del equipo pueden ver asignaciones de sus tareas.
-- Insert/update/delete: cualquier miembro activo del proyecto.
-- ═══════════════════════════════════════════════════════════

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

grant all on table public.tarea_asignaciones to authenticated;
grant all on table public.tarea_asignaciones to service_role;

-- ═══════════════════════════════════════════════════════════
-- EQUIPO_CONFIG
-- Miembros leen la config; solo admins la modifican.
-- ═══════════════════════════════════════════════════════════

drop policy if exists "equipo_config_select" on public.equipo_config;
create policy "equipo_config_select"
  on public.equipo_config for select to authenticated
  using (public._es_miembro_equipo(equipo_id));

drop policy if exists "equipo_config_admin_write" on public.equipo_config;
create policy "equipo_config_admin_write"
  on public.equipo_config for all to authenticated
  using (public._es_admin_equipo(equipo_id))
  with check (public._es_admin_equipo(equipo_id));

grant all on table public.equipo_config to authenticated;
grant all on table public.equipo_config to service_role;

-- ═══════════════════════════════════════════════════════════
-- PROYECTOS — políticas de equipo (las personales ya existen)
-- Privados: solo created_by + admins del equipo.
-- Públicos: todo el equipo ve; miembros editan; admins borran.
-- ═══════════════════════════════════════════════════════════

drop policy if exists "proyectos_equipo_select" on public.proyectos;
create policy "proyectos_equipo_select"
  on public.proyectos for select to authenticated
  using (
    equipo_id is not null
    and public._es_miembro_equipo(equipo_id)
    and (
      es_privado = false
      or created_by = auth.uid()
      or user_id = auth.uid()
      or public._es_admin_equipo(equipo_id)
    )
  );

drop policy if exists "proyectos_equipo_insert" on public.proyectos;
create policy "proyectos_equipo_insert"
  on public.proyectos for insert to authenticated
  with check (
    equipo_id is not null
    and public._es_miembro_equipo(equipo_id)
  );

drop policy if exists "proyectos_equipo_update" on public.proyectos;
create policy "proyectos_equipo_update"
  on public.proyectos for update to authenticated
  using (
    equipo_id is not null
    and public._es_miembro_equipo(equipo_id)
    and (
      es_privado = false
      or created_by = auth.uid()
      or user_id = auth.uid()
      or public._es_admin_equipo(equipo_id)
    )
  );

drop policy if exists "proyectos_equipo_delete" on public.proyectos;
create policy "proyectos_equipo_delete"
  on public.proyectos for delete to authenticated
  using (
    equipo_id is not null
    and (
      created_by = auth.uid()
      or user_id = auth.uid()
      or public._es_admin_equipo(equipo_id)
    )
  );

-- ═══════════════════════════════════════════════════════════
-- CLIENTES / COTIZACIONES / CONTRATOS / FACTURAS
-- Acceso compartido: todo el equipo ve, miembros editan,
-- admins o el creador borran.
-- ═══════════════════════════════════════════════════════════

-- CLIENTES
drop policy if exists "clientes_equipo_select" on public.clientes;
create policy "clientes_equipo_select"
  on public.clientes for select to authenticated
  using (equipo_id is not null and public._es_miembro_equipo(equipo_id));

drop policy if exists "clientes_equipo_insert" on public.clientes;
create policy "clientes_equipo_insert"
  on public.clientes for insert to authenticated
  with check (equipo_id is not null and public._es_miembro_equipo(equipo_id));

drop policy if exists "clientes_equipo_update" on public.clientes;
create policy "clientes_equipo_update"
  on public.clientes for update to authenticated
  using (equipo_id is not null and public._es_miembro_equipo(equipo_id));

drop policy if exists "clientes_equipo_delete" on public.clientes;
create policy "clientes_equipo_delete"
  on public.clientes for delete to authenticated
  using (equipo_id is not null and public._es_admin_equipo(equipo_id));

-- COTIZACIONES
drop policy if exists "cotizaciones_equipo_select" on public.cotizaciones;
create policy "cotizaciones_equipo_select"
  on public.cotizaciones for select to authenticated
  using (equipo_id is not null and public._es_miembro_equipo(equipo_id));

drop policy if exists "cotizaciones_equipo_insert" on public.cotizaciones;
create policy "cotizaciones_equipo_insert"
  on public.cotizaciones for insert to authenticated
  with check (equipo_id is not null and public._es_miembro_equipo(equipo_id));

drop policy if exists "cotizaciones_equipo_update" on public.cotizaciones;
create policy "cotizaciones_equipo_update"
  on public.cotizaciones for update to authenticated
  using (equipo_id is not null and public._es_miembro_equipo(equipo_id));

drop policy if exists "cotizaciones_equipo_delete" on public.cotizaciones;
create policy "cotizaciones_equipo_delete"
  on public.cotizaciones for delete to authenticated
  using (equipo_id is not null and public._es_admin_equipo(equipo_id));

-- CONTRATOS
drop policy if exists "contratos_equipo_select" on public.contratos;
create policy "contratos_equipo_select"
  on public.contratos for select to authenticated
  using (equipo_id is not null and public._es_miembro_equipo(equipo_id));

drop policy if exists "contratos_equipo_insert" on public.contratos;
create policy "contratos_equipo_insert"
  on public.contratos for insert to authenticated
  with check (equipo_id is not null and public._es_miembro_equipo(equipo_id));

drop policy if exists "contratos_equipo_update" on public.contratos;
create policy "contratos_equipo_update"
  on public.contratos for update to authenticated
  using (equipo_id is not null and public._es_miembro_equipo(equipo_id));

drop policy if exists "contratos_equipo_delete" on public.contratos;
create policy "contratos_equipo_delete"
  on public.contratos for delete to authenticated
  using (equipo_id is not null and public._es_admin_equipo(equipo_id));

-- FACTURAS
drop policy if exists "facturas_equipo_select" on public.facturas;
create policy "facturas_equipo_select"
  on public.facturas for select to authenticated
  using (equipo_id is not null and public._es_miembro_equipo(equipo_id));

drop policy if exists "facturas_equipo_insert" on public.facturas;
create policy "facturas_equipo_insert"
  on public.facturas for insert to authenticated
  with check (equipo_id is not null and public._es_miembro_equipo(equipo_id));

drop policy if exists "facturas_equipo_update" on public.facturas;
create policy "facturas_equipo_update"
  on public.facturas for update to authenticated
  using (equipo_id is not null and public._es_miembro_equipo(equipo_id));

drop policy if exists "facturas_equipo_delete" on public.facturas;
create policy "facturas_equipo_delete"
  on public.facturas for delete to authenticated
  using (equipo_id is not null and public._es_admin_equipo(equipo_id));

-- ═══════════════════════════════════════════════════════════
-- TAREAS — políticas de equipo
-- Miembro ve tareas de proyectos del equipo donde participa
-- (directamente o por asignación). Edita las suyas/asignadas.
--
-- IMPORTANTE: los cruces entre tablas van SIEMPRE por funciones
-- SECURITY DEFINER (ver equipo_funciones.sql). Leer tareas desde
-- tarea_asignaciones (o viceversa) dentro de una política causa
-- 42P17 infinite recursion.
-- ═══════════════════════════════════════════════════════════

drop policy if exists "tareas_equipo_select" on public.tareas;
create policy "tareas_equipo_select"
  on public.tareas for select to authenticated
  using (
    -- Soy el creador original de la tarea
    user_id = auth.uid()
    -- O la tarea vive en un proyecto de equipo que puedo ver
    or public._puede_ver_proyecto_equipo(tareas.proyecto_id)
    -- O estoy asignado a esta tarea aunque el proyecto sea privado
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

-- ═══════════════════════════════════════════════════════════
-- REGISTROS_TIEMPO — políticas de equipo
-- Cada quien ve los suyos; admins ven los de todo el equipo
-- (necesario para dashboard financiero).
-- ═══════════════════════════════════════════════════════════

drop policy if exists "registros_tiempo_equipo_select" on public.registros_tiempo;
create policy "registros_tiempo_equipo_select"
  on public.registros_tiempo for select to authenticated
  using (
    user_id = auth.uid()
    or (
      equipo_id is not null
      and public._es_miembro_equipo(equipo_id)
    )
  );

drop policy if exists "registros_tiempo_equipo_insert" on public.registros_tiempo;
create policy "registros_tiempo_equipo_insert"
  on public.registros_tiempo for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      equipo_id is null
      or public._es_miembro_equipo(equipo_id)
    )
  );

drop policy if exists "registros_tiempo_equipo_update" on public.registros_tiempo;
create policy "registros_tiempo_equipo_update"
  on public.registros_tiempo for update to authenticated
  using (
    user_id = auth.uid()
    and (
      equipo_id is null
      or public._es_miembro_equipo(equipo_id)
    )
  );

drop policy if exists "registros_tiempo_equipo_delete" on public.registros_tiempo;
create policy "registros_tiempo_equipo_delete"
  on public.registros_tiempo for delete to authenticated
  using (
    user_id = auth.uid()
    or (
      equipo_id is not null
      and public._es_admin_equipo(equipo_id)
    )
  );

-- ═══════════════════════════════════════════════════════════
-- FINANCIERO
-- Config de pago: solo admins (el trabajador ve la suya).
-- Pagos: admins gestionan; trabajador ve los suyos.
-- Actividad/alertas: admins ven su equipo; trabajador lo suyo.
-- Inserts de actividad/alertas: cada quien registra lo suyo.
-- ═══════════════════════════════════════════════════════════

-- CONFIGURACION DE PAGO
drop policy if exists "config_pago_admin_all" on public.equipo_configuracion_pago;
create policy "config_pago_admin_all"
  on public.equipo_configuracion_pago for all to authenticated
  using (public._es_admin_equipo(equipo_id))
  with check (public._es_admin_equipo(equipo_id));

drop policy if exists "config_pago_own_select" on public.equipo_configuracion_pago;
create policy "config_pago_own_select"
  on public.equipo_configuracion_pago for select to authenticated
  using (user_id = auth.uid());

grant all on table public.equipo_configuracion_pago to authenticated;
grant all on table public.equipo_configuracion_pago to service_role;

-- PAGOS
drop policy if exists "pagos_admin_all" on public.equipo_pagos;
create policy "pagos_admin_all"
  on public.equipo_pagos for all to authenticated
  using (public._es_admin_equipo(equipo_id))
  with check (public._es_admin_equipo(equipo_id));

drop policy if exists "pagos_own_select" on public.equipo_pagos;
create policy "pagos_own_select"
  on public.equipo_pagos for select to authenticated
  using (user_id = auth.uid());

grant all on table public.equipo_pagos to authenticated;
grant all on table public.equipo_pagos to service_role;

-- REGISTROS DE ACTIVIDAD
drop policy if exists "actividad_own_write" on public.registros_actividad;
create policy "actividad_own_write"
  on public.registros_actividad for insert to authenticated
  with check (
    user_id = auth.uid()
    and public._es_miembro_equipo(equipo_id)
  );

drop policy if exists "actividad_team_read" on public.registros_actividad;
create policy "actividad_team_read"
  on public.registros_actividad for select to authenticated
  using (
    user_id = auth.uid()
    or (
      equipo_id is not null
      and public._es_miembro_equipo(equipo_id)
    )
  );

grant all on table public.registros_actividad to authenticated;
grant all on table public.registros_actividad to service_role;

-- ALERTAS DE ACTIVIDAD
drop policy if exists "alertas_own_write" on public.alertas_actividad;
create policy "alertas_own_write"
  on public.alertas_actividad for insert to authenticated
  with check (
    user_id = auth.uid()
    and public._es_miembro_equipo(equipo_id)
  );

-- El usuario actualiza SUS alertas (responder sí/no)
drop policy if exists "alertas_own_update" on public.alertas_actividad;
create policy "alertas_own_update"
  on public.alertas_actividad for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "alertas_team_read" on public.alertas_actividad;
create policy "alertas_team_read"
  on public.alertas_actividad for select to authenticated
  using (
    user_id = auth.uid()
    or (
      equipo_id is not null
      and public._es_miembro_equipo(equipo_id)
    )
  );

grant all on table public.alertas_actividad to authenticated;
grant all on table public.alertas_actividad to service_role;

-- ═══════════════════════════════════════════════════════════
-- REALTIME
-- ═══════════════════════════════════════════════════════════

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'equipo_miembros'
  ) then
    alter publication supabase_realtime add table public.equipo_miembros;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tarea_asignaciones'
  ) then
    alter publication supabase_realtime add table public.tarea_asignaciones;
  end if;
end $$;
