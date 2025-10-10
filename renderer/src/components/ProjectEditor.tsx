import type { ChangeEvent, KeyboardEvent, ReactNode } from 'react';
import katex from 'katex';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ApiError, draftProof, exportLatex, getProject, saveProject, sendChatPrompt } from '../lib/api';
import {
  getConjectureBody,
  getConjectureName,
  getDefinitionBody,
  getDefinitionName,
  getFactBody,
  getFactName,
  getIdeaBody,
  getIdeaName,
  getLemmaBody,
  getLemmaName,
  getPitfallBody,
  getPitfallName,
} from '../lib/display';
import type { ChatThread, ConversationMessage, Project } from '../lib/types';
import { buildPrompt } from '../lib/prompt';
import SplitPane from './SplitPane';
import TextUnit from './TextUnit';
import NotationEditor from './NotationEditor';

interface Props {
  projectId: string;
}

interface DraftState {
  markdown: string;
  warnings: string[];
}

type ChatMessage = ConversationMessage;

type ChatReferenceKind = 'Lemma' | 'Idea' | 'Conjecture' | 'Fact' | 'Pitfall' | 'Definition';
// eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
type NameGetter = (value: any, position: number) => string;

interface ChatSuggestion {
  id: string;
  label: string;
  value: string;
  start: number;
  end: number;
  appendSpace?: boolean;
}

interface MathToken {
  type: 'text' | 'inlineMath' | 'blockMath';
  value: string;
}

