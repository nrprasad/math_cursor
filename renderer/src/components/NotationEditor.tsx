import { useCallback, useEffect, useRef, useState } from 'react';

import TextUnit from './TextUnit';

interface NotationEditorProps {
  value: string;
  // eslint-disable-next-line no-unused-vars
  onChange: (value: string) => void;
  label?: string;
}

export default function NotationEditor({ value, onChange, label = 'Notation' }: NotationEditorProps) {
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleBlur = useCallback(() => {
    setEditing(false);
  }, []);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      const length = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(length, length);
    }
  }, [editing]);

  if (editing) {
    return (
      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">{label}</span>
        <textarea
          ref={textareaRef}
          className="h-48 w-full border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-slate-100 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={handleBlur}
        />
      </div>
    );
  }

  return (
    <section className="space-y-3 border-b border-slate-800 pb-6 last:border-b-0">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
        <span className="underline decoration-slate-600 decoration-2">{label}</span>
      </div>
      <button
        type="button"
        className="w-full bg-slate-950 px-3 py-3 text-left transition hover:bg-slate-900"
        onClick={() => setEditing(true)}
      >
        <TextUnit
          heading=""
          body={value || '(click to edit notation)'}
          defaultExpanded
          collapsible={false}
          showHeading={false}
        />
      </button>
    </section>
  );
}
