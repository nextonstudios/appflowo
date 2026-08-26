-- ============================================================
-- Flowo Teams — Tablas base de equipos
-- Ejecutar UNA SOLA VEZ en Supabase:
--   Dashboard > SQL Editor > New query > pegar > Run
--
-- Este archivo es idempotente: puedes correrlo sin romper nada.
-- Orden de ejecución: 1 de 5
-- ============================================================

-- ── 1. equipos ─────────────────────────────────────────────
create table if not exists public.equipos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text unique,
  owner_id uuid references auth.users(id) on delete set null,
  logo_url text,
  plan text not null default 'free',
  -- 'free' = sin pagar (hasta max_miembros, features basicas)
  -- 'team' = $12/mes base (5 miembros gratis)
  -- 'business' = $25/mes base (15 miembros gratis)
  plan_region text not null default 'global',
  -- 'latam' | 'eu-na' | 'global'
  max_miembros integer not null default 5,
  moneda text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.equipos is 'Equipos/areas de trabajo de Flowo Teams';

-- ── 2. equipo_miembros ─────────────────────────────────────
create table if not exists public.equipo_miembros (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rol text not null default 'miembro',
  -- 'admin' | 'miembro' | 'viewer'
  custom_role_id uuid,
  joined_at timestamptz not null default now(),
  unique(equipo_id, user_id)
);

comment on column public.equipo_miembros.rol is 'admin: control total. miembro: trabaja en el equipo. viewer: solo lectura';
comment on column public.equipo_miembros.custom_role_id is 'Referencia a equipo_roles si el rol es personalizado (plan Business)';

-- ── 3. equipo_roles (roles personalizados, plan Business) ──
create table if not exists public.equipo_roles (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  nombre text not null,
  permisos jsonb not null default '{}'::jsonb,
  color text default '#6B7280',
  created_at timestamptz not null default now()
);

comment on table public.equipo_roles is 'Roles personalizados por equipo (solo plan Business)';
comment on column public.equipo_roles.permisos is '{"crear_proyectos":true,"editar_proyectos":true,"eliminar_proyectos":false,"asignar_tareas":true,"ver_tareas_equipo":true,"crear_cotizaciones":true,"crear_contratos":true,"ver_facturas":true,"gestionar_clientes":true,"registrar_horas":true,"ver_dashboard":true,"gestionar_miembros":false,"configurar_equipo":false}';

