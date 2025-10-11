import katex from 'katex';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

interface TextUnitProps {
  heading: string;
  body: string;
  defaultExpanded?: boolean;
  className?: string;
  // eslint-disable-next-line no-unused-vars
  renderControls?: (expanded: boolean, toggle: () => void) => ReactNode;
  collapsible?: boolean;
  showHeading?: boolean;
  bulkAction?: {
    version: number;
    expanded: boolean;
  };
}

interface Token {
  type: 'text' | 'inlineMath' | 'blockMath';
  value: string;
}

function tokenizeMath(content: string): Token[] {
  const tokens: Token[] = [];
  const regex = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content))) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }

    if (match[1] !== undefined) {
      tokens.push({ type: 'blockMath', value: match[1] });
    } else if (match[2] !== undefined) {
      tokens.push({ type: 'inlineMath', value: match[2] });
    } else if (match[3] !== undefined) {
      tokens.push({ type: 'blockMath', value: match[3] });
    } else if (match[4] !== undefined) {
      tokens.push({ type: 'inlineMath', value: match[4] });
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    tokens.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return tokens;
}

function renderTokens(tokens: Token[]): ReactNode {
  const elements: ReactNode[] = [];

  tokens.forEach((token, index) => {
    if (token.type === 'text') {
      const pieces = token.value.split(/(\n+)/);
      pieces.forEach((piece, pieceIndex) => {
        if (piece === '\n' || piece === '\n\n') {
          elements.push(<br key={`br-${index}-${pieceIndex}`} />);
        } else if (piece.length) {
          elements.push(
            <span key={`text-${index}-${pieceIndex}`} className="text-slate-200">
              {piece}
            </span>,
          );
        }
      });
      return;
    }

    const displayMode = token.type === 'blockMath';
    let rendered: string;
    try {
      rendered = katex.renderToString(token.value.trim(), {
        throwOnError: false,
        displayMode,
      });
    } catch (error) {
      rendered = token.value;
    }

    elements.push(
      <span
        key={`math-${index}`}
        className={`${displayMode ? 'block py-2' : 'inline mx-1'} text-sky-300`}
        dangerouslySetInnerHTML={{ __html: rendered }}
      />,
    );
  });

  return elements;
}

export default function TextUnit({
  heading,
  body,
  defaultExpanded = false,
  className,
  renderControls,
  collapsible = true,
  showHeading = true,
  bulkAction,
}: TextUnitProps) {
  const [expanded, setExpanded] = useState(() => {
    if (!collapsible) return true;
    if (bulkAction) return bulkAction.expanded;
    return defaultExpanded;
  });
  const contentId = useId();
  const lastBulkVersion = useRef<number | null>(bulkAction ? bulkAction.version : null);

  const containerClassName = useMemo(() => {
    const classes = ['space-y-2'];
    if (className?.trim()) {
      classes.push(className.trim());
    }
    return classes.join(' ');
  }, [className]);

  const normalizedHeading = heading.trim();
  const normalizedBody = body.trim();
  const toggle = useCallback(() => {
    if (collapsible) {
      setExpanded((prev) => !prev);
    }
  }, [collapsible]);
  const renderedBody = useMemo(() => renderTokens(tokenizeMath(normalizedBody)), [normalizedBody]);
  const shouldShowBody = collapsible ? expanded : true;
  const displayHeading = showHeading && (normalizedHeading.length > 0 || collapsible);

  const handleHeadingClick = useCallback(
    (event: MouseEvent<HTMLSpanElement>) => {
      event.stopPropagation();
      if (!collapsible) return;
      if (event.defaultPrevented) return;
      toggle();
    },
    [collapsible, toggle],
  );

  const handleHeadingKeyDown = useCallback(
    (event: KeyboardEvent<HTMLSpanElement>) => {
      event.stopPropagation();
      if (!collapsible) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggle();
      }
    },
    [collapsible, toggle],
  );

  const handleContainerClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!collapsible || expanded) return;
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('button')) return;
      toggle();
    },
    [collapsible, expanded, toggle],
  );

  useEffect(() => {
    if (!collapsible || !bulkAction) return;
    if (lastBulkVersion.current === bulkAction.version) return;
    setExpanded(bulkAction.expanded);
    lastBulkVersion.current = bulkAction.version;
  }, [bulkAction, collapsible]);

  return (
    <article className={containerClassName} onClick={handleContainerClick}>
      {displayHeading ? (
        <div className="flex items-center justify-between gap-3 pb-2">
          <span
            role={collapsible ? 'button' : undefined}
            tabIndex={collapsible ? 0 : undefined}
            onClick={handleHeadingClick}
            onKeyDown={handleHeadingKeyDown}
            className={`break-words text-base font-semibold italic text-slate-200 ${
              collapsible ? 'cursor-pointer select-none hover:text-slate-100 focus:outline-none focus-visible:text-sky-200' : ''
            }`}
          >
            {normalizedHeading || 'Untitled'}
          </span>
          {collapsible ? (
            <div className="flex items-center gap-2">
              {renderControls ? renderControls(expanded, toggle) : null}
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={contentId}
                onClick={toggle}
                className="flex h-7 w-7 items-center justify-center text-base text-slate-200 transition hover:text-sky-200 focus:outline-none"
                title="Fold/Unfold"
                aria-label="Fold or unfold section"
              >
                ⇅
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {shouldShowBody ? (
        <div id={contentId} className="text-sm leading-relaxed text-slate-200">
          {normalizedBody ? renderedBody : <p className="text-xs text-slate-400">No content provided.</p>}
        </div>
      ) : null}
    </article>
  );
}
