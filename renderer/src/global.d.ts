/* eslint-disable @typescript-eslint/no-unused-vars, no-unused-vars */
import type { Project } from './lib/types';

interface DraftProofResponse {
  draft_md: string;
  warnings: string[];
}

interface ExportLatexResponse {
  filename: string;
  data: string; // base64 encoded zip file
}

interface ListProjectsResponse {
  projects: Array<{
    id: string;
    title: string;
    updatedAt: string;
  }>;
}

interface DesktopApi {
  createProject(_id: string, _title: string): Promise<{ project: Project; etag: string }>;
  getProject(_id: string): Promise<{ project: Project; etag: string }>;
  saveProject(_project: Project, _etag: string): Promise<{ etag: string }>;
  draftProof(_projectId: string, _lemmaId?: string): Promise<DraftProofResponse>;
  exportLatex(_projectId: string): Promise<ExportLatexResponse>;
  listProjects(): Promise<ListProjectsResponse>;
  chatPrompt(payload: {
    prompt: string;
    provider?: string;
    model?: string;
    apiKey?: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  }): Promise<{ message: string }>;
  getConfig(): Promise<{ llm: { provider: string; model: string; apiKey: string } }>;
  updateConfig(config: { llm?: { provider?: string; model?: string; apiKey?: string } }): Promise<{ llm: { provider: string; model: string; apiKey: string } }>;
  setWindowTitle(title: string): Promise<void>;
  respondToClose(shouldClose: boolean): Promise<void>;
  onAppCloseRequest(callback: () => void): () => void;
  onMenu(channel: 'menu:saveProject' | 'menu:reloadProject' | 'menu:exportLatex' | 'menu:draftProof', callback: () => void): () => void;
}

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
}

export {};
