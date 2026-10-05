import React from 'react';
import { createPortal } from 'react-dom';

const GAP = 6;
const MARGIN = 8;

function samePos(a, b) {
  if (!a || !b) return false;
  return a.top === b.top && a.left === b.left && a.width === b.width
    && (a.maxHeight || 0) === (b.maxHeight || 0) && a.placement === b.placement;
}

function measure(anchor, pop, stretch) {
  const rect = anchor.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const naturalW = pop.offsetWidth || 320;
  const naturalH = pop.scrollHeight || 0;
  const popW = stretch ? Math.min(rect.width, vw - MARGIN * 2) : Math.min(naturalW, vw - MARGIN * 2);
  const left = Math.min(Math.max(rect.left, MARGIN), Math.max(MARGIN, vw - popW - MARGIN));
  const below = vh - rect.bottom - GAP - MARGIN;
  const above = rect.top - GAP - MARGIN;
  if (naturalH <= below) return { top: rect.bottom + GAP, left, width: popW, maxHeight: Math.max(below, 120), placement: 'below', scroll: false };
  if (naturalH <= above) return { top: rect.top - GAP - naturalH, left, width: popW, maxHeight: Math.max(above, 120), placement: 'above', scroll: false };
  if (below >= above) return { top: rect.bottom + GAP, left, width: popW, maxHeight: Math.max(below, 120), placement: 'below', scroll: true };
  return { top: Math.max(MARGIN, rect.top - GAP - above), left, width: popW, maxHeight: Math.max(above, 120), placement: 'above', scroll: true };
}

export function AnchoredPopover({ anchorRef, open, onClose, children, className = '', label, stretch = false }) {
  const popRef = React.useRef(null);
  const [pos, setPos] = React.useState(null);
  const posRef = React.useRef(null);

  const compute = React.useCallback(() => {
    const anchor = anchorRef.current;
    const pop = popRef.current;
    if (!anchor || !pop) return;
    const next = measure(anchor, pop, stretch);
    if (samePos(posRef.current, next)) return;
    posRef.current = next;
    setPos(next);
  }, [anchorRef, stretch]);

  React.useLayoutEffect(() => {
    if (!open) { posRef.current = null; setPos(null); return; }
    posRef.current = null;
    compute();
  }, [open, compute]);

  React.useEffect(() => {
    if (!open) return;
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };
    const ro = typeof ResizeObserver !== 'undefined' && popRef.current
      ? new ResizeObserver(schedule)
      : null;
    if (ro && popRef.current) ro.observe(popRef.current);
    const onScroll = (e) => {
      if (popRef.current && popRef.current.contains(e.target)) return;
      compute();
    };
    const onResize = () => compute();
    const onDoc = (e) => {
      const anchor = anchorRef.current;
      const pop = popRef.current;
      if (anchor && anchor.contains(e.target)) return;
      if (pop && pop.contains(e.target)) return;
      onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        anchorRef.current?.focus?.({ preventScroll: true });
      }
    };
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, compute, onClose, anchorRef]);

  if (!open || typeof document === 'undefined') return null;
  const style = pos
    ? {
        position: 'fixed',
        top: Math.max(MARGIN, pos.top),
        left: pos.left,
        width: pos.width,
        zIndex: 'var(--z-popover)',
        ...(pos.maxHeight ? { maxHeight: pos.maxHeight } : {}),
      }
    : { position: 'fixed', top: 0, left: 0, visibility: 'hidden', zIndex: 'var(--z-popover)' };
  return createPortal(
    <div
      ref={popRef}
      className={`${className} popover-scroll`}
      role="dialog"
      aria-label={label}
      style={style}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
    >
      {children}
    </div>,
    document.body
  );
}
