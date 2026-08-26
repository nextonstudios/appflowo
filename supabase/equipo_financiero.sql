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
