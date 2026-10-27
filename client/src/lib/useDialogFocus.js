import { useEffect, useRef } from 'react';
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
export function useDialogFocus(open, panelRef, onClose) {
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const restore = document.activeElement;
    const hidden = [];
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      let node = panel;
      while (node.parentElement && node.parentElement !== document.body) {
        for (const sibling of node.parentElement.children) {
          if (sibling !== node && !sibling.hasAttribute('data-dialog-backdrop')) { hidden.push([sibling, sibling.inert]); sibling.inert = true; }
        }
        node = node.parentElement;
      }
      (panel.querySelector(FOCUSABLE) || panel).focus();
    });
    const keydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); close.current?.(); return; }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      const nodes = [...(panel?.querySelectorAll(FOCUSABLE) || [])].filter(node => node.getClientRects().length);
      const first = nodes[0] || panel; const last = nodes.at(-1) || panel;
      if (!panel?.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last)) { event.preventDefault(); first?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      cancelAnimationFrame(frame); document.removeEventListener('keydown', keydown);
      hidden.forEach(([node, previous]) => { node.inert = previous; });
      restore?.focus?.();
    };
  }, [open, panelRef]);
}
