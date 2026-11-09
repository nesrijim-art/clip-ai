"use client";

import { useEffect, useState } from "react";

export type DeviceLayout = "mobile" | "desktop";

/**
 * Detecta si conviene usar el diseño "móvil" o "escritorio".
 * Combina el ancho de pantalla con el tipo de dispositivo (touch + user agent),
 * porque una ventana angosta en una PC no debe activar el modo móvil (y viceversa).
 */
export function useDeviceLayout(): DeviceLayout {
  const [layout, setLayout] = useState<DeviceLayout>("desktop");

  useEffect(() => {
    function compute(): DeviceLayout {
      const narrowScreen = window.matchMedia("(max-width: 768px)").matches;
      const isTouchPrimary = window.matchMedia("(pointer: coarse)").matches;
      const ua = navigator.userAgent;
      const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
      return narrowScreen && (isTouchPrimary || mobileUa) ? "mobile" : "desktop";
    }

    setLayout(compute());
    const onResize = () => setLayout(compute());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return layout;
}
