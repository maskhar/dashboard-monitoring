"use client";

import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const menuWidth = 164;
const menuGap = 6;

export function RowActionsMenu({ label, children }: { label: string; children: ReactNode }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  function toggle() {
    if (open) { setOpen(false); return; }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const estimatedHeight = 104;
    const top = rect.bottom + menuGap + estimatedHeight > window.innerHeight
      ? Math.max(menuGap, rect.top - estimatedHeight - menuGap)
      : rect.bottom + menuGap;
    const left = Math.min(window.innerWidth - menuWidth - menuGap, Math.max(menuGap, rect.right - menuWidth));
    setPosition({ top, left });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: PointerEvent) {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    function closeOnViewportChange() { setOpen(false); }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [open]);

  return <>
    <button ref={triggerRef} type="button" className="row-actions-trigger" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={toggle}><MoreHorizontal size={18} /></button>
    {open && typeof document !== "undefined" ? createPortal(<div ref={menuRef} className="row-actions-popover" role="menu" style={position} onClick={() => setOpen(false)}>{children}</div>, document.body) : null}
  </>;
}
