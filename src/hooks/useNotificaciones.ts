import { useEffect } from "react";
import { supabase } from "../lib/supabase";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

export function useNotificaciones(userId: string | null) {
  useEffect(() => {
    if (!userId) return;

    async function verificarPermiso() {
      let permiso = await isPermissionGranted();
      if (!permiso) {
        const resultado = await requestPermission();
        permiso = resultado === "granted";
      }
      return permiso;
    }

    verificarPermiso();

    const canalMensajes = supabase
      .channel("portal_mensajes_cliente")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "portal_mensajes",
          filter: "autor=eq.cliente",
        },
        async (payload) => {
          const permiso = await isPermissionGranted();
          if (!permiso) return;

          const msg = payload.new as {
            proyecto_id: string;
            contenido: string;
            tipo: string;
          };

          const { data } = await supabase
            .from("proyectos")
            .select("nombre, cliente_id, clientes(nombre)")
            .eq("id", msg.proyecto_id)
            .single();

          const proyecto = data?.nombre ?? "un proyecto";
          const cliente = (data?.clientes as { nombre: string } | null)?.nombre ?? "El cliente";

          let title = "";
          let body = "";

          if (msg.tipo === "aprobacion") {
            title = "Tarea aprobada";
            body = cliente + " aprobó una tarea en " + proyecto;
          } else if (msg.tipo === "feedback") {
            title = "Nuevo feedback";
            body = cliente + " dejó feedback en " + proyecto;
          } else {
            title = "Nuevo mensaje";
            body = cliente + " envió un mensaje en " + proyecto;
          }

          sendNotification({ title, body });
        }
      )
      .subscribe();

    const canalTareas = supabase
      .channel("tareas_aprobadas_cliente")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tareas",
          filter: "aprobada_cliente=eq.true",
        },
        async (payload) => {
          const permiso = await isPermissionGranted();
          if (!permiso) return;

          const tarea = payload.new as {
            nombre: string;
            proyecto_id: string;
          };

          const { data } = await supabase
            .from("proyectos")
            .select("nombre, cliente_id, clientes(nombre)")
            .eq("id", tarea.proyecto_id)
            .single();

          const proyecto = data?.nombre ?? "un proyecto";
          const cliente = (data?.clientes as { nombre: string } | null)?.nombre ?? "El cliente";

          sendNotification({
            title: "Tarea aprobada",
            body: cliente + " aprobó \"" + tarea.nombre + "\" en " + proyecto,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalMensajes);
      supabase.removeChannel(canalTareas);
    };
  }, [userId]);
}