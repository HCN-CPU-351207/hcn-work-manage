// Sự kiện chuột/cảm ứng cho thanh công việc (mục 8.5.6):
// rê chuột = Tooltip, nhấp = ghim, double-click/chạm đúp = mở tab + drawer.
// Nhấp đơn trì hoãn 220 ms để không xung đột với double-click.
import { useRef } from 'react';
import type { PointerEvent as RPointerEvent, MouseEvent as RMouseEvent } from 'react';
import { useApp } from '../store/app.ts';
import type { TipData } from '../store/app.ts';

export function useBarEvents(getTip: () => TipData) {
  const timer = useRef<number | undefined>(undefined);
  const lastTap = useRef(0);
  const setTip = useApp((s) => s.setTip);
  const navigateTo = useApp((s) => s.navigateTo);

  const pinnedOther = () => {
    const cur = useApp.getState().tip;
    return !!cur?.pinned;
  };
  const show = (x: number, y: number, pinned: boolean) => setTip({ data: getTip(), x, y, pinned });
  const open = () => {
    window.clearTimeout(timer.current);
    const d = getTip();
    setTip(null);
    navigateTo(d.level, d.id, true);
  };

  return {
    onPointerEnter: (e: RPointerEvent) => {
      if (e.pointerType !== 'mouse' || pinnedOther()) return;
      show(e.clientX, e.clientY, false);
    },
    onPointerMove: (e: RPointerEvent) => {
      if (e.pointerType !== 'mouse' || pinnedOther()) return;
      show(e.clientX, e.clientY, false);
    },
    onPointerLeave: (e: RPointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const cur = useApp.getState().tip;
      if (cur && !cur.pinned) setTip(null);
    },
    onPointerUp: (e: RPointerEvent) => {
      if (e.pointerType === 'mouse') return;
      // cảm ứng: chạm đúp trong 300 ms = mở; chạm đơn = hiện và ghim
      const now = Date.now();
      if (now - lastTap.current < 300) {
        lastTap.current = 0;
        open();
        return;
      }
      lastTap.current = now;
      show(e.clientX, e.clientY, true);
    },
    onClick: (e: RMouseEvent) => {
      e.stopPropagation();
      if ((e.nativeEvent as PointerEvent).pointerType && (e.nativeEvent as PointerEvent).pointerType !== 'mouse') return;
      const { clientX, clientY } = e;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => show(clientX, clientY, true), 220);
    },
    onDoubleClick: (e: RMouseEvent) => {
      e.stopPropagation();
      open();
    }
  };
}
