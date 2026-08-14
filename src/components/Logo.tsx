import { useEffect, useState } from "react";

interface LogoProps {
  className?: string;
}

export default function Logo({ className }: LogoProps) {
  const [esClaro, setEsClaro] = useState(
    () => document.documentElement.classList.contains("light")
  );
  const [falloClaro, setFalloClaro] = useState(false);

  useEffect(() => {
    const obs = new MutationObserver(() => {
      setEsClaro(document.documentElement.classList.contains("light"));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  return (
    <img
      src={esClaro && !falloClaro ? "/logoFlowoClaro.png" : "/logoFlowo.png"}
      alt="Logo Flowo"
      className={className}
      onError={() => {
        if (esClaro) setFalloClaro(true);
      }}
    />
  );
}
