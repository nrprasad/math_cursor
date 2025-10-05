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

  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    isDraggingRef.current = true;
  }, []);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) {
        return;
      }
      const { left, width } = containerRef.current.getBoundingClientRect();
      const pointer = event.clientX - left;
      if (width <= 0) return;
      let nextRatio = pointer / width;
      nextRatio = Math.max(minLeft, Math.min(1 - minRight, nextRatio));
      setRatio(nextRatio);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [minLeft, minRight]);

  const leftWidth = `${ratio * 100}%`;
  const rightWidth = `${(1 - ratio) * 100}%`;

  return (
    <div ref={containerRef} className="flex h-full min-h-0 w-full gap-3">
      <div style={{ width: leftWidth }} className="flex h-full min-h-0 min-w-[260px] flex-col overflow-hidden">
        {left}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        tabIndex={0}
        onMouseDown={handleMouseDown}
        className="flex h-full w-[8px] cursor-col-resize select-none items-stretch"
      >
        <div className="mx-auto h-full w-px bg-slate-700" />
      </div>
      <div style={{ width: rightWidth }} className="flex h-full min-h-0 min-w-[260px] flex-col overflow-hidden">
        {right}
      </div>
    </div>
  );
}