function tokenizeMathMessage(content: string): MathToken[] {
  const tokens: MathToken[] = [];
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

function renderChatTokens(tokens: MathToken[]): ReactNode {
  const elements: ReactNode[] = [];

  tokens.forEach((token, index) => {
    if (token.type === 'text') {
      const pieces = token.value.split(/(\n+)/);
      pieces.forEach((piece, pieceIndex) => {
        if (piece === '\n' || piece === '\n\n') {
          elements.push(<br key={`chat-br-${index}-${pieceIndex}`} />);
        } else if (piece.length) {
          elements.push(
            <span key={`chat-text-${index}-${pieceIndex}`} className="text-slate-100">
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
        key={`chat-math-${index}`}
        className={`${displayMode ? 'block py-2' : 'inline mx-1'} text-sky-300`}
        dangerouslySetInnerHTML={{ __html: rendered }}
      />,
    );
  });

  return elements;
}

function renderChatContent(content: string): ReactNode {
  return renderChatTokens(tokenizeMathMessage(content));
}

function highlightLatexSource(value: string): ReactNode {
  const elements: ReactNode[] = [];
  const regex = /\\begin\{[^}]+\}|\\end\{[^}]+\}|\\[a-zA-Z]+|%.*?$|\$+|\{|\}/gm;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(value))) {
    if (match.index > lastIndex) {
      elements.push(
        <span key={`latex-text-${match.index}`} className="text-slate-300">
          {value.slice(lastIndex, match.index)}
        </span>,
      );
    }

    const token = match[0];
    let className = 'text-amber-300';
    if (token.startsWith('%')) {
      className = 'text-emerald-300';
    } else if (token === '{' || token === '}') {
      className = 'text-slate-400';
    } else if (token.startsWith('$')) {
      className = 'text-violet-300';
    }

    elements.push(
      <span key={`latex-token-${match.index}`} className={className}>
        {token}
      </span>,
    );

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < value.length) {
    elements.push(
      <span key="latex-text-tail" className="text-slate-300">
        {value.slice(lastIndex)}
      </span>,
    );
  }

  return elements;
}

function computeVisibleMessages(history: ChatMessage[], visibleUserCount: number): ChatMessage[] {
  if (!history.length) return [];
  const limit = visibleUserCount <= 0 ? Number.POSITIVE_INFINITY : visibleUserCount;
  let userCount = 0;
  const result: ChatMessage[] = [];

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    result.push(entry);
    if (entry.role === 'user') {
      userCount += 1;
      if (userCount >= limit) {
        break;
      }
    }
  }

  return result.reverse();
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function extractThreadNumber(title: string | null | undefined): number {
  if (!title) return 0;
  const match = title.trim().match(/^Thread\s+#?(\d+)$/i);
  if (match && match[1]) {
    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatUnitHeading(label: string, index: number, name: string | null | undefined) {
  const trimmed = name?.trim();
  if (trimmed && trimmed.length) {
    return `${label} ${index + 1} [${trimmed}]`;
  }
  return `${label} ${index + 1}`;
}

function stripAutoLabel(value: string | null | undefined, label: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  const regex = new RegExp(`^${label}\\s+\\d+$`, "i");
  return regex.test(trimmed) ? "" : trimmed;
}

const PANEL_CLASS = 'border border-slate-700 bg-slate-950 p-5 shadow-sm';
const INPUT_CLASS =
  'w-full border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-slate-100 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40';
const TEXTAREA_CLASS =
  'w-full border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-slate-100 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40';
const PRIMARY_BUTTON_CLASS =
  'inline-flex items-center justify-center bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60';
const SECONDARY_BUTTON_CLASS =
  'inline-flex items-center justify-center border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-sky-400 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-50';
const TERTIARY_BUTTON_CLASS =
  'inline-flex items-center justify-center border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-sky-400 hover:text-sky-200';
const DEFAULT_PROJECT_TITLE = 'Untitled project';

export default function ProjectEditor({ projectId }: Props) {
  const [project, setProject] = useState<Project | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [etag, setEtag] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [selectedLemmaId, setSelectedLemmaId] = useState<string>("");

  const [notationText, setNotationText] = useState("");
  const [lemmas, setLemmas] = useState<Project["lemmas"]>([]);
  const [definitions, setDefinitions] = useState<Project["definitions"]>([]);
  const [facts, setFacts] = useState<Project["facts"]>([]);
  const [conjectures, setConjectures] = useState<Project["conjectures"]>([]);
  const [ideas, setIdeas] = useState<Project["ideas"]>([]);
  const [pitfalls, setPitfalls] = useState<Project["pitfalls"]>([]);

  const [queryText, setQueryText] = useState("");
  const [chatThreads, setChatThreads] = useState<Project['chatThreads']>([]);
  const [openThreadIds, setOpenThreadIds] = useState<string[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [activeProofLemma, setActiveProofLemma] = useState<Project['lemmas'][number] | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [rawChatMessages, setRawChatMessages] = useState<Record<string, boolean>>({});
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [chatSuggestions, setChatSuggestions] = useState<ChatSuggestion[]>([]);
  const [chatSuggestionIndex, setChatSuggestionIndex] = useState(0);
  const [visibleUserMessages, setVisibleUserMessages] = useState(5);
  const threadCounterRef = useRef(0);
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [threadNameDraft, setThreadNameDraft] = useState("");
  const [threadMenu, setThreadMenu] = useState<{ threadId: string; x: number; y: number } | null>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string | null>(null);
  const activeThread = useMemo(
    () => chatThreads.find((thread) => thread.id === activeThreadId) ?? null,
    [chatThreads, activeThreadId],
  );
  const activeThreadMessages = activeThread?.messages ?? [];
  const totalUserMessages = useMemo(
    () => activeThreadMessages.filter((message) => message.role === 'user').length,
    [activeThreadMessages],
  );
  const hiddenUserMessages = Math.max(0, totalUserMessages - visibleUserMessages);

  const updateThreads = useCallback(
    (mutator: (threads: ChatThread[]) => ChatThread[]) => {
      setChatThreads((prev) => {
        const next = mutator(prev);
        if (next === prev) {
          return prev;
        }
        setProject((prevProject) => (prevProject ? { ...prevProject, chatThreads: next } : prevProject));
        return next;
      });
    },
    [setProject],
  );

  const updateThreadById = useCallback(
    (threadId: string, mutator: (thread: ChatThread) => ChatThread | null) => {
      updateThreads((prev) => {
        let changed = false;
        const next: ChatThread[] = [];
        prev.forEach((thread) => {
          if (thread.id !== threadId) {
            next.push(thread);
            return;
          }
          const result = mutator(thread);
          if (result) {
            next.push(result);
          }
          if (result !== thread) {
            changed = true;
          }
          if (!result) {
            changed = true;
          }
        });
        if (!changed) {
          return prev;
        }
        return next;
      });
    },
    [updateThreads],
  );

  const openThreads = useMemo(() => {
    if (!openThreadIds.length) {
      return [];
    }
    const lookup = new Map(chatThreads.map((thread) => [thread.id, thread]));
    return openThreadIds
      .map((id) => lookup.get(id))
      .filter((thread): thread is ChatThread => Boolean(thread));
  }, [chatThreads, openThreadIds]);

  const handleOpenThread = useCallback(
    (threadId: string) => {
      if (!chatThreads.some((thread) => thread.id === threadId)) {
        return;
      }
      setOpenThreadIds((prev) => (prev.includes(threadId) ? prev : [...prev, threadId]));
      setActiveThreadId(threadId);
    },
    [chatThreads],
  );

  const handleCreateThread = useCallback(() => {
    const nextNumber = threadCounterRef.current + 1;
    threadCounterRef.current = nextNumber;
    const nowIso = new Date().toISOString();
    const newThread: ChatThread = {
      id: createId('thread'),
      title: `Thread #${nextNumber}`,
      messages: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    updateThreads((prev) => [...prev, newThread]);
    setOpenThreadIds((prev) => [...prev, newThread.id]);
    setActiveThreadId(newThread.id);
    setVisibleUserMessages(5);
    setSelectedChatId(null);
    setChatSuggestions([]);
    setChatSuggestionIndex(0);
  }, [updateThreads]);

  const handleCloseThread = useCallback((threadId: string) => {
    setOpenThreadIds((prev) => {
      if (!prev.includes(threadId)) {
        return prev;
      }
      const next = prev.filter((id) => id !== threadId);
      setActiveThreadId((current) => {
        if (current && current !== threadId) {
          return current;
        }
        return next[0] ?? null;
      });
      return next;
    });
    setThreadMenu(null);
  }, []);

  const buildSerializableProject = useCallback(() => {
    if (!project) return null;
    const sanitizedTitle = titleDraft.trim() || DEFAULT_PROJECT_TITLE;
    const notationArray: Project['notation'] = notationText.trim()
      ? [
          {
            id: project.notation[0]?.id || 'notation',
            symbol: project.notation[0]?.symbol || '',
            description: notationText.trim(),
          },
        ]
      : [];

    return {
      ...project,
      title: sanitizedTitle,
      notation: notationArray,
      definitions,
      lemmas,
      facts,
      conjectures,
      ideas,
      pitfalls,
      chatThreads,
    } satisfies Project;
  }, [
    project,
    titleDraft,
    notationText,
    definitions,
    lemmas,
    facts,
    conjectures,
    ideas,
    pitfalls,
    chatThreads,
  ]);

  const snapshotFromProject = useCallback((proj: Project) => {
    const { updatedAt, ...rest } = proj;
    return JSON.stringify(rest);
  }, []);

  const beginRenamingThread = useCallback((thread: ChatThread) => {
    setRenamingThreadId(thread.id);
    setThreadNameDraft(thread.title);
    setThreadMenu(null);
  }, []);

  const finishRenamingThread = useCallback(
    (threadId: string, rawName: string) => {
      updateThreadById(threadId, (thread) => {
        const trimmed = rawName.trim();
        let title = trimmed;
        if (!trimmed.length) {
          const existingNumber = extractThreadNumber(thread.title);
          if (existingNumber > 0) {
            title = `Thread #${existingNumber}`;
          } else {
            const nextNumber = threadCounterRef.current + 1;
            threadCounterRef.current = nextNumber;
            title = `Thread #${nextNumber}`;
          }
        }
        if (title === thread.title) {
          return thread;
        }
        return {
          ...thread,
          title,
          updatedAt: new Date().toISOString(),
        };
      });
      setRenamingThreadId(null);
      setThreadNameDraft('');
    },
    [updateThreadById],
  );

  const cancelRenamingThread = useCallback(() => {
    setRenamingThreadId(null);
    setThreadNameDraft('');
  }, []);

  const handleDeleteThread = useCallback(
    (threadId: string) => {
      setRenamingThreadId((current) => (current === threadId ? null : current));
      updateThreads((prev) => {
        if (!prev.some((thread) => thread.id === threadId)) {
          return prev;
        }
        const next = prev.filter((thread) => thread.id !== threadId);
        setOpenThreadIds((current) => {
          const filtered = current
            .filter((id) => id !== threadId)
            .filter((id) => next.some((thread) => thread.id === id));
          if (!filtered.length && next.length) {
            filtered.push(next[0].id);
          }
          return filtered;
        });
        setActiveThreadId((current) => {
          if (current && current !== threadId) {
            if (next.some((thread) => thread.id === current)) {
              return current;
            }
          }
          return next[0]?.id ?? null;
        });
        return next;
      });
      setSelectedChatId(null);
      setThreadMenu(null);
    },
    [updateThreads],
  );

  const handleRenameProject = useCallback(() => {
    if (!project) return;
    const currentTitle = project.title?.trim() || DEFAULT_PROJECT_TITLE;
    setRenameDraft(currentTitle);
    setShowRenameModal(true);
  }, [project]);

  const handleRenameSave = useCallback(() => {
    if (!project) {
      setShowRenameModal(false);
      return;
    }
    const sanitized = renameDraft.trim() || DEFAULT_PROJECT_TITLE;
    if (sanitized === (project.title?.trim() || DEFAULT_PROJECT_TITLE)) {
      setShowRenameModal(false);
      return;
    }
    setTitleDraft(sanitized);
    setProject((prev) => (prev ? { ...prev, title: sanitized } : prev));
    setShowRenameModal(false);
  }, [project, renameDraft]);

  useEffect(() => {
    if (!threadMenu) {
      return undefined;
    }
    const closeMenu = () => setThreadMenu(null);
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setThreadMenu(null);
      }
    };
    window.addEventListener('mousedown', closeMenu);
    window.addEventListener('contextmenu', closeMenu);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', closeMenu);
      window.removeEventListener('contextmenu', closeMenu);
    window.removeEventListener('keydown', handleKey);
    };
  }, [threadMenu]);

  const [showDefinitionForm, setShowDefinitionForm] = useState(false);
  const [newDefinitionTitle, setNewDefinitionTitle] = useState("");
  const [newDefinitionBody, setNewDefinitionBody] = useState("");
  const [showLemmaForm, setShowLemmaForm] = useState(false);
  const [newLemmaTitle, setNewLemmaTitle] = useState("");
  const [newLemmaBody, setNewLemmaBody] = useState("");

  const [showFactForm, setShowFactForm] = useState(false);
  const [newFactTitle, setNewFactTitle] = useState("");
  const [newFactBody, setNewFactBody] = useState("");

  const [showConjectureForm, setShowConjectureForm] = useState(false);
  const [newConjectureTitle, setNewConjectureTitle] = useState("");
  const [newConjectureBody, setNewConjectureBody] = useState("");

  const [showIdeaForm, setShowIdeaForm] = useState(false);
  const [newIdeaName, setNewIdeaName] = useState("");
  const [newIdeaDescription, setNewIdeaDescription] = useState("");

  const [showPitfallForm, setShowPitfallForm] = useState(false);
  const [newPitfallName, setNewPitfallName] = useState("");
  const [newPitfallDescription, setNewPitfallDescription] = useState("");

  const [llmProvider, setLlmProvider] = useState('openai');
  const [llmModel, setLlmModel] = useState('gpt-4.1-mini');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const [editingDefinition, setEditingDefinition] = useState<{ id: string } | null>(null);
  const [definitionEditTitle, setDefinitionEditTitle] = useState("");
  const [definitionEditBody, setDefinitionEditBody] = useState("");
  const [editingLemma, setEditingLemma] = useState<{ id: string } | null>(null);
  const [lemmaEditTitle, setLemmaEditTitle] = useState("");
  const [lemmaEditBody, setLemmaEditBody] = useState("");
  const [proofEditLemmaId, setProofEditLemmaId] = useState<string | null>(null);
  const [proofDraft, setProofDraft] = useState('');

  const [editingFact, setEditingFact] = useState<{ id: string } | null>(null);
  const [factEditTitle, setFactEditTitle] = useState("");
  const [factEditBody, setFactEditBody] = useState("");

  const [editingConjecture, setEditingConjecture] = useState<{ id: string } | null>(null);
  const [conjectureEditTitle, setConjectureEditTitle] = useState("");
  const [conjectureEditBody, setConjectureEditBody] = useState("");

  const [editingIdea, setEditingIdea] = useState<{ id: string } | null>(null);
  const [ideaEditName, setIdeaEditName] = useState("");
  const [ideaEditDescription, setIdeaEditDescription] = useState("");

  const [editingPitfall, setEditingPitfall] = useState<{ id: string } | null>(null);
  const [pitfallEditName, setPitfallEditName] = useState("");
  const [pitfallEditDescription, setPitfallEditDescription] = useState("");

  const closeAllEditors = useCallback(() => {
    setEditingDefinition(null);
    setDefinitionEditTitle("");
    setDefinitionEditBody("");
    setShowDefinitionForm(false);
    setNewDefinitionTitle("");
    setNewDefinitionBody("");
    setEditingLemma(null);
    setLemmaEditTitle("");
    setLemmaEditBody("");
    setProofEditLemmaId(null);
    setProofDraft('');
    setEditingFact(null);
    setFactEditTitle("");
    setFactEditBody("");
    setEditingConjecture(null);
    setConjectureEditTitle("");
    setConjectureEditBody("");
    setEditingIdea(null);
    setIdeaEditName("");
    setIdeaEditDescription("");
    setEditingPitfall(null);
    setPitfallEditName("");
    setPitfallEditDescription("");
    setActiveProofLemma(null);
  }, []);

  const handleDeleteLemma = (id: string) => {
    setLemmas((prev) => {
      const next = prev.filter((lemma) => lemma.id !== id);
      if (selectedLemmaId === id) {
        setSelectedLemmaId(next[0]?.id ?? "");
      }
      return next;
    });
    if (editingLemma?.id === id) {
      setEditingLemma(null);
      setLemmaEditTitle("");
      setLemmaEditBody("");
    }
    if (activeProofLemma?.id === id) {
      setActiveProofLemma(null);
    }
    if (proofEditLemmaId === id) {
      setProofEditLemmaId(null);
      setProofDraft('');
    }
  };

  const handleDeleteDefinition = (id: string) => {
    setDefinitions((prev) => prev.filter((definition) => definition.id !== id));
    if (editingDefinition?.id === id) {
      setEditingDefinition(null);
      setDefinitionEditTitle("");
      setDefinitionEditBody("");
    }
  };

  const handleDeleteFact = (id: string) => {
    setFacts((prev) => prev.filter((fact) => fact.id !== id));
    if (editingFact?.id === id) {
      setEditingFact(null);
      setFactEditTitle("");
      setFactEditBody("");
    }
  };

  const handleDeleteConjecture = (id: string) => {
    setConjectures((prev) => prev.filter((conjecture) => conjecture.id !== id));
    if (editingConjecture?.id === id) {
      setEditingConjecture(null);
      setConjectureEditTitle("");
      setConjectureEditBody("");
    }
  };

  const handleDeleteIdea = (id: string) => {
    setIdeas((prev) => prev.filter((idea) => idea.id !== id));
    if (editingIdea?.id === id) {
      setEditingIdea(null);
      setIdeaEditName("");
      setIdeaEditDescription("");
    }
  };

  const handleDeletePitfall = (id: string) => {
    setPitfalls((prev) => prev.filter((pitfall) => pitfall.id !== id));
    if (editingPitfall?.id === id) {
      setEditingPitfall(null);
      setPitfallEditName("");
      setPitfallEditDescription("");
    }
  };

  const loadProject = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { project: loadedProject, etag: loadedEtag } = await getProject(projectId);
      const definitionsWithNames = (loadedProject.definitions ?? []).map((definition) => ({
        ...definition,
        title: stripAutoLabel(definition.title, 'Definition'),
      }));
      const lemmasWithNames = loadedProject.lemmas.map((lemma) => ({
        ...lemma,
        title: stripAutoLabel(lemma.title, "Lemma"),
        proof: typeof lemma.proof === 'string' ? lemma.proof : '',
      }));
      const factsWithNames = loadedProject.facts.map((fact) => ({
        ...fact,
        title: stripAutoLabel(fact.title, "Fact"),
      }));
      const conjecturesWithNames = loadedProject.conjectures.map((conjecture) => ({
        ...conjecture,
        title: stripAutoLabel(conjecture.title, "Conjecture"),
      }));
      const ideasWithNames = loadedProject.ideas.map((idea) => ({
        ...idea,
        name: stripAutoLabel(idea.name, "Idea"),
      }));
      const pitfallsWithNames = loadedProject.pitfalls.map((pitfall) => ({
        ...pitfall,
        name: stripAutoLabel(pitfall.name, "Pitfall"),
      }));

      const rawThreads = Array.isArray(loadedProject.chatThreads)
        ? loadedProject.chatThreads
        : [];
      let threads: ChatThread[] = rawThreads.map((thread, index) => {
        const messages = Array.isArray(thread.messages) ? thread.messages : [];
        return {
          id: thread.id && typeof thread.id === 'string' ? thread.id : createId('thread'),
          title: thread.title && thread.title.trim().length ? thread.title.trim() : `Thread #${index + 1}`,
          messages: messages
            .filter((message) => message && typeof message.content === 'string')
            .map((message, messageIndex) => ({
              id:
                message.id && typeof message.id === 'string'
                  ? message.id
                  : createId(`chat-${messageIndex}`),
              role: message.role === 'assistant' ? 'assistant' : 'user',
              content: message.content,
            })),
          createdAt: thread.createdAt && typeof thread.createdAt === 'string'
            ? thread.createdAt
            : new Date().toISOString(),
          updatedAt: thread.updatedAt && typeof thread.updatedAt === 'string'
            ? thread.updatedAt
            : new Date().toISOString(),
        };
      });

      if (!threads.length) {
        const fallbackMessages = Array.isArray(loadedProject.chatHistory)
          ? loadedProject.chatHistory
              .filter((message) => message && typeof message.content === 'string')
              .map((message, index) => ({
                id: message.id || createId(`chat-${index}`),
                role: message.role === 'assistant' ? 'assistant' : 'user',
                content: message.content,
              }))
          : [];
        const createdAt = new Date().toISOString();
        threads = [
          {
            id: createId('thread'),
            title: 'Thread #1',
            messages: fallbackMessages,
            createdAt,
            updatedAt: createdAt,
          },
        ];
      }

      const highestThreadNumber = threads.reduce((max, thread) => {
        const number = extractThreadNumber(thread.title);
        return number > max ? number : max;
      }, 0);
      threadCounterRef.current = Math.max(highestThreadNumber, threads.length);

      const normalizedProject: Project = {
        ...loadedProject,
        definitions: definitionsWithNames,
        lemmas: lemmasWithNames,
        facts: factsWithNames,
        conjectures: conjecturesWithNames,
        ideas: ideasWithNames,
        pitfalls: pitfallsWithNames,
        chatThreads: threads,
      };

      const snapshot = snapshotFromProject(normalizedProject);

      setProject(normalizedProject);
      setEtag(loadedEtag);
      setNotationText(
        normalizedProject.notation[0]?.description?.trim() ||
          normalizedProject.notation[0]?.symbol?.trim() ||
          "",
      );
      setDefinitions(definitionsWithNames);
      setLemmas(lemmasWithNames);
      setFacts(factsWithNames);
      setConjectures(conjecturesWithNames);
      setIdeas(ideasWithNames);
      setPitfalls(pitfallsWithNames);
      setChatThreads(threads);
      setOpenThreadIds(threads.map((thread) => thread.id));
      setActiveThreadId((current) => {
        if (current && threads.some((thread) => thread.id === current)) {
          return current;
        }
        return threads[0]?.id ?? null;
      });
      setLastSavedSnapshot(snapshot);
      setIsDirty(false);
      setVisibleUserMessages(5);
      setRawChatMessages({});
      setSelectedChatId(null);
      setSelectedLemmaId(lemmasWithNames[0]?.id ?? "");
      setActiveProofLemma(null);
      setQueryText("");
      closeAllEditors();
      setDraft(null);
      setDraftError(null);
      setStatus(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load project";
      setError(message);
      setLastSavedSnapshot(null);
      setIsDirty(false);
    } finally {
      setLoading(false);
    }
  }, [projectId, snapshotFromProject]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  useEffect(() => {
    if (project) {
      const nextTitle = project.title?.trim() || DEFAULT_PROJECT_TITLE;
      setTitleDraft(nextTitle);
    } else {
      setTitleDraft('');
    }
  }, [project?.title, project]);

  useEffect(() => {
    const nextTitle = project
      ? project.title?.trim() || DEFAULT_PROJECT_TITLE
      : 'Cursor for Math Proofs';
    if (window.desktopApi?.setWindowTitle) {
      void window.desktopApi.setWindowTitle(nextTitle);
    }
  }, [project?.title, project]);

  useEffect(() => () => {
    if (window.desktopApi?.setWindowTitle) {
      void window.desktopApi.setWindowTitle('Cursor for Math Proofs');
    }
  }, []);

  useEffect(() => {
    setVisibleUserMessages(5);
    setSelectedChatId(null);
    setChatSuggestions([]);
    setChatSuggestionIndex(0);
    setQueryText('');
  }, [activeThreadId]);

  const serializedProjectSnapshot = useMemo(() => {
    const payload = buildSerializableProject();
    if (!payload) return null;
    const { updatedAt, ...rest } = payload;
    return JSON.stringify(rest);
  }, [buildSerializableProject]);

  useEffect(() => {
    if (serializedProjectSnapshot === null) {
      setIsDirty(false);
      return;
    }
    if (lastSavedSnapshot === null) {
      setIsDirty(true);
      return;
    }
    setIsDirty(serializedProjectSnapshot !== lastSavedSnapshot);
  }, [serializedProjectSnapshot, lastSavedSnapshot]);

  useEffect(() => {
    if (showRenameModal) {
      setRenameDraft(project?.title?.trim() || DEFAULT_PROJECT_TITLE);
    }
  }, [project?.title, showRenameModal]);

  useEffect(() => {
    if (!showRenameModal) return;
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowRenameModal(false);
        setRenameDraft(project?.title?.trim() || DEFAULT_PROJECT_TITLE);
      } else if (event.key === 'Enter') {
        if ((event.target as HTMLElement)?.tagName === 'INPUT') {
          event.preventDefault();
          handleRenameSave();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleRenameSave, project?.title, showRenameModal]);

  useEffect(() => {
    let isMounted = true;
    async function loadConfig() {
      try {
        if (!window.desktopApi?.getConfig) return;
        const config = await window.desktopApi.getConfig();
        if (!isMounted || !config) return;
        setLlmProvider(config.llm?.provider?.trim() || 'openai');
        setLlmModel(config.llm?.model?.trim() || 'gpt-4.1-mini');
        setLlmApiKey(config.llm?.apiKey?.trim() || '');
      } catch (error) {
        console.error('Failed to load LLM config', error);
      }
    }
    loadConfig();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!lemmas.length) {
      setSelectedLemmaId("");
      return;
    }
    if (!lemmas.some((lemma) => lemma.id === selectedLemmaId)) {
      setSelectedLemmaId(lemmas[0].id);
    }
  }, [lemmas, selectedLemmaId]);

  const performSave = useCallback(
    async ({ silent = false } = {}) => {
      if (!project || isSaving || !etag) return;
      const payload = buildSerializableProject();
      if (!payload) return;

      if (payload.title !== titleDraft) {
        setTitleDraft(payload.title);
      }

      if (!silent) {
        setStatus('Saving project...');
        setError(null);
      }

      setIsSaving(true);
      try {
        const updated: Project = {
          ...payload,
          updatedAt: new Date().toISOString(),
        };
        const { etag: newEtag } = await saveProject(updated, etag);
        setProject(updated);
        setDefinitions(updated.definitions);
        setLemmas(updated.lemmas);
        setFacts(updated.facts);
        setConjectures(updated.conjectures);
        setIdeas(updated.ideas);
        setPitfalls(updated.pitfalls);
        setChatThreads(updated.chatThreads);
        if (!silent) {
          closeAllEditors();
        }
        setEtag(newEtag);
        setLastSavedSnapshot(snapshotFromProject(updated));
        setIsDirty(false);
        if (!silent) {
          setStatus('Project saved');
          setTimeout(() => setStatus(null), 2000);
        }
      } catch (err) {
        if (!silent) {
          if (err instanceof ApiError && err.code === 'PRECONDITION_FAILED') {
            setStatus(null);
            setError('Save conflict: project was updated elsewhere. Reload and try again.');
          } else if (err instanceof Error) {
            setStatus(null);
            setError(err.message);
          } else {
            setStatus(null);
            setError('Failed to save project');
          }
        }
      } finally {
        setIsSaving(false);
      }
    },
    [
      project,
      isSaving,
      buildSerializableProject,
      saveProject,
      etag,
      closeAllEditors,
      snapshotFromProject,
      titleDraft,
    ],
  );

  const handleSave = useCallback(() => {
    void performSave({ silent: false });
  }, [performSave]);

  useEffect(() => {
    if (!project) return undefined;
    const interval = window.setInterval(() => {
      if (!isDirty || isSaving || showRenameModal || showUnsavedModal) {
        return;
      }
      void performSave({ silent: true });
    }, 120_000);
    return () => window.clearInterval(interval);
  }, [project, isDirty, isSaving, performSave, showRenameModal, showUnsavedModal]);

  const handleDraftProof = useCallback(async () => {
    if (!project) return;
    setDraftError(null);
    setDraft(null);
    try {
      const data = await draftProof(project.id, selectedLemmaId || undefined);
      setDraft({ markdown: data.draft_md, warnings: data.warnings });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch draft';
      setDraftError(message);
    }
  }, [project, selectedLemmaId, draftProof]);

  const handleExport = useCallback(async () => {
    if (!project) return;
    setStatus('Preparing LaTeX export...');
    try {
      const { blob, filename } = await exportLatex(project.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setStatus('Export downloaded');
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      setStatus(null);
      const message = err instanceof Error ? err.message : 'Failed to export LaTeX';
      setError(message);
    }
  }, [project, exportLatex]);

  const handleShowProof = useCallback((lemma: Project['lemmas'][number]) => {
    setSelectedLemmaId(lemma.id);
    setProofEditLemmaId(null);
    setProofDraft('');
    setActiveProofLemma(lemma);
  }, []);

  const handleGenerateProof = useCallback(
    (lemma: Project['lemmas'][number]) => {
      const targetThread = activeThread;
      if (!targetThread) {
        return;
      }
      const statement = lemma.statementTex?.trim() || lemma.title?.trim() || lemma.id || '';
      const message = statement
        ? `Generate proof for Lemma: ${statement}`
        : 'Generate proof for the selected lemma.';
      const entry: ChatMessage = { id: createId('chat-user'), role: 'user', content: message };
      const timestamp = new Date().toISOString();
      updateThreadById(targetThread.id, (thread) => ({
        ...thread,
        messages: [...thread.messages, entry],
        updatedAt: timestamp,
      }));
      setSelectedLemmaId(lemma.id);
      setProofEditLemmaId(null);
      setProofDraft('');
    },
    [activeThread, updateThreadById],
  );

  const handleSaveProof = useCallback(
    (lemmaId: string, proof: string) => {
      setLemmas((prev) => {
        const next = prev.map((lemma) =>
          lemma.id === lemmaId
            ? {
                ...lemma,
                proof,
              }
            : lemma,
        );
        const updatedLemma = next.find((lemma) => lemma.id === lemmaId) ?? null;
        if (updatedLemma && activeProofLemma?.id === lemmaId) {
          setActiveProofLemma(updatedLemma);
        }
        return next;
      });
      setProofEditLemmaId(null);
      setProofDraft('');
    },
    [activeProofLemma],
  );

  const updateChatSuggestions = useCallback(
    (value: string, caretPosition: number) => {
      const caret = Number.isFinite(caretPosition) ? Math.max(0, caretPosition) : value.length;
      const beforeCaret = value.slice(0, caret);
      const hashIndex = beforeCaret.lastIndexOf('#');

      const resetSuggestions = () => {
        setChatSuggestions([]);
        setChatSuggestionIndex(0);
      };

      if (hashIndex === -1) {
        resetSuggestions();
        return;
      }

      const token = beforeCaret.slice(hashIndex + 1);
      if (/[^A-Za-z0-9:]/.test(token)) {
        resetSuggestions();
        return;
      }

      const colonIndex = token.indexOf(':');
      const typePart = (colonIndex >= 0 ? token.slice(0, colonIndex) : token).trim();
      const numberPartRaw = colonIndex >= 0 ? token.slice(colonIndex + 1) : '';
      if (numberPartRaw && !/^\d*$/.test(numberPartRaw)) {
        resetSuggestions();
        return;
      }

      const KIND_LIST: ChatReferenceKind[] = ['Lemma', 'Idea', 'Conjecture', 'Fact', 'Pitfall', 'Definition'];
      const matchedKinds = KIND_LIST.filter((kind) =>
        kind.toLowerCase().startsWith(typePart.toLowerCase()),
      );

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const dataMap: Record<ChatReferenceKind, { items: any[]; getName: NameGetter }> = {
        Lemma: {
          items: lemmas,
          getName: (item, index) => getLemmaName(item).trim() || `Lemma ${index + 1}`,
        },
        Idea: {
          items: ideas,
          getName: (item, index) => getIdeaName(item).trim() || `Idea ${index + 1}`,
        },
        Conjecture: {
          items: conjectures,
          getName: (item, index) => getConjectureName(item).trim() || `Conjecture ${index + 1}`,
        },
        Fact: {
          items: facts,
          getName: (item, index) => getFactName(item).trim() || `Fact ${index + 1}`,
        },
        Pitfall: {
          items: pitfalls,
          getName: (item, index) => getPitfallName(item).trim() || `Pitfall ${index + 1}`,
        },
        Definition: {
          items: definitions,
          getName: (item, index) => getDefinitionName(item).trim() || `Definition ${index + 1}`,
        },
      };

      const startIndex = hashIndex;
      const endIndex = caret;
      const suggestions: ChatSuggestion[] = [];

      const resolveKind = (): ChatReferenceKind | null => {
        if (colonIndex >= 0) {
          const exact = KIND_LIST.find((kind) => kind.toLowerCase() === typePart.toLowerCase());
          return exact ?? null;
        }
        if (matchedKinds.length === 1) {
          return matchedKinds[0];
        }
        return null;
      };

      const resolvedKind = resolveKind();
      if (resolvedKind) {
        const source = dataMap[resolvedKind];
        const digits = numberPartRaw.trim();
        const baseItems = Array.isArray(source.items) ? source.items : [];
        const filtered = baseItems
          .map((item, index) => ({ item, index }))
          .filter((entry) => {
            if (!digits) return true;
            return (entry.index + 1).toString().startsWith(digits);
          });

        if (!filtered.length) {
          resetSuggestions();
          return;
        }

        filtered.forEach(({ item, index }) => {
          const labelName = source.getName(item, index);
          suggestions.push({
            id: `${resolvedKind}-${index}`,
            label: `#${resolvedKind}:${index + 1} (${labelName})`,
            value: `#${resolvedKind}:${index + 1}#`,
            start: startIndex,
            end: endIndex,
            appendSpace: true,
          });
        });

        setChatSuggestions(suggestions);
        setChatSuggestionIndex(0);
        return;
      }

      if (!typePart.length || matchedKinds.length > 0) {
        matchedKinds.forEach((kind) => {
          suggestions.push({
            id: `kind-${kind}`,
            label: `Insert #${kind}:`,
            value: `#${kind}:`,
            start: startIndex,
            end: endIndex,
            appendSpace: false,
          });
        });
      }

      if (!suggestions.length) {
        resetSuggestions();
        return;
      }

      setChatSuggestions(suggestions);
      setChatSuggestionIndex(0);
    },
    [lemmas, ideas, conjectures, facts, pitfalls, definitions],
  );

  const applyChatSuggestion = useCallback(
    (suggestion: ChatSuggestion) => {
      const textarea = chatInputRef.current;
      const before = queryText.slice(0, suggestion.start);
      const after = queryText.slice(suggestion.end);
      let insertion = suggestion.value;

      if (suggestion.appendSpace) {
        const nextChar = after.charAt(0);
        if (!nextChar || !/\s/.test(nextChar)) {
          insertion += ' ';
        }
      }

      const nextValue = `${before}${insertion}${after}`;
      const caret = before.length + insertion.length;
      setQueryText(nextValue);
      setChatSuggestions([]);
      setChatSuggestionIndex(0);

      requestAnimationFrame(() => {
        if (textarea) {
          textarea.focus();
          textarea.setSelectionRange(caret, caret);
        }
        updateChatSuggestions(nextValue, caret);
      });
    },
    [queryText, updateChatSuggestions],
  );

  const handleChatInputChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const { value, selectionStart } = event.target;
      setQueryText(value);
      updateChatSuggestions(value, selectionStart ?? value.length);
    },
    [updateChatSuggestions],
  );

  const sendChatMessage = useCallback(() => {
    const trimmed = queryText.trim();
    if (!trimmed || !project) {
      return;
    }

    const targetThread = activeThread;
    if (!targetThread) {
      return;
    }

    if (trimmed.toLowerCase() === 'clear') {
      setQueryText('');
      setVisibleUserMessages(5);
      setSelectedChatId(null);
      setRawChatMessages({});
      setChatSuggestions([]);
      setChatSuggestionIndex(0);
      return;
    }

    const notationArray: Project['notation'] = notationText.trim()
      ? [
          {
            id: project.notation[0]?.id || 'notation',
            symbol: project.notation[0]?.symbol || '',
            description: notationText.trim(),
          },
        ]
      : [];

    const promptProject: Project = {
      ...project,
      notation: notationArray,
      definitions,
      lemmas,
      facts,
      conjectures,
      ideas,
      pitfalls,
      chatThreads,
    };

    const prompt = buildPrompt(promptProject, trimmed);
    const userMessage: ChatMessage = { id: createId('chat-user'), role: 'user', content: trimmed };
    const placeholderResponseId = createId('chat-assistant');
    const placeholderMessage: ChatMessage = {
      id: placeholderResponseId,
      role: 'assistant',
      content: 'Generating response…',
    };

    const llmHistory = [...targetThread.messages, userMessage];
    const timestamp = new Date().toISOString();

    updateThreadById(targetThread.id, (thread) => ({
      ...thread,
      messages: [...thread.messages, userMessage, placeholderMessage],
      updatedAt: timestamp,
    }));

    setRawChatMessages((prev) => ({ ...prev, [placeholderResponseId]: false }));
    setQueryText('');
    setChatSuggestions([]);
    setChatSuggestionIndex(0);
    setSelectedChatId(null);

    const historyPayload = llmHistory.map((entry) => ({ role: entry.role, content: entry.content }));

    void (async () => {
      try {
        const message = await sendChatPrompt({
          prompt,
          provider: llmProvider,
          model: llmModel,
          apiKey: llmApiKey?.trim() || undefined,
          history: historyPayload,
        });
        updateThreadById(targetThread.id, (thread) => {
          const exists = thread.messages.some((entry) => entry.id === placeholderResponseId);
          if (!exists) {
            return thread;
          }
          const nextMessages = thread.messages.map((entry) =>
            entry.id === placeholderResponseId
              ? {
                  ...entry,
                  content: message,
                }
              : entry,
          );
          return {
            ...thread,
            messages: nextMessages,
            updatedAt: new Date().toISOString(),
          };
        });
      } catch (error) {
        const message = error instanceof ApiError ? error.message : 'Failed to reach the assistant';
        updateThreadById(targetThread.id, (thread) => {
          const exists = thread.messages.some((entry) => entry.id === placeholderResponseId);
          if (!exists) {
            return thread;
          }
          const nextMessages = thread.messages.map((entry) =>
            entry.id === placeholderResponseId
              ? {
                  ...entry,
                  content: `Error: ${message}`,
                }
              : entry,
          );
          return {
            ...thread,
            messages: nextMessages,
            updatedAt: new Date().toISOString(),
          };
        });
      }
    })();
  }, [
    project,
    queryText,
    activeThread,
    notationText,
    definitions,
    lemmas,
    facts,
    conjectures,
    ideas,
    pitfalls,
    chatThreads,
    llmProvider,
    llmModel,
    llmApiKey,
    updateThreadById,
  ]);

  const handleChatKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (chatSuggestions.length) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setChatSuggestionIndex((prev) => (prev + 1) % chatSuggestions.length);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setChatSuggestionIndex((prev) => (prev - 1 + chatSuggestions.length) % chatSuggestions.length);
          return;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault();
          applyChatSuggestion(chatSuggestions[chatSuggestionIndex]);
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          setChatSuggestions([]);
          setChatSuggestionIndex(0);
          return;
        }
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
      }
    },
    [applyChatSuggestion, chatSuggestionIndex, chatSuggestions, sendChatMessage],
  );

  useEffect(() => {
    if (!chatEndRef.current) return;
    chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length]);

  useEffect(() => {
    setChatMessages(computeVisibleMessages(activeThreadMessages, visibleUserMessages));
  }, [activeThreadMessages, visibleUserMessages]);

  useEffect(() => {
    if (!chatSuggestions.length) {
      setChatSuggestionIndex(0);
    } else if (chatSuggestionIndex >= chatSuggestions.length) {
      setChatSuggestionIndex(0);
    }
  }, [chatSuggestionIndex, chatSuggestions]);

  useEffect(() => {
    if (!activeProofLemma) return;
    const latest = lemmas.find((lemma) => lemma.id === activeProofLemma.id);
    if (!latest) {
      setActiveProofLemma(null);
    } else if (latest !== activeProofLemma) {
      setActiveProofLemma(latest);
    }
  }, [activeProofLemma, lemmas]);

  useEffect(() => {
    if (!window.desktopApi || typeof window.desktopApi.onMenu !== 'function') {
      return undefined;
    }
    const unsubscribers = [
      window.desktopApi.onMenu('menu:saveProject', () => {
        void handleSave();
      }),
      window.desktopApi.onMenu('menu:reloadProject', () => {
        void loadProject();
      }),
      window.desktopApi.onMenu('menu:exportLatex', () => {
        void handleExport();
      }),
      window.desktopApi.onMenu('menu:draftProof', () => {
        void handleDraftProof();
      }),
    ];
    return () => {
      unsubscribers.forEach((unsubscribe) => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      });
    };
  }, [handleSave, loadProject, handleExport, handleDraftProof]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const primaryPressed = isMac ? event.metaKey : event.ctrlKey;
      if (primaryPressed && event.shiftKey && (event.key === 'r' || event.key === 'R')) {
        event.preventDefault();
        handleRenameProject();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleRenameProject]);

  useEffect(() => {
    if (!window.desktopApi?.onAppCloseRequest) {
      return undefined;
    }
    const unsubscribe = window.desktopApi.onAppCloseRequest(() => {
      setShowRenameModal(false);
      if (isDirty) {
        setShowUnsavedModal(true);
      } else {
        if (window.desktopApi?.respondToClose) {
          void window.desktopApi.respondToClose(true);
        }
      }
    });
    return unsubscribe;
  }, [isDirty]);

  if (loading) {
    return (
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Loading project...</h2>
        <p className="text-sm text-slate-400">Fetching data for {projectId}.</p>
      </section>
    );
  }

  if (!project) {
    return (
      <section className="space-y-4">
        <p className="text-sm text-red-400">{error ?? "Project not found."}</p>
        <button className={PRIMARY_BUTTON_CLASS} onClick={loadProject}>
          Retry
        </button>
      </section>
    );
  }

  const leftPane = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex-1 min-h-0 space-y-4 overflow-y-auto pr-1">
        <NotationEditor value={notationText} onChange={setNotationText} />

        <UnitSection
          title="Definitions"
          items={definitions}
          emptyMessage="No definitions yet."
          getKey={(definition) => definition.id}
          onAdd={() => {
            setNewDefinitionTitle("");
            setNewDefinitionBody("");
            setShowDefinitionForm(true);
          }}
          addDisabled={showDefinitionForm}
          renderItem={(definition, index, bulkAction) => {
            if (editingDefinition?.id === definition.id) {
              return (
                <AddItemForm
                  titleLabel="Definition name"
                  bodyLabel="Definition statement (LaTeX allowed)"
                  titleValue={definitionEditTitle}
                  bodyValue={definitionEditBody}
                  onTitleChange={setDefinitionEditTitle}
                  onBodyChange={setDefinitionEditBody}
                  onCancel={() => {
                    setEditingDefinition(null);
                    setDefinitionEditTitle("");
                    setDefinitionEditBody("");
                  }}
                  onSubmit={() => {
                    if (!definitionEditTitle.trim() || !definitionEditBody.trim()) return;
                    const id = editingDefinition?.id;
                    if (!id) return;
                    setDefinitions((prev) =>
                      prev.map((item) =>
                        item.id === id
                          ? {
                              ...item,
                              title: definitionEditTitle.trim(),
                              statementTex: definitionEditBody.trim(),
                            }
                          : item,
                      ),
                    );
                    setEditingDefinition(null);
                    setDefinitionEditTitle("");
                    setDefinitionEditBody("");
                  }}
                  submitLabel="Save Definition"
                  canSubmit={Boolean(definitionEditTitle.trim() && definitionEditBody.trim())}
                />
              );
            }
            return (
              <TextUnit
                className="rounded border border-transparent bg-slate-900/30 p-3"
                heading={formatUnitHeading("Definition", index, definition.title)}
                body={getDefinitionBody(definition)}
                bulkAction={bulkAction}
                renderControls={() => (
                  <ItemControls
                    editLabel="Edit definition"
                    deleteLabel="Delete definition"
                    onEdit={() => {
                      setEditingDefinition({ id: definition.id });
                      setDefinitionEditTitle(definition.title?.trim() || "");
                      setDefinitionEditBody(definition.statementTex?.trim() || "");
                    }}
                    onDelete={() => handleDeleteDefinition(definition.id)}
                  />
                )}
              />
            );
          }}
        >
          {showDefinitionForm ? (
            <AddItemForm
              titleLabel="Definition name"
              bodyLabel="Definition statement (LaTeX allowed)"
              titleValue={newDefinitionTitle}
              bodyValue={newDefinitionBody}
              onTitleChange={setNewDefinitionTitle}
              onBodyChange={setNewDefinitionBody}
              onCancel={() => {
                setShowDefinitionForm(false);
                setNewDefinitionTitle("");
                setNewDefinitionBody("");
              }}
              onSubmit={() => {
                if (!newDefinitionTitle.trim() || !newDefinitionBody.trim()) return;
                const definition = {
                  id: createId("definition"),
                  title: newDefinitionTitle.trim(),
                  statementTex: newDefinitionBody.trim(),
                  tags: [],
                };
                setDefinitions((prev) => [...prev, definition]);
                setShowDefinitionForm(false);
                setNewDefinitionTitle("");
                setNewDefinitionBody("");
              }}
              submitLabel="Add Definition"
              canSubmit={Boolean(newDefinitionTitle.trim() && newDefinitionBody.trim())}
            />
          ) : null}
        </UnitSection>

        <UnitSection
          title="Lemmas"
          items={lemmas}
          emptyMessage="No lemmas yet."
          getKey={(lemma) => lemma.id}
          onAdd={() => {
            setNewLemmaTitle("");
            setNewLemmaBody("");
            setShowLemmaForm(true);
          }}
          addDisabled={showLemmaForm}
          renderItem={(lemma, index, bulkAction) => {
            if (editingLemma?.id === lemma.id) {
              return (
                <AddItemForm
                  titleLabel="Lemma name"
                  bodyLabel="Lemma statement (LaTeX allowed)"
                  titleValue={lemmaEditTitle}
                  bodyValue={lemmaEditBody}
                  onTitleChange={setLemmaEditTitle}
                  onBodyChange={setLemmaEditBody}
                  onCancel={() => {
                    setEditingLemma(null);
                    setLemmaEditTitle("");
                    setLemmaEditBody("");
                  }}
                  onSubmit={() => {
                    if (!lemmaEditTitle.trim() || !lemmaEditBody.trim()) return;
                    const id = editingLemma?.id;
                    if (!id) return;
                    setLemmas((prev) =>
                      prev.map((item) =>
                        item.id === id
                          ? {
                              ...item,
                              title: lemmaEditTitle.trim(),
                              statementTex: lemmaEditBody.trim(),
                            }
                          : item,
                      ),
                    );
                    setEditingLemma(null);
                    setLemmaEditTitle("");
                    setLemmaEditBody("");
                  }}
                  submitLabel="Save Lemma"
                  canSubmit={Boolean(lemmaEditTitle.trim() && lemmaEditBody.trim())}
                />
              );
            }
          const isSelected = selectedLemmaId === lemma.id;
          const hasProof = Boolean(lemma.proof?.trim());
          const isProofEditing = proofEditLemmaId === lemma.id;
          const proofButtonLabel = hasProof ? 'Show proof' : 'Generate proof';
          return (
            <div
              onMouseDown={() => setSelectedLemmaId(lemma.id)}
              onClick={() => setSelectedLemmaId(lemma.id)}
              className="cursor-pointer"
            >
              <TextUnit
                className={`rounded border border-transparent bg-slate-900/30 p-3 transition-colors ${
                  isSelected ? 'border-sky-500/60 bg-slate-900/60' : ''
                }`}
                heading={formatUnitHeading("Lemma", index, lemma.title)}
                body={getLemmaBody(lemma)}
                bulkAction={bulkAction}
                renderControls={() => (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className={TERTIARY_BUTTON_CLASS}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedLemmaId(lemma.id);
                        if (isProofEditing) {
                          setProofEditLemmaId(null);
                          setProofDraft('');
                        } else {
                          setProofEditLemmaId(lemma.id);
                          setProofDraft(lemma.proof?.trim() || '');
                        }
                      }}
                    >
                      +proof
                    </button>
                    <button
                      type="button"
                      className={TERTIARY_BUTTON_CLASS}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (hasProof) {
                          handleShowProof(lemma);
                        } else {
                          handleGenerateProof(lemma);
                        }
                      }}
                    >
                      {proofButtonLabel}
                    </button>
                    <ItemControls
                      editLabel="Edit lemma"
                      deleteLabel="Delete lemma"
                      onEdit={() => {
                        setSelectedLemmaId(lemma.id);
                        setProofEditLemmaId(null);
                        setProofDraft('');
                        setEditingLemma({ id: lemma.id });
                        setLemmaEditTitle(lemma.title?.trim() || "");
                        setLemmaEditBody(lemma.statementTex?.trim() || "");
                      }}
                      onDelete={() => handleDeleteLemma(lemma.id)}
                    />
                  </div>
                )}
              />
              {isProofEditing ? (
                <form
                  className="mt-3 space-y-3 rounded border border-slate-800 bg-slate-950/80 p-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleSaveProof(lemma.id, proofDraft.trim());
                  }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-300">Proof (LaTeX allowed)</span>
                    <textarea
                      className={`${TEXTAREA_CLASS} h-32`}
                      value={proofDraft}
                      onChange={(event) => setProofDraft(event.target.value)}
                      placeholder="\\begin{proof} ..."
                    />
                  </label>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className={SECONDARY_BUTTON_CLASS}
                      onClick={() => {
                        setProofEditLemmaId(null);
                        setProofDraft('');
                      }}
                    >
                      Cancel
                    </button>
                    <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={!proofDraft.trim()}>
                      Save Proof
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          );
        }}
      >
        {showLemmaForm ? (
          <AddItemForm
            titleLabel="Lemma name"
            bodyLabel="Lemma statement (LaTeX allowed)"
            titleValue={newLemmaTitle}
            bodyValue={newLemmaBody}
            onTitleChange={setNewLemmaTitle}
            onBodyChange={setNewLemmaBody}
            onCancel={() => {
              setShowLemmaForm(false);
              setNewLemmaTitle("");
              setNewLemmaBody("");
            }}
            onSubmit={() => {
              if (!newLemmaTitle.trim() || !newLemmaBody.trim()) return;
              const lemma = {
                id: createId("lemma"),
                title: newLemmaTitle.trim(),
                statementTex: newLemmaBody.trim(),
                status: "draft" as const,
                tags: [],
                dependsOn: [],
                proof: '',
              };
              setLemmas((prev) => [...prev, lemma]);
              setSelectedLemmaId(lemma.id);
              setShowLemmaForm(false);
              setNewLemmaTitle("");
              setNewLemmaBody("");
            }}
            canSubmit={Boolean(newLemmaTitle.trim() && newLemmaBody.trim())}
            submitLabel="Add Lemma"
          />
        ) : null}
      </UnitSection>

        <UnitSection
        title="Facts"
        items={facts}
        emptyMessage="No facts yet."
        getKey={(fact) => fact.id}
        onAdd={() => {
          setNewFactTitle("");
          setNewFactBody("");
          setShowFactForm(true);
        }}
        addDisabled={showFactForm}
        renderItem={(fact, index, bulkAction) => {
          if (editingFact?.id === fact.id) {
            return (
              <AddItemForm
                titleLabel="Fact name"
                bodyLabel="Fact statement (LaTeX allowed)"
                titleValue={factEditTitle}
                bodyValue={factEditBody}
                onTitleChange={setFactEditTitle}
                onBodyChange={setFactEditBody}
                onCancel={() => {
                  setEditingFact(null);
                  setFactEditTitle("");
                  setFactEditBody("");
                }}
                onSubmit={() => {
                  if (!factEditTitle.trim() || !factEditBody.trim()) return;
                  const id = editingFact?.id;
                  if (!id) return;
                  setFacts((prev) =>
                    prev.map((item) =>
                      item.id === id
                        ? {
                            ...item,
                            title: factEditTitle.trim(),
                            statementTex: factEditBody.trim(),
                          }
                        : item,
                    ),
                  );
                  setEditingFact(null);
                  setFactEditTitle("");
                  setFactEditBody("");
                }}
                submitLabel="Save Fact"
                canSubmit={Boolean(factEditTitle.trim() && factEditBody.trim())}
              />
            );
          }
          return (
            <TextUnit
              heading={formatUnitHeading("Fact", index, fact.title)}
              body={getFactBody(fact)}
              bulkAction={bulkAction}
              renderControls={() => (
                <ItemControls
                  editLabel="Edit fact"
                  deleteLabel="Delete fact"
                  onEdit={() => {
                    setEditingFact({ id: fact.id });
                    setFactEditTitle(fact.title?.trim() || "");
                    setFactEditBody(fact.statementTex?.trim() || "");
                  }}
                  onDelete={() => handleDeleteFact(fact.id)}
                />
              )}
            />
          );
        }}
      >
        {showFactForm ? (
          <AddItemForm
            titleLabel="Fact name"
            bodyLabel="Fact statement (LaTeX allowed)"
            titleValue={newFactTitle}
            bodyValue={newFactBody}
            onTitleChange={setNewFactTitle}
            onBodyChange={setNewFactBody}
            onCancel={() => {
              setShowFactForm(false);
              setNewFactTitle("");
              setNewFactBody("");
            }}
            onSubmit={() => {
              if (!newFactTitle.trim() || !newFactBody.trim()) return;
              const fact = {
                id: createId("fact"),
                title: newFactTitle.trim(),
                statementTex: newFactBody.trim(),
                tags: [],
                refs: [],
              };
              setFacts((prev) => [...prev, fact]);
              setShowFactForm(false);
              setNewFactTitle("");
              setNewFactBody("");
            }}
            canSubmit={Boolean(newFactTitle.trim() && newFactBody.trim())}
            submitLabel="Add Fact"
          />
        ) : null}
      </UnitSection>

        <UnitSection
        title="Conjectures"
        items={conjectures}
        emptyMessage="No conjectures yet."
        getKey={(conjecture) => conjecture.id}
        onAdd={() => {
          setNewConjectureTitle("");
          setNewConjectureBody("");
          setShowConjectureForm(true);
        }}
        addDisabled={showConjectureForm}
        renderItem={(conjecture, index, bulkAction) => {
          if (editingConjecture?.id === conjecture.id) {
            return (
              <AddItemForm
                titleLabel="Conjecture name"
                bodyLabel="Conjecture statement (LaTeX allowed)"
                titleValue={conjectureEditTitle}
                bodyValue={conjectureEditBody}
                onTitleChange={setConjectureEditTitle}
                onBodyChange={setConjectureEditBody}
                onCancel={() => {
                  setEditingConjecture(null);
                  setConjectureEditTitle("");
                  setConjectureEditBody("");
                }}
                onSubmit={() => {
                  if (!conjectureEditTitle.trim() || !conjectureEditBody.trim()) return;
                  const id = editingConjecture?.id;
                  if (!id) return;
                  setConjectures((prev) =>
                    prev.map((item) =>
                      item.id === id
                        ? {
                            ...item,
                            title: conjectureEditTitle.trim(),
                            statementTex: conjectureEditBody.trim(),
                          }
                        : item,
                    ),
                  );
                  setEditingConjecture(null);
                  setConjectureEditTitle("");
                  setConjectureEditBody("");
                }}
                submitLabel="Save Conjecture"
                canSubmit={Boolean(conjectureEditTitle.trim() && conjectureEditBody.trim())}
              />
            );
          }
          return (
            <TextUnit
              heading={formatUnitHeading("Conjecture", index, conjecture.title)}
              body={getConjectureBody(conjecture)}
              bulkAction={bulkAction}
              renderControls={() => (
                <ItemControls
                  editLabel="Edit conjecture"
                  deleteLabel="Delete conjecture"
                  onEdit={() => {
                    setEditingConjecture({ id: conjecture.id });
                    setConjectureEditTitle(conjecture.title?.trim() || "");
                    setConjectureEditBody(conjecture.statementTex?.trim() || "");
                  }}
                  onDelete={() => handleDeleteConjecture(conjecture.id)}
                />
              )}
            />
          );
        }}
      >
        {showConjectureForm ? (
          <AddItemForm
            titleLabel="Conjecture name"
            bodyLabel="Conjecture statement (LaTeX allowed)"
            titleValue={newConjectureTitle}
            bodyValue={newConjectureBody}
            onTitleChange={setNewConjectureTitle}
            onBodyChange={setNewConjectureBody}
            onCancel={() => {
              setShowConjectureForm(false);
              setNewConjectureTitle("");
              setNewConjectureBody("");
            }}
            onSubmit={() => {
              if (!newConjectureTitle.trim() || !newConjectureBody.trim()) return;
              const conjecture = {
                id: createId("conjecture"),
                title: newConjectureTitle.trim(),
                statementTex: newConjectureBody.trim(),
                evidence: "",
              };
              setConjectures((prev) => [...prev, conjecture]);
              setShowConjectureForm(false);
              setNewConjectureTitle("");
              setNewConjectureBody("");
            }}
            canSubmit={Boolean(newConjectureTitle.trim() && newConjectureBody.trim())}
            submitLabel="Add Conjecture"
          />
        ) : null}
      </UnitSection>

        <UnitSection
        title="Ideas"
        items={ideas}
        emptyMessage="No ideas yet."
        getKey={(idea) => idea.id}
        onAdd={() => {
          setNewIdeaName("");
          setNewIdeaDescription("");
          setShowIdeaForm(true);
        }}
        addDisabled={showIdeaForm}
        renderItem={(idea, index, bulkAction) => {
          if (editingIdea?.id === idea.id) {
            return (
              <AddItemForm
                titleLabel="Idea name"
                bodyLabel="Idea description"
                titleValue={ideaEditName}
                bodyValue={ideaEditDescription}
                onTitleChange={setIdeaEditName}
                onBodyChange={setIdeaEditDescription}
                onCancel={() => {
                  setEditingIdea(null);
                  setIdeaEditName("");
                  setIdeaEditDescription("");
                }}
                onSubmit={() => {
                  if (!ideaEditName.trim() || !ideaEditDescription.trim()) return;
                  const id = editingIdea?.id;
                  if (!id) return;
                  setIdeas((prev) =>
                    prev.map((item) =>
                      item.id === id
                        ? {
                            ...item,
                            name: ideaEditName.trim(),
                            description: ideaEditDescription.trim(),
                          }
                        : item,
                    ),
                  );
                  setEditingIdea(null);
                  setIdeaEditName("");
                  setIdeaEditDescription("");
                }}
                submitLabel="Save Idea"
                canSubmit={Boolean(ideaEditName.trim() && ideaEditDescription.trim())}
              />
            );
          }
          return (
            <TextUnit
              heading={formatUnitHeading("Idea", index, idea.name)}
              body={getIdeaBody(idea)}
              bulkAction={bulkAction}
              renderControls={() => (
                <ItemControls
                  editLabel="Edit idea"
                  deleteLabel="Delete idea"
                  onEdit={() => {
                    setEditingIdea({ id: idea.id });
                    setIdeaEditName(idea.name?.trim() || "");
                    setIdeaEditDescription(idea.description?.trim() || "");
                  }}
                  onDelete={() => handleDeleteIdea(idea.id)}
                />
              )}
            />
          );
        }}
      >
        {showIdeaForm ? (
          <AddItemForm
            titleLabel="Idea name"
            bodyLabel="Idea description"
            titleValue={newIdeaName}
            bodyValue={newIdeaDescription}
            onTitleChange={setNewIdeaName}
            onBodyChange={setNewIdeaDescription}
            onCancel={() => {
              setShowIdeaForm(false);
              setNewIdeaName("");
              setNewIdeaDescription("");
            }}
            onSubmit={() => {
              if (!newIdeaName.trim() || !newIdeaDescription.trim()) return;
              const idea = {
                id: createId("idea"),
                name: newIdeaName.trim(),
                description: newIdeaDescription.trim(),
                checklist: [],
                antiPatterns: [],
              };
              setIdeas((prev) => [...prev, idea]);
              setShowIdeaForm(false);
              setNewIdeaName("");
              setNewIdeaDescription("");
            }}
            canSubmit={Boolean(newIdeaName.trim() && newIdeaDescription.trim())}
            submitLabel="Add Idea"
          />
        ) : null}
      </UnitSection>

        <UnitSection
          title="Pitfalls"
          items={pitfalls}
          emptyMessage="No pitfalls yet."
          getKey={(pitfall) => pitfall.id}
          onAdd={() => {
            setNewPitfallName("");
            setNewPitfallDescription("");
            setShowPitfallForm(true);
          }}
          addDisabled={showPitfallForm}
          renderItem={(pitfall, index, bulkAction) => {
          if (editingPitfall?.id === pitfall.id) {
            return (
              <AddItemForm
                titleLabel="Pitfall name"
                bodyLabel="Pitfall description"
                titleValue={pitfallEditName}
                bodyValue={pitfallEditDescription}
                onTitleChange={setPitfallEditName}
                onBodyChange={setPitfallEditDescription}
                onCancel={() => {
                  setEditingPitfall(null);
                  setPitfallEditName("");
                  setPitfallEditDescription("");
                }}
                onSubmit={() => {
                  if (!pitfallEditName.trim() || !pitfallEditDescription.trim()) return;
                  const id = editingPitfall?.id;
                  if (!id) return;
                  setPitfalls((prev) =>
                    prev.map((item) =>
                      item.id === id
                        ? {
                            ...item,
                            name: pitfallEditName.trim(),
                            description: pitfallEditDescription.trim(),
                          }
                        : item,
                    ),
                  );
                  setEditingPitfall(null);
                  setPitfallEditName("");
                  setPitfallEditDescription("");
                }}
                submitLabel="Save Pitfall"
                canSubmit={Boolean(pitfallEditName.trim() && pitfallEditDescription.trim())}
              />
            );
          }
          return (
            <TextUnit
              heading={formatUnitHeading("Pitfall", index, pitfall.name)}
              body={getPitfallBody(pitfall)}
              bulkAction={bulkAction}
              renderControls={() => (
                <ItemControls
                  editLabel="Edit pitfall"
                  deleteLabel="Delete pitfall"
                  onEdit={() => {
                    setEditingPitfall({ id: pitfall.id });
                    setPitfallEditName(pitfall.name?.trim() || "");
                    setPitfallEditDescription(pitfall.description?.trim() || "");
                  }}
                  onDelete={() => handleDeletePitfall(pitfall.id)}
                />
              )}
            />
          );
        }}
      >
        {showPitfallForm ? (
          <AddItemForm
            titleLabel="Pitfall name"
            bodyLabel="Pitfall description"
            titleValue={newPitfallName}
            bodyValue={newPitfallDescription}
            onTitleChange={setNewPitfallName}
            onBodyChange={setNewPitfallDescription}
            onCancel={() => {
              setShowPitfallForm(false);
              setNewPitfallName("");
              setNewPitfallDescription("");
            }}
            onSubmit={() => {
              if (!newPitfallName.trim() || !newPitfallDescription.trim()) return;
              const pitfall = {
                id: createId("pitfall"),
                name: newPitfallName.trim(),
                description: newPitfallDescription.trim(),
              };
              setPitfalls((prev) => [...prev, pitfall]);
              setShowPitfallForm(false);
              setNewPitfallName("");
              setNewPitfallDescription("");
            }}
            canSubmit={Boolean(newPitfallName.trim() && newPitfallDescription.trim())}
            submitLabel="Add Pitfall"
          />
        ) : null}
        </UnitSection>
      </div>
    </div>
  );

  const rightPane = (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <section className={`${PANEL_CLASS} flex flex-1 flex-col overflow-hidden p-0`} aria-label="Assistant terminal">
        <div className="relative border-b border-slate-800 bg-slate-900 px-2 pt-2 pb-1">
          <div className="flex items-end gap-1 overflow-x-auto pb-0.5">
            {openThreads.map((thread) => {
              const isActive = thread.id === activeThreadId;
              return (
                <div
                  key={thread.id}
                  className={`app-no-drag inline-flex h-9 items-center gap-1 rounded-t-md border border-b-0 px-3 text-sm transition ${
                    isActive
                      ? 'border-slate-600 bg-slate-950 text-slate-100'
                      : 'border-transparent bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                  }`}
                >
                  {renamingThreadId === thread.id ? (
                    <input
                      autoFocus
                      className="app-no-drag h-6 w-32 rounded border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100 focus:border-sky-400 focus:outline-none focus:ring-0"
                      value={threadNameDraft}
                      onChange={(event) => setThreadNameDraft(event.target.value)}
                      onBlur={() => finishRenamingThread(thread.id, threadNameDraft)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          finishRenamingThread(thread.id, threadNameDraft);
                        } else if (event.key === 'Escape') {
                          event.preventDefault();
                          cancelRenamingThread();
                        }
                      }}
                      onClick={(event) => event.stopPropagation()}
                    />
                  ) : (
                    <button
                      type="button"
                      className={`app-no-drag flex items-center gap-2 py-1 text-sm font-medium ${
                        isActive ? 'text-slate-100' : 'text-slate-300'
                      }`}
                      onClick={() => setActiveThreadId(thread.id)}
                      onDoubleClick={() => beginRenamingThread(thread)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setThreadMenu({ threadId: thread.id, x: event.clientX, y: event.clientY });
                      }}
                    >
                      <span
                        className="truncate"
                        title={thread.title}
                      >
                        {thread.title || 'Untitled thread'}
                      </span>
                    </button>
                  )}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="app-no-drag rounded px-1 text-xs text-slate-400 transition hover:bg-slate-800/90 hover:text-slate-100"
                      onClick={() => handleCloseThread(thread.id)}
                      aria-label={`Close ${thread.title || 'thread'}`}
                    >
                      X
                    </button>
                    <button
                      type="button"
                      className="app-no-drag flex items-center justify-center rounded px-1 text-xs text-slate-400 transition hover:bg-red-900/80 hover:text-red-200"
                      onClick={() => handleDeleteThread(thread.id)}
                      aria-label={`Delete ${thread.title || 'thread'}`}
                    >
                      <svg
                        aria-hidden
                        focusable="false"
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        className="fill-current"
                      >
                        <path d="M5 1.5h4l.33.5H11c.28 0 .5.22.5.5s-.22.5-.5.5h-.43l-.74 8.14A1.5 1.5 0 018.35 12H5.65a1.5 1.5 0 01-1.48-1.36L3.43 2.5H3c-.28 0-.5-.22-.5-.5s.22-.5.5-.5h1.67L5 1.5zm.17 1l-.7 8.04a.5.5 0 00.5.46h2.7a.5.5 0 00.5-.46L8.47 2.5H5.17z" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              className="app-no-drag flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-lg font-semibold text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
              onClick={handleCreateThread}
              aria-label="Create new thread"
            >
              +
            </button>
          </div>
          {threadMenu ? (
            <div
              className="fixed z-50 min-w-[140px] rounded border border-slate-700 bg-slate-900/95 py-1 shadow-xl"
              style={{ top: threadMenu.y, left: threadMenu.x }}
            >
              <button
                type="button"
                className="flex w-full items-center px-3 py-1.5 text-left text-sm text-slate-100 transition hover:bg-slate-800/80 hover:text-sky-200"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => {
                  handleCloseThread(threadMenu.threadId);
                  setThreadMenu(null);
                }}
              >
                Hide
              </button>
              <button
                type="button"
                className="flex w-full items-center px-3 py-1.5 text-left text-sm text-slate-100 transition hover:bg-slate-800/80 hover:text-sky-200"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => {
                  const targetThread = chatThreads.find((thread) => thread.id === threadMenu.threadId);
                  if (targetThread) {
                    beginRenamingThread(targetThread);
                  } else {
                    setThreadMenu(null);
                  }
                }}
              >
                Rename
              </button>
              <button
                type="button"
                className="flex w-full items-center px-3 py-1.5 text-left text-sm text-red-300 transition hover:bg-red-900/70"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => handleDeleteThread(threadMenu.threadId)}
              >
                Delete
              </button>
            </div>
          ) : null}
        </div>
        <form className="flex h-full flex-col bg-slate-950" onSubmit={(event) => event.preventDefault()}>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 font-mono text-[15px] leading-6 text-slate-100">
            {activeThread ? (
              <>
                {hiddenUserMessages > 0 ? (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      className="rounded border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-sky-400 hover:text-sky-200"
                      onClick={() =>
                        setVisibleUserMessages((prev) => Math.min(prev + 10, totalUserMessages || prev + 10))
                      }
                    >
                      Show {Math.min(10, hiddenUserMessages)} older messages
                    </button>
                  </div>
                ) : null}
                {chatMessages.map((message) => (
                  <ChatMessageBubble
                    key={message.id}
                    message={message}
                    isSelected={selectedChatId === message.id}
                    showRaw={Boolean(rawChatMessages[message.id])}
                    onSelect={(id) => {
                      if (message.role !== 'assistant') return;
                      setSelectedChatId((prev) => (prev === id ? null : id));
                    }}
                    onToggleRaw={(id) => {
                      setRawChatMessages((prev) => ({ ...prev, [id]: !prev[id] }));
                    }}
                  />
                ))}
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                <p>Select a thread from the View menu or create a new one to start chatting.</p>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="relative flex items-start gap-2 px-4 pb-4 font-mono text-[15px] leading-6 text-slate-100">
            <span className="select-none text-slate-500">&gt;</span>
            <textarea
              ref={chatInputRef}
              className={`flex-1 resize-none bg-transparent text-[15px] leading-6 text-slate-100 outline-none ${
                activeThread ? '' : 'pointer-events-none text-slate-500'
              }`}
              value={queryText}
              onChange={handleChatInputChange}
              onKeyDown={handleChatKeyDown}
              placeholder={activeThread ? 'type and press enter' : 'open a thread to chat'}
              rows={1}
              disabled={!activeThread}
            />
            {chatSuggestions.length ? (
              <ul className="absolute left-[18px] right-0 bottom-full mb-2 max-h-56 max-w-[calc(100%-18px)] overflow-y-auto rounded border border-slate-800 bg-slate-900 py-1 shadow-xl">
                {chatSuggestions.map((suggestion, index) => (
                  <li key={suggestion.id}>
                    <button
                      type="button"
                      className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm ${
                        index === chatSuggestionIndex
                          ? 'bg-slate-800/80 text-sky-200'
                          : 'text-slate-200 hover:bg-slate-800/60'
                      }`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        applyChatSuggestion(suggestion);
                      }}
                    >
                      <span className="truncate">{suggestion.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </form>
      </section>

      {draftError ? <p className="text-sm text-red-400">{draftError}</p> : null}
      {draft ? (
        <section className={`${PANEL_CLASS} space-y-3`}>
          <header className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-200">Draft markdown</h3>
          </header>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap border border-slate-700 bg-slate-950 p-3 text-xs text-slate-100">
            {draft.markdown}
          </pre>
          {draft.warnings.length ? (
            <ul className="list-disc space-y-1 pl-5 text-xs text-amber-300">
              {draft.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );




  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ProjectMenuBar
        onSave={() => {
          void handleSave();
        }}
        onReload={() => {
          void loadProject();
        }}
        onExport={() => {
          void handleExport();
        }}
        onDraft={() => {
          void handleDraftProof();
        }}
        onOpenSettings={() => setShowSettingsModal(true)}
        onRename={handleRenameProject}
        threads={chatThreads}
        activeThreadId={activeThreadId}
        openThreadIds={openThreadIds}
        onSelectThread={handleOpenThread}
      />

      {error || status ? (
        <div className="space-y-1 px-6 py-2">
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          {status ? <p className="text-sm text-emerald-400">{status}</p> : null}
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-hidden px-6 py-4">
        <div className="h-full min-h-0">
          <SplitPane left={leftPane} right={rightPane} />
        </div>
      </div>

      {showSettingsModal ? (
        <LLMSettingsModal
          model={llmModel}
          apiKey={llmApiKey}
          onSave={async ({ model, apiKey }) => {
            setLlmModel(model);
            setLlmApiKey(apiKey);
            try {
              if (window.desktopApi?.updateConfig) {
                await window.desktopApi.updateConfig({
                  llm: {
                    provider: llmProvider,
                    model,
                    apiKey,
                  },
                });
              }
            } catch (error) {
              console.error('Failed to update LLM config', error);
            }
          }}
          onClose={() => setShowSettingsModal(false)}
        />
      ) : null}
      {activeProofLemma ? <ProofModal lemma={activeProofLemma} onClose={() => setActiveProofLemma(null)} /> : null}
      {showRenameModal ? (
        <div className="app-no-drag fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md space-y-5 rounded border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <header className="space-y-1">
              <h2 className="text-lg font-semibold text-white">Rename Project</h2>
              <p className="text-sm text-slate-300">Update the project title shown in the window and menus.</p>
            </header>
            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-300">Project Title</span>
              <input
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                autoFocus
              />
            </label>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                className={SECONDARY_BUTTON_CLASS}
                onClick={() => {
                  setShowRenameModal(false);
                  setRenameDraft(project?.title?.trim() || DEFAULT_PROJECT_TITLE);
                }}
              >
                Cancel
              </button>
              <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={handleRenameSave}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {showUnsavedModal ? (
        <div className="app-no-drag fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md space-y-5 rounded border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <header className="space-y-1">
              <h2 className="text-lg font-semibold text-white">Unsaved changes</h2>
              <p className="text-sm text-slate-300">There are unsaved changes in this project. What would you like to do?</p>
            </header>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                className={SECONDARY_BUTTON_CLASS}
                onClick={() => {
                  setShowUnsavedModal(false);
                  if (window.desktopApi?.respondToClose) {
                    void window.desktopApi.respondToClose(false);
                  }
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className={PRIMARY_BUTTON_CLASS}
                onClick={() => {
                  setShowUnsavedModal(false);
                  if (window.desktopApi?.respondToClose) {
                    void window.desktopApi.respondToClose(true);
                  }
                }}
              >
                Discard and close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type SectionRenderAction = { version: number; expanded: boolean };

type MenuItem =
  | { type: 'divider' }
  | {
      label: string;
      shortcut?: string;
      meta?: string;
      action?: () => void;
    };

interface ProjectMenuBarProps {
  onSave: () => void;
  onReload: () => void;
  onExport: () => void;
  onDraft: () => void;
  onOpenSettings: () => void;
  onRename: () => void;
  threads: ChatThread[];
  activeThreadId: string | null;
  openThreadIds: string[];
  onSelectThread: (threadId: string) => void;
}

function ProjectMenuBar({
  onSave,
  onReload,
  onExport,
  onDraft,
  onOpenSettings,
  onRename,
  threads,
  activeThreadId,
  openThreadIds,
  onSelectThread,
}: ProjectMenuBarProps) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, []);

  const menuConfig = useMemo<Record<string, { label: string; items: MenuItem[] }>>(
    () => ({
      file: {
        label: 'File',
        items: [
          { label: 'Save Project', shortcut: 'Ctrl/Cmd + S', action: onSave },
          { label: 'Rename Project…', shortcut: 'Ctrl/Cmd + Shift + R', action: onRename },
          { label: 'Reload Project', shortcut: 'Ctrl/Cmd + R', action: onReload },
          { label: 'Export LaTeX…', shortcut: 'Ctrl/Cmd + Shift + E', action: onExport },
          { label: 'Draft Proof', shortcut: 'Ctrl/Cmd + D', action: onDraft },
        ],
      },
      edit: {
        label: 'Edit',
        items: [
          {
            label: 'Undo',
            shortcut: 'Ctrl/Cmd + Z',
            action: () => {
              document.execCommand('undo');
            },
          },
          {
            label: 'Redo',
            shortcut: 'Ctrl/Cmd + Shift + Z',
            action: () => {
              document.execCommand('redo');
            },
          },
        ],
      },
      view: {
        label: 'View',
        items: [
          {
            label: 'Toggle Fullscreen',
            shortcut: 'F11',
            action: () => {
              if (!document.fullscreenElement) {
                void document.documentElement.requestFullscreen();
              } else {
                void document.exitFullscreen();
              }
            },
          },
          ...(threads.length
            ? ([
                { type: 'divider' } as MenuItem,
                ...threads.map<MenuItem>((thread) => {
                  let meta = 'Hidden';
                  if (activeThreadId === thread.id) {
                    meta = 'Active';
                  } else if (openThreadIds.includes(thread.id)) {
                    meta = 'Open';
                  }
                  return {
                    label: thread.title || 'Untitled thread',
                    meta,
                    action: () => onSelectThread(thread.id),
                  };
                }),
              ] as MenuItem[])
            : []),
        ],
      },
      settings: {
        label: 'Settings',
        items: [
          {
            label: 'LLM Settings…',
            shortcut: 'Ctrl/Cmd + ,',
            action: onOpenSettings,
          },
        ],
      },
      help: {
        label: 'Help',
        items: [
          {
            label: 'Documentation',
            action: () => {
              window.open('https://github.com/cursor-math-proofs', '_blank');
            },
          },
          {
            label: 'About',
            action: () => {
              window.open('https://github.com/cursor-math-proofs', '_blank');
            },
          },
        ],
      },
    }),
    [
      onDraft,
      onExport,
      onOpenSettings,
      onReload,
      onRename,
      onSave,
      threads,
      activeThreadId,
      openThreadIds,
      onSelectThread,
    ],
  );

  return (
    <div ref={containerRef} className="app-drag border-b border-slate-900/70 bg-slate-950 px-6 py-2">
      <nav className="flex items-center gap-6 text-sm font-semibold text-slate-200">
        {Object.entries(menuConfig).map(([key, menu]) => (
          <div key={key} className="relative app-no-drag">
            <button
              type="button"
              className={`rounded px-2 py-1 transition ${activeMenu === key ? 'bg-slate-900/80 text-sky-200' : 'hover:bg-slate-900/70 hover:text-sky-200'}`}
              onClick={() => setActiveMenu((prev) => (prev === key ? null : key))}
            >
              {menu.label}
            </button>
            {activeMenu === key ? (
              <div className="absolute left-0 top-[calc(100%+6px)] min-w-[420px] rounded border border-slate-800 bg-slate-900/95 p-2 shadow-xl">
                {menu.items.map((item, index) => {
                  if (item.type === 'divider') {
                    return <div key={`divider-${menu.label}-${index}`} className="my-2 border-t border-slate-800/70" />;
                  }
                  return (
                    <button
                      key={item.label}
                      type="button"
                      className="app-no-drag flex w-full items-center justify-between rounded px-2 py-1 text-left text-[13px] text-slate-100 transition hover:bg-slate-800/80 hover:text-sky-200"
                      onClick={() => {
                        setActiveMenu(null);
                        if (item.action) {
                          item.action();
                        }
                      }}
                    >
                      <span className="flex-1 pr-12 text-left">{item.label}</span>
                      {item.meta ? (
                        <span className="w-48 text-right text-[11px] uppercase tracking-wide text-slate-400">{item.meta}</span>
                      ) : item.shortcut ? (
                        <span className="w-48 text-right text-[11px] text-slate-400">{item.shortcut}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ))}
      </nav>
    </div>
  );
}

interface LLMSettingsModalProps {
  model: string;
  apiKey: string;
  onClose: () => void;
  // eslint-disable-next-line no-unused-vars
  onSave: (settings: { model: string; apiKey: string }) => void;
}

function LLMSettingsModal(props: LLMSettingsModalProps) {
  const { onClose, onSave } = props;
  const [localModel, setLocalModel] = useState(props.model);
  const [localKey, setLocalKey] = useState(props.apiKey);
  const options = ['gpt-5', 'gpt-4', 'gemini-pro', 'claude-3-opus'];

  useEffect(() => {
    setLocalModel(props.model);
  }, [props.model]);

  useEffect(() => {
    setLocalKey(props.apiKey);
  }, [props.apiKey]);

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      onSave({ model: localModel, apiKey: localKey.trim() });
      onClose();
    },
    [localKey, localModel, onClose, onSave],
  );

  return (
    <div className="app-no-drag fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-5 rounded border border-slate-700 bg-slate-900 p-6 shadow-2xl"
      >
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-white">LLM Settings</h2>
          <p className="text-sm text-slate-300">Select your preferred model and provide an API key.</p>
        </header>
        <label className="block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-300">Model</span>
          <select
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            value={localModel}
            onChange={(event) => setLocalModel(event.target.value)}
          >
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-300">API Key</span>
          <input
            type="password"
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            value={localKey}
            onChange={(event) => setLocalKey(event.target.value)}
            placeholder="sk-..."
          />
        </label>
        <div className="flex items-center justify-end gap-3">
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={PRIMARY_BUTTON_CLASS}>
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

interface ProofModalProps {
  lemma: Project['lemmas'][number];
  onClose: () => void;
}

function ProofModal({ lemma, onClose }: ProofModalProps) {
  const [showSource, setShowSource] = useState(false);
  const proofText = lemma.proof?.trim() || 'Proof not available.';

  return (
    <div className="app-no-drag fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-3xl space-y-5 rounded border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-white">Lemma proof</h2>
          <p className="text-sm text-slate-300">Review the lemma statement and its associated proof.</p>
        </header>
        <TextUnit heading="Lemma" body={getLemmaBody(lemma)} collapsible={false} showHeading className="rounded border border-slate-800 bg-slate-950 px-4 py-3" />
        <section className="rounded border border-slate-800 bg-slate-950 px-4 py-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold italic text-slate-200">Proof</h3>
            <button
              type="button"
              className="rounded border border-slate-600 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-slate-200 transition hover:border-sky-400 hover:text-sky-200"
              onClick={() => setShowSource((prev) => !prev)}
            >
              {showSource ? 'hide source' : 'show source'}
            </button>
          </div>
          {showSource ? (
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap bg-slate-900/80 p-3 font-mono text-sm text-slate-200">
              {proofText}
            </pre>
          ) : (
            <div className="prose prose-invert max-h-96 overflow-auto text-sm leading-relaxed">
              {renderChatContent(proofText)}
            </div>
          )}
        </section>
        <div className="flex justify-end">
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

interface ChatMessageBubbleProps {
  message: ChatMessage;
  isSelected: boolean;
  showRaw: boolean;
  // eslint-disable-next-line no-unused-vars
  onSelect: (id: string) => void;
  // eslint-disable-next-line no-unused-vars
  onToggleRaw: (id: string) => void;
}

function ChatMessageBubble({ message, isSelected, showRaw, onSelect, onToggleRaw }: ChatMessageBubbleProps) {
  const isAssistant = message.role === 'assistant';
  const bubbleClasses = [
    'relative whitespace-pre-wrap rounded px-3 py-2 transition',
    isAssistant ? 'border border-slate-700 bg-slate-950/80' : 'bg-slate-800/40',
    isSelected ? 'ring-2 ring-sky-500/60' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const content = showRaw ? (
    <span className="font-mono text-sm">{highlightLatexSource(message.content || '(empty response)')}</span>
  ) : (
    <span className="inline text-slate-100">{renderChatContent(message.content)}</span>
  );

  return (
    <div
      role={isAssistant ? 'button' : undefined}
      tabIndex={isAssistant ? 0 : -1}
      className={bubbleClasses}
      onClick={() => {
        if (isAssistant) {
          onSelect(message.id);
        }
      }}
      onKeyDown={(event) => {
        if (!isAssistant) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(message.id);
        }
      }}
    >
      <span className="text-slate-500">{message.role === 'user' ? '>' : '<'} </span>
      {content}
      {isAssistant && isSelected ? (
        <button
          type="button"
          className="absolute bottom-1 right-1 rounded border border-slate-600 bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-slate-200 transition hover:border-sky-400 hover:text-sky-200"
          onClick={(event) => {
            event.stopPropagation();
            onToggleRaw(message.id);
          }}
        >
          {showRaw ? 'Show render' : 'Show source'}
        </button>
              ) : null}
    </div>
  );
}

interface UnitSectionProps<T> {
  title: string;
  items: T[];
  emptyMessage: string;
  // eslint-disable-next-line no-unused-vars
  renderItem: (item: T, index: number, action: SectionRenderAction) => ReactNode;
  // eslint-disable-next-line no-unused-vars
  getKey?: (item: T, index: number) => string;
  onAdd?: () => void;
  addDisabled?: boolean;
  children?: ReactNode;
}

function UnitSection<T>({
  title,
  items,
  emptyMessage,
  renderItem,
  getKey,
  onAdd,
  addDisabled,
  children,
}: UnitSectionProps<T>) {
  const orderedItems = items
    .map((item, index) => ({ item, index }))
    .reverse();
  const [bulkAction, setBulkAction] = useState({ version: 0, expanded: false });
  const hasItems = orderedItems.length > 0;
  const bulkButtonLabel = bulkAction.expanded ? 'Collapse all' : 'Expand all';

  return (
    <section className="space-y-3 border-b border-slate-800 pb-6 last:border-b-0">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
        <span className="underline decoration-slate-600 decoration-2">{title}</span>
        <div className="flex items-center gap-2">
          {hasItems ? (
            <button
              type="button"
              className="border border-slate-600 px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-sky-400 hover:text-sky-200"
              onClick={() =>
                setBulkAction((prev) => ({
                  version: prev.version + 1,
                  expanded: !prev.expanded,
                }))
              }
            >
              {bulkButtonLabel}
            </button>
          ) : null}
          {onAdd ? (
            <button
              type="button"
              className="border border-dashed border-slate-600 px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-sky-400 hover:text-sky-200 disabled:opacity-50"
              onClick={onAdd}
              disabled={addDisabled}
            >
              + add
            </button>
          ) : null}
        </div>
      </div>
      {orderedItems.length ? (
        <div className="space-y-3">
          {orderedItems.map(({ item, index }) => (
            <div key={getKey ? getKey(item, index) : `${title}-${index}`} className="space-y-2">
              {renderItem(item, index, bulkAction)}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400">{emptyMessage}</p>
      )}
      {children}
    </section>
  );
}

interface AddItemFormProps {
  titleLabel: string;
  bodyLabel: string;
  titleValue: string;
  bodyValue: string;
  // eslint-disable-next-line no-unused-vars
  onTitleChange: (value: string) => void;
  // eslint-disable-next-line no-unused-vars
  onBodyChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  canSubmit?: boolean;
}

function AddItemForm({
  titleLabel,
  bodyLabel,
  titleValue,
  bodyValue,
  onTitleChange,
  onBodyChange,
  onCancel,
  onSubmit,
  submitLabel,
  canSubmit = true,
}: AddItemFormProps) {
  return (
    <form
      className="space-y-4 bg-slate-950/70 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-[0.15em] text-slate-300">{titleLabel}</span>
        <input
          className={`${INPUT_CLASS} text-sm`}
          value={titleValue}
          onChange={(event) => onTitleChange(event.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-[0.15em] text-slate-300">{bodyLabel}</span>
        <textarea
          className={`${TEXTAREA_CLASS} h-32`}
          value={bodyValue}
          onChange={(event) => onBodyChange(event.target.value)}
        />
      </label>
      <div className="flex items-center justify-end gap-2">
        <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={!canSubmit}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

interface ItemControlsProps {
  editLabel: string;
  deleteLabel: string;
  onEdit: () => void;
  onDelete: () => void;
}

function ItemControls({ editLabel, deleteLabel, onEdit, onDelete }: ItemControlsProps) {
  const baseButtonClass =
    'flex h-7 w-7 items-center justify-center border border-slate-700 bg-slate-950 text-slate-200 transition hover:border-sky-400 hover:text-sky-200';

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={deleteLabel}
        className={baseButtonClass}
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
      >
        <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M5.25 7.5h13.5M9 7.5V5.25A1.5 1.5 0 0 1 10.5 3.75h3A1.5 1.5 0 0 1 15 5.25V7.5m3 0v12a1.5 1.5 0 0 1-1.5 1.5h-9a1.5 1.5 0 0 1-1.5-1.5v-12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M10.5 11.25v6M13.5 11.25v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={editLabel}
        className={baseButtonClass}
        onClick={(event) => {
          event.stopPropagation();
          onEdit();
        }}
      >
        <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M16.862 3.487a2.25 2.25 0 0 1 3.182 3.182L9.75 16.963a2.25 2.25 0 0 1-.888.563l-3.21 1.07a.75.75 0 0 1-.95-.95l1.07-3.21a2.25 2.25 0 0 1 .563-.888l10.294-10.06Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M19.5 8.25 15.75 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
