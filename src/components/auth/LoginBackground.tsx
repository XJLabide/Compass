"use client";

import { useEffect, useState } from "react";
import { MeshGradient } from "@paper-design/shaders-react";

/**
 * Full-page animated mesh-gradient background for the login route.
 * Sits behind every other layer (`z-0`), with a vignette + grid overlay
 * on top to keep the foreground readable.
 *
 * Honors `prefers-reduced-motion` by freezing the shader at `speed: 0`.
 */
export default function LoginBackground() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <MeshGradient
        colors={["#0a0a0b", "#0e7490", "#22d3ee", "#365314", "#1e1b4b"]}
        distortion={1.1}
        swirl={0.7}
        speed={reduced ? 0 : 0.16}
        style={{ width: "100%", height: "100%" }}
      />

      {/* Vignette to dim the edges so the centered card pops */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_rgba(0,0,0,0.55)_75%,_rgba(0,0,0,0.85)_100%)]" />
    </div>
  );
}
