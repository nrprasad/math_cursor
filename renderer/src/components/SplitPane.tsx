import React, { ReactNode, useCallback, useEffect, useRef, useState } from 'react';

interface SplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  initial?: number;
  minLeft?: number;
  minRight?: number;
}

export default function SplitPane({
  left,
  right,
  initial = 0.35,
  minLeft = 0.25,
  minRight = 0.2,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ratio, setRatio] = useState(initial);
  const isDraggingRef = useRef(false);

  const beginDrag = useCallback(() => {
    isDraggingRef.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  }, []);

  const endDrag = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, []);

  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    beginDrag();
  }, [beginDrag]);

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    event.preventDefault();
    beginDrag();
  }, [beginDrag]);

  useEffect(() => {
    const updateRatioFromClientX = (clientX: number) => {
      if (!isDraggingRef.current || !containerRef.current) {
        return;
      }
      const { left, width } = containerRef.current.getBoundingClientRect();
      const pointer = clientX - left;
      if (width <= 0) return;
      let nextRatio = pointer / width;
      nextRatio = Math.max(minLeft, Math.min(1 - minRight, nextRatio));
      setRatio(nextRatio);
    };

    const handleMouseMove = (event: MouseEvent) => {
      updateRatioFromClientX(event.clientX);
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      updateRatioFromClientX(touch.clientX);
    };

    const stopDragging = () => {
      endDrag();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('mouseup', stopDragging);
    window.addEventListener('touchend', stopDragging);
    window.addEventListener('touchcancel', stopDragging);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('mouseup', stopDragging);
      window.removeEventListener('touchend', stopDragging);
      window.removeEventListener('touchcancel', stopDragging);
    };
  }, [beginDrag, endDrag, minLeft, minRight]);

  const leftWidth = `${ratio * 100}%`;
  const rightWidth = `${(1 - ratio) * 100}%`;

  return (
    <div ref={containerRef} className="flex h-full min-h-0 w-full">
      <div style={{ width: leftWidth }} className="flex h-full min-h-0 min-w-[260px] flex-col overflow-hidden">
        {left}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        tabIndex={0}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onKeyDown={(event) => {
          if (!containerRef.current) return;
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            const delta = event.key === 'ArrowLeft' ? -0.02 : 0.02;
            setRatio((current) => {
              let next = current + delta;
              next = Math.max(minLeft, Math.min(1 - minRight, next));
              return next;
            });
          }
        }}
        className="relative group flex h-full shrink-0 cursor-col-resize select-none items-stretch px-3 -mx-3 focus:outline-none"
        aria-label="Resize panels"
      >
        <div className="pointer-events-none absolute inset-y-0 left-0 right-0 rounded bg-slate-800/20 opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="pointer-events-none mx-auto h-full w-px bg-slate-700" />
      </div>
      <div style={{ width: rightWidth }} className="flex h-full min-h-0 min-w-[260px] flex-col overflow-hidden">
        {right}
      </div>
    </div>
  );
}
