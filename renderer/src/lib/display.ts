import type {
  Conjecture,
  Definition,
  Fact,
  Idea,
  Lemma,
  Notation,
  Pitfall,
} from './types';

function coalesce(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function formatList(label: string, values: string[]): string | null {
  const items = values.map((item) => item.trim()).filter((item) => item.length > 0);
  if (!items.length) {
    return null;
  }
  return [`**${label}**`, ...items.map((item) => `- ${item}`)].join('\n');
}

function inlineMath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (/^\$.*\$$/.test(trimmed) || trimmed.startsWith('\\(') || trimmed.startsWith('\\[')) {
    return trimmed;
  }
  return `$${trimmed}$`;
}

export function getNotationName(notation: Notation): string {
  return coalesce(notation.symbol, coalesce(notation.description, notation.id || 'Notation'));
}

export function getNotationBody(notation: Notation): string {
  const sections: string[] = [];
  if (notation.symbol?.trim()) {
    sections.push(`**Symbol**: ${inlineMath(notation.symbol)}`);
  }
  if (notation.description?.trim()) {
    sections.push(notation.description.trim());
  }
  return sections.join('\n\n') || 'No description provided.';
}

export function getFactName(fact: Fact): string {
  return coalesce(fact.title, fact.id || 'Fact');
}

export function getFactBody(fact: Fact): string {
  const sections: string[] = [];
  if (fact.statementTex?.trim()) {
    sections.push(fact.statementTex.trim());
  }
  const tags = formatList('Tags', fact.tags ?? []);
  if (tags) {
    sections.push(tags);
  }
  const refs = formatList('References', fact.refs ?? []);
  if (refs) {
    sections.push(refs);
  }
  return sections.join('\n\n') || 'No statement provided.';
}

export function getDefinitionName(definition: Definition): string {
  return coalesce(definition.title, definition.id || 'Definition');
}

export function getDefinitionBody(definition: Definition): string {
  const sections: string[] = [];
  if (definition.statementTex?.trim()) {
    sections.push(definition.statementTex.trim());
  }
  const tags = formatList('Tags', definition.tags ?? []);
  if (tags) {
    sections.push(tags);
  }
  return sections.join('\n\n') || 'No statement provided.';
}

export function getLemmaName(lemma: Lemma): string {
  return coalesce(lemma.title, lemma.id || 'Lemma');
}

export function getLemmaBody(lemma: Lemma): string {
  const sections: string[] = [];
  if (lemma.statementTex?.trim()) {
    sections.push(lemma.statementTex.trim());
  }
  const tags = formatList('Tags', lemma.tags ?? []);
  if (tags) {
    sections.push(tags);
  }
  const depends = formatList('Depends On', lemma.dependsOn ?? []);
  if (depends) {
    sections.push(depends);
  }
  return sections.join('\n\n') || 'No statement provided.';
}

export function getConjectureName(conjecture: Conjecture): string {
  return coalesce(conjecture.title, conjecture.id || 'Conjecture');
}

export function getConjectureBody(conjecture: Conjecture): string {
  const sections: string[] = [];
  if (conjecture.statementTex?.trim()) {
    sections.push(conjecture.statementTex.trim());
  }
  if (conjecture.evidence?.trim()) {
    sections.push(['**Evidence**', conjecture.evidence.trim()].join('\n\n'));
  }
  return sections.join('\n\n') || 'No statement provided.';
}

export function getIdeaName(idea: Idea): string {
  return coalesce(idea.name, idea.id || 'Idea');
}

export function getIdeaBody(idea: Idea): string {
  const sections: string[] = [];
  if (idea.description?.trim()) {
    sections.push(idea.description.trim());
  }
  const checklist = formatList('Checklist', idea.checklist ?? []);
  if (checklist) {
    sections.push(checklist);
  }
  const antiPatterns = formatList('Anti-Patterns', idea.antiPatterns ?? []);
  if (antiPatterns) {
    sections.push(antiPatterns);
  }
  return sections.join('\n\n') || 'No description provided.';
}

export function getPitfallName(pitfall: Pitfall): string {
  return coalesce(pitfall.name, pitfall.id || 'Pitfall');
}

export function getPitfallBody(pitfall: Pitfall): string {
  return pitfall.description?.trim() || 'No description provided.';
}
