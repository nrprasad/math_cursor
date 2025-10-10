export interface Notation {
  id: string;
  symbol: string;
  description: string;
}

export interface Fact {
  id: string;
  title: string;
  statementTex: string;
  tags: string[];
  refs: string[];
}

export interface Definition {
  id: string;
  title: string;
  statementTex: string;
  tags: string[];
}

export interface Lemma {
  id: string;
  title: string;
  statementTex: string;
  status: 'draft' | 'proved' | 'rejected';
  tags: string[];
  dependsOn: string[];
  proof: string;
}

export interface Conjecture {
  id: string;
  title: string;
  statementTex: string;
  evidence: string;
}

export interface Idea {
  id: string;
  name: string;
  description: string;
  checklist: string[];
  antiPatterns: string[];
}

export interface Pitfall {
  id: string;
  name: string;
  description: string;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatThread {
  id: string;
  title: string;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ModelSpec {
  provider: string;
  model: string;
}

export interface Attempt {
  id: string;
  lemmaId: string;
  usedIdeas: string[];
  usedFacts: string[];
  avoidedPitfalls: string[];
  promptVersion?: string | null;
  modelSpec: ModelSpec;
  draftMarkdown: string;
  warnings: string[];
  createdAt: string;
}

export interface Project {
  id: string;
  title: string;
  abstract: string;
  owner: string;
  createdAt: string;
  updatedAt: string;
  notation: Notation[];
  definitions: Definition[];
  facts: Fact[];
  lemmas: Lemma[];
  conjectures: Conjecture[];
  ideas: Idea[];
  pitfalls: Pitfall[];
  chatThreads: ChatThread[];
  chatHistory?: ConversationMessage[];
  attempts: Attempt[];
  attachments: Record<string, string>[];
}
