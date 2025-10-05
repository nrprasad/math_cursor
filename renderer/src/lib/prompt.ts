/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-unused-vars */
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
} from './display';
import type { Project } from './types';

type ReferenceKind = 'Lemma' | 'Definition' | 'Fact' | 'Conjecture' | 'Idea' | 'Pitfall';

const REFERENCE_REGEX = /#(Lemma|Definition|Fact|Conjecture|Idea|Pitfall)\s*:\s*(\d+)#/gi;

type Stringifier<T> = (value: T) => string;

interface SectionConfig<T> {
  getName: Stringifier<T>;
  getBody: Stringifier<T>;
}

const SECTION_CONFIG: Record<ReferenceKind, SectionConfig<any>> = {
  Lemma: { getName: getLemmaName, getBody: getLemmaBody },
  Definition: { getName: getDefinitionName, getBody: getDefinitionBody },
  Fact: { getName: getFactName, getBody: getFactBody },
  Conjecture: { getName: getConjectureName, getBody: getConjectureBody },
  Idea: { getName: getIdeaName, getBody: getIdeaBody },
  Pitfall: { getName: getPitfallName, getBody: getPitfallBody },
};

function collectReferences(input: string): Record<ReferenceKind, number[]> {
  const references: Record<ReferenceKind, number[]> = {
    Lemma: [],
    Definition: [],
    Fact: [],
    Conjecture: [],
    Idea: [],
    Pitfall: [],
  };

  let match: RegExpExecArray | null;
  while ((match = REFERENCE_REGEX.exec(input))) {
    const kind = match[1] as ReferenceKind;
    const value = Number.parseInt(match[2], 10);
    if (!Number.isNaN(value) && value > 0 && !references[kind].includes(value)) {
      references[kind].push(value);
    }
  }

  return references;
}

export function buildPrompt(project: Project, userInput: string): string {
  const trimmedInput = userInput.trim();
  const references = collectReferences(trimmedInput);

  const lines: string[] = [];
  const title = project.title?.trim() || 'Untitled project';

/*  lines.push(`Project: ${title}`);
  lines.push('Assistant role: Provide helpful mathematical reasoning that respects the referenced context.');
  lines.push('');*/
  lines.push('With the following context');

  (Object.keys(references) as ReferenceKind[]).forEach((kind) => {
    const indices = references[kind];
    if (!indices.length) {
      return;
    }

    const items = project[`${kind.toLowerCase()}s` as keyof Project] as unknown[] | undefined;
    const { getName, getBody } = SECTION_CONFIG[kind];
    lines.push(`### ${kind}s`);

    indices.forEach((number) => {
      const item = Array.isArray(items) ? items[number - 1] : undefined;
      if (item) {
        const name = getName(item).trim() || `${kind} ${number}`;
        const body = getBody(item).trim() || '(no content provided)';
        lines.push(`#### ${kind} ${number}: ${name}`);
        lines.push(body);
      } else {
        lines.push(`#### ${kind} ${number}: (not found in project)`);
      }
      lines.push('');
    });
  });

  lines.push('## ');
  lines.push(trimmedInput || '(no user question provided)');

  return lines.join('\n').trim();
}
