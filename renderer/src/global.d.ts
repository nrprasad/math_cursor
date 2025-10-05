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
  onMenu(channel: 'menu:saveProject' | 'menu:reloadProject' | 'menu:exportLatex' | 'menu:draftProof', callback: () => void): () => void;
}

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
}

export {};
