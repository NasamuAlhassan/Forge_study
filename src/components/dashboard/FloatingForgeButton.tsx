import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

const BUTTON_W = 144;
const BUTTON_H = 44;

export function FloatingForgeButton() {
  const [pos, setPos] = useState(() => ({
    x: (typeof window !== "undefined" ? window.innerWidth : 1280) - BUTTON_W - 28,
    y: (typeof window !== "undefined" ? window.innerHeight : 800) - BUTTON_H - 32,
  }));
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const didDrag = useRef(false);
  const origin = useRef({ px: 0, py: 0, bx: 0, by: 0 });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - origin.current.px;
      const dy = e.clientY - origin.current.py;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) didDrag.current = true;
      setPos({
        x: Math.max(8, Math.min(window.innerWidth - BUTTON_W - 8, origin.current.bx + dx)),
        y: Math.max(8, Math.min(window.innerHeight - BUTTON_H - 8, origin.current.by + dy)),
      });
    };
    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging]);

  return (
    <button
      onPointerDown={(e) => {
        didDrag.current = false;
        origin.current = { px: e.clientX, py: e.clientY, bx: pos.x, by: pos.y };
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
      }}
      onClick={() => {
        if (!didDrag.current) window.dispatchEvent(new CustomEvent("forge:open"));
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label="Ask Forge AI"
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 9998,
        width: BUTTON_W,
        height: BUTTON_H,
        borderRadius: "14px",
        border: "none",
        cursor: dragging ? "grabbing" : "grab",
        background: "linear-gradient(135deg, oklch(0.72 0.2 285), oklch(0.55 0.23 250))",
        boxShadow: hovered || dragging
          ? "0 0 0 1px oklch(0.62 0.21 285 / 0.45), 0 16px 48px oklch(0.62 0.21 285 / 0.5), 0 1px 0 oklch(1 0 0 / 0.22) inset"
          : "0 0 0 1px oklch(0.62 0.21 285 / 0.25), 0 6px 24px oklch(0.62 0.21 285 / 0.32), 0 1px 0 oklch(1 0 0 / 0.2) inset",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        color: "white",
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: "-0.01em",
        userSelect: "none",
        touchAction: "none",
        overflow: "hidden",
        transition: dragging
          ? "box-shadow 0.2s ease"
          : "box-shadow 0.25s ease, transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)",
        transform: dragging
          ? "scale(1.05)"
          : hovered
          ? "translateY(-2px) scale(1.02)"
          : "scale(1)",
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, transparent 55%)",
          borderRadius: "14px",
          pointerEvents: "none",
        }}
      />
      <Sparkles
        style={{
          width: 15,
          height: 15,
          flexShrink: 0,
          position: "relative",
          zIndex: 1,
          filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.28))",
        }}
      />
      <span style={{ position: "relative", zIndex: 1 }}>Ask Forge</span>
    </button>
  );
}
