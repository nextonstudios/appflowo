import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import {
  type Equipo,
  type InvitacionPendiente,
  misEquipos,
  misInvitaciones,
  getEquipoActivoId,
  setEquipoActivoId,
} from "../lib/equipo";

export interface EstadoEquipo {
  equipos: Equipo[];
  activo: Equipo | null;
  miRol: string | null;
  invitaciones: InvitacionPendiente[];
  cargando: boolean;
  userId: string | null;
  seleccionar: (id: string | null) => void;
  recargar: () => Promise<void>;
}

export function useEquipo(): EstadoEquipo {
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [activo, setActivo] = useState<Equipo | null>(null);
  const [miRol, setMiRol] = useState<string | null>(null);
  const [invitaciones, setInvitaciones] = useState<InvitacionPendiente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);
    const lista = await misEquipos();
    setEquipos(lista);
    setInvitaciones(await misInvitaciones());

    const activoId = getEquipoActivoId();
    // El modo equipo es EXPLICITO: solo se activa al entrar desde
    // Flowo Teams. Si el guardado ya no existe (saliste o lo
    // borraron), se limpia.
    let equipoActual = activoId ? lista.find((e) => e.id === activoId) || null : null;
    if (activoId && !equipoActual) setEquipoActivoId(null);

    if (equipoActual) {
      setEquipoActivoId(equipoActual.id);
      const { data: membresia } = await supabase
        .from("equipo_miembros")
        .select("rol")
        .eq("equipo_id", equipoActual.id)
        .eq("user_id", user?.id ?? "")
        .single();
      setMiRol(membresia?.rol ?? null);
      setActivo(equipoActual);
    } else {
      setMiRol(null);
      setActivo(null);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function seleccionar(id: string | null) {
    setEquipoActivoId(id);
    const eq = id ? equipos.find((e) => e.id === id) || null : null;
    setActivo(eq);
  }

  return { equipos, activo, miRol, invitaciones, cargando, userId, seleccionar, recargar: cargar };
}