-- ── 4. equipo_invitaciones ─────────────────────────────────
create table if not exists public.equipo_invitaciones (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  email text not null,
  rol text not null default 'miembro',
  -- 'admin' | 'miembro' | 'viewer'
  custom_role_id uuid,
  token text unique not null default encode(gen_random_bytes(32), 'hex'),
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.equipo_invitaciones is 'Invitaciones pendientes a equipos. El token es el secreto del enlace/email';

-- Un token solo puede usarse una vez: al aceptarse se guarda accepted_at.
-- La validacion de expiracion y uso se hace en la funcion de aceptar.

-- ── 5. tarea_asignaciones ──────────────────────────────────
create table if not exists public.tarea_asignaciones (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references public.tareas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  unique(tarea_id, user_id)
);

comment on table public.tarea_asignaciones is 'Asignacion multiple de tareas: varios miembros pueden trabajar la misma tarea';

-- ── 6. equipo_config ───────────────────────────────────────
create table if not exists public.equipo_config (
  equipo_id uuid primary key references public.equipos(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on column public.equipo_config.settings is '{"proyectos_privados_por_defecto":false,"feedback_visible_por_defecto":true,"timer_automatico":true,"zona_horaria":"America/Mexico_City","fraude":{"activa":true,"alerta_cada_minutos":25,"timeout_alerta_minutos":5}}';

-- ── Trigger updated_at para equipos ────────────────────────
create or replace function public._actualizar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists equipos_updated_at on public.equipos;
create trigger equipos_updated_at
  before update on public.equipos
  for each row execute function public._actualizar_updated_at();

-- ── Indices ────────────────────────────────────────────────
create index if not exists idx_equipo_miembros_equipo on public.equipo_miembros(equipo_id);
create index if not exists idx_equipo_miembros_user on public.equipo_miembros(user_id);
create index if not exists idx_equipo_roles_equipo on public.equipo_roles(equipo_id);
create index if not exists idx_equipo_invitaciones_token on public.equipo_invitaciones(token);
create index if not exists idx_equipo_invitaciones_email on public.equipo_invitaciones(email);
create index if not exists idx_tarea_asignaciones_tarea on public.tarea_asignaciones(tarea_id);
create index if not exists idx_tarea_asignaciones_user on public.tarea_asignaciones(user_id);

-- ── Permisos ───────────────────────────────────────────────
grant all on table public.equipos to authenticated;
grant all on table public.equipos to service_role;
grant all on table public.equipo_miembros to authenticated;
grant all on table public.equipo_miembros to service_role;
grant all on table public.equipo_roles to authenticated;
grant all on table public.equipo_roles to service_role;
grant all on table public.equipo_invitaciones to authenticated;
grant all on table public.equipo_invitaciones to service_role;
grant all on table public.tarea_asignaciones to authenticated;
grant all on table public.tarea_asignaciones to service_role;
grant all on table public.equipo_config to authenticated;
grant all on table public.equipo_config to service_role;

-- ============================================================
-- PARTE 2: Tablas financieras (pagos y actividad)
-- ============================================================
-- ============================================================
-- Flowo Teams — Tablas financieras (pagos y actividad)
-- Ejecutar UNA SOLA VEZ en Supabase:
--   Dashboard > SQL Editor > New query > pegar > Run
--
-- Este archivo es idempotente: puedes correrlo sin romper nada.
-- Requiere: equipos.sql ejecutado antes.
-- Orden de ejecución: 2 de 5
-- ============================================================

-- ── 1. equipo_configuracion_pago ───────────────────────────
-- Como se le paga a cada miembro: salario fijo o por horas
create table if not exists public.equipo_configuracion_pago (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo_pago text not null default 'fijo',
  -- 'fijo' = salario mensual fijo
  -- 'horas' = pago por horas trabajadas
  salario_mensual numeric default 0,
  tarifa_hora numeric default 0,
  moneda text not null default 'USD',
  dia_corte integer not null default 1,
  -- Dia del mes de corte para el pago (1-28)
  metodo_pago text not null default 'transferencia',
  -- 'transferencia' | 'efectivo' | 'otro'
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(equipo_id, user_id),
  constraint dia_corte_valido check (dia_corte between 1 and 28)
);

comment on table public.equipo_configuracion_pago is 'Configuracion de pago de cada miembro del equipo (solo visible para admins)';
comment on column public.equipo_configuracion_pago.tipo_pago is 'fijo: recibe salario_mensual cada mes. horas: recibe tarifa_hora por cada hora registrada';

drop trigger if exists config_pago_updated_at on public.equipo_configuracion_pago;
create trigger config_pago_updated_at
  before update on public.equipo_configuracion_pago
  for each row execute function public._actualizar_updated_at();

-- ── 2. equipo_pagos ────────────────────────────────────────
-- Historial de pagos realizados a trabajadores
create table if not exists public.equipo_pagos (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Trabajador que recibe el pago
  pagado_por uuid references auth.users(id) on delete set null,
  -- Admin que registro el pago
  monto numeric not null,
  moneda text not null default 'USD',
  periodo_inicio date,
  periodo_fin date,
  -- Periodo que cubre el pago
  horas_trabajadas numeric default 0,
  -- Horas incluidas (para pagos por hora)
  metodo_pago text not null default 'transferencia',
  referencia text,
  notas text,
  estado text not null default 'pagado',
  -- 'pagado' | 'pendiente' | 'cancelado'
  fecha_pago date not null default current_date,
  created_at timestamptz not null default now()
);

comment on table public.equipo_pagos is 'Pagos registrados manualmente por el admin a los trabajadores';
comment on column public.equipo_pagos.estado is 'pendiente: registrado pero no pagado aun (ej: solicitud del trabajador). pagado: dinero ya entregado';

-- ── 3. registros_actividad ─────────────────────────────────
-- Muestreo de actividad cada ~30s mientras el timer corre.
-- Sirve para calcular el score de actividad real del trabajador.
create table if not exists public.registros_actividad (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  registro_tiempo_id uuid,
  -- Referencia al registro_tiempo asociado (sin FK estricta para
  -- permitir limpieza de registros antiguos sin afectar esta tabla)
  mouse_events integer not null default 0,
  keyboard_events integer not null default 0,
  scroll_events integer not null default 0,
  clicks integer not null default 0,
  timestamp timestamptz not null default now(),
  intervalo_segundos integer not null default 30,
  activity_score integer not null default 0,
  -- 0-100, calculado por la app segun los eventos detectados
  is_active boolean not null default true
);

comment on table public.registros_actividad is 'Muestras de actividad del usuario durante el timer. Base para deteccion de fraude horario';
comment on column public.registros_actividad.activity_score is 'Score 0-100: 0 = sin actividad, 100 = actividad constante';

-- ── 4. alertas_actividad ───────────────────────────────────
-- Alertas "Sigues trabajando?" enviadas al usuario
create table if not exists public.alertas_actividad (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  registro_tiempo_id uuid,
  enviada_en timestamptz not null default now(),
  respondida_en timestamptz,
  respuesta text,
  -- 'si' | 'no' | null (sin responder)
  timeout_minutos integer not null default 5,
  -- Minutos para auto-pausar si no responde
  pausada_automaticamente boolean not null default false
);

comment on table public.alertas_actividad is 'Alertas de verificacion de actividad. Si no se responden a tiempo, el timer se pausa automaticamente';

-- ── Indices ────────────────────────────────────────────────
create index if not exists idx_equipo_pago_config on public.equipo_configuracion_pago(equipo_id, user_id);
create index if not exists idx_equipo_pagos_user on public.equipo_pagos(user_id);
create index if not exists idx_equipo_pagos_equipo_periodo on public.equipo_pagos(equipo_id, periodo_inicio, periodo_fin);
create index if not exists idx_registros_actividad_user_ts on public.registros_actividad(user_id, timestamp desc);
create index if not exists idx_registros_actividad_registro on public.registros_actividad(registro_tiempo_id);
create index if not exists idx_alertas_user on public.alertas_actividad(user_id, enviada_en desc);

-- ── Permisos ───────────────────────────────────────────────
grant all on table public.equipo_configuracion_pago to authenticated;
grant all on table public.equipo_configuracion_pago to service_role;
grant all on table public.equipo_pagos to authenticated;
grant all on table public.equipo_pagos to service_role;
grant all on table public.registros_actividad to authenticated;
grant all on table public.registros_actividad to service_role;
grant all on table public.alertas_actividad to authenticated;
grant all on table public.alertas_actividad to service_role;

-- ============================================================
-- PARTE 3: Alteraciones a tablas existentes
-- ============================================================
-- ============================================================
-- Flowo Teams — Alteraciones a tablas existentes
-- Ejecutar UNA SOLA VEZ en Supabase:
--   Dashboard > SQL Editor > New query > pegar > Run
--
-- Este archivo es idempotente: puedes correrlo sin romper nada.
-- Requiere: equipos.sql ejecutado antes.
-- Orden de ejecución: 3 de 5
--
-- IMPORTANTE: user_id se conserva como el dueño/creador original.
-- En contexto individual sigue funcionando igual que siempre.
-- En contexto de equipo, equipo_id indica el equipo al que pertenece.
-- ============================================================

-- ── proyectos ──────────────────────────────────────────────
alter table public.proyectos
  add column if not exists equipo_id uuid references public.equipos(id) on delete cascade,
  add column if not exists es_privado boolean not null default false,
  add column if not exists feedback_visible boolean not null default true,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

comment on column public.proyectos.es_privado is 'true: solo el creador y admins del equipo lo ven. false (default): todo el equipo lo ve';
comment on column public.proyectos.feedback_visible is 'Controla si el feedback/comentarios son visibles para todos los miembros asignados';
comment on column public.proyectos.created_by is 'Miembro que creo el proyecto dentro del equipo. En modo personal es igual a user_id';

create index if not exists idx_proyectos_equipo on public.proyectos(equipo_id);

-- ── clientes ───────────────────────────────────────────────
alter table public.clientes
  add column if not exists equipo_id uuid references public.equipos(id) on delete cascade;

create index if not exists idx_clientes_equipo on public.clientes(equipo_id);

-- ── cotizaciones ───────────────────────────────────────────
alter table public.cotizaciones
  add column if not exists equipo_id uuid references public.equipos(id) on delete cascade;

create index if not exists idx_cotizaciones_equipo on public.cotizaciones(equipo_id);

-- ── contratos ──────────────────────────────────────────────
alter table public.contratos
  add column if not exists equipo_id uuid references public.equipos(id) on delete cascade;

create index if not exists idx_contratos_equipo on public.contratos(equipo_id);

-- ── facturas ───────────────────────────────────────────────
alter table public.facturas
  add column if not exists equipo_id uuid references public.equipos(id) on delete cascade;

create index if not exists idx_facturas_equipo on public.facturas(equipo_id);

-- ── tareas ─────────────────────────────────────────────────
alter table public.tareas
  add column if not exists feedback_visible boolean not null default true;

-- Nota: la columna user_id de tareas sigue existiendo (quien la creo).
-- Las asignaciones multiples viven en tarea_asignaciones.

-- ── registros_tiempo ───────────────────────────────────────
alter table public.registros_tiempo
  add column if not exists equipo_id uuid references public.equipos(id) on delete cascade,
  add column if not exists horas_reales numeric,
  -- Horas descontando inactividad detectada
  add column if not exists activity_score integer,
  -- Score promedio de actividad durante el registro (0-100)
  add column if not exists alertas_enviadas integer default 0,
  add column if not exists alertas_respondidas integer default 0,
  add column if not exists pausado_por_fraude boolean default false;

create index if not exists idx_registros_tiempo_equipo on public.registros_tiempo(equipo_id);
create index if not exists idx_registros_tiempo_user_fecha on public.registros_tiempo(user_id, fecha);

-- ============================================================
-- PARTE 4: Funciones helper
-- ============================================================
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

-- ============================================================
-- PARTE 5: Politicas RLS y funciones de invitacion
-- ============================================================
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
