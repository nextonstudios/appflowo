import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function useMoneda(): string {
  const [moneda, setMoneda] = useState(() => localStorage.getItem("flowo_moneda") || "USD");

  useEffect(() => {
    let activo = true;
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("perfiles")
        .select("moneda")
        .eq("user_id", user.id)
        .single();
      if (!activo) return;
      const m = data?.moneda || "USD";
      setMoneda(m);
      localStorage.setItem("flowo_moneda", m);
    }
    cargar();
    return () => { activo = false; };
  }, []);

  return moneda;
}
