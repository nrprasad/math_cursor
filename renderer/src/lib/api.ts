import type { Project } from './types';

export class ApiError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

function toApiError(error: unknown, fallbackMessage: string): ApiError {
  if (error && typeof error === 'object') {
    const message = (error as { message?: string }).message ?? fallbackMessage;
    const code = (error as { code?: string }).code ?? 'UNKNOWN';
    return new ApiError(message, code);
  }
  return new ApiError(fallbackMessage, 'UNKNOWN');
}

function api() {
  if (!window.desktopApi) {
    throw new ApiError('Desktop API not available', 'UNINITIALIZED');
  }
  return window.desktopApi;
}

export async function createProject(id: string, title: string): Promise<Project> {
  try {
    const { project } = await api().createProject(id, title);
    return project;
  } catch (error) {
    throw toApiError(error, 'Failed to create project');
  }
}

export async function getProject(id: string): Promise<{ project: Project; etag: string }> {
  try {
    return await api().getProject(id);
  } catch (error) {
    throw toApiError(error, 'Failed to load project');
  }
}

export async function saveProject(project: Project, etag: string): Promise<{ etag: string }> {
  try {
    return await api().saveProject(project, etag);
  } catch (error) {
    throw toApiError(error, 'Failed to save project');
  }
}

export async function draftProof(
  projectId: string,
  lemmaId?: string,
): Promise<{ draft_md: string; warnings: string[] }> {
  try {
    return await api().draftProof(projectId, lemmaId);
  } catch (error) {
    throw toApiError(error, 'Failed to draft proof');
  }
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = window.atob(base64);
  const length = binary.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export async function exportLatex(
  projectId: string,
): Promise<{ blob: Blob; filename: string }> {
  try {
    const { data, filename } = await api().exportLatex(projectId);
    return { blob: base64ToBlob(data, 'application/zip'), filename };
  } catch (error) {
    throw toApiError(error, 'Failed to export LaTeX');
  }
}

export interface ChatPromptPayload {
  prompt: string;
  provider?: string;
  model?: string;
  apiKey?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export async function sendChatPrompt(payload: ChatPromptPayload): Promise<string> {
  const { prompt, provider, model, apiKey, history } = payload;
  if (!prompt?.trim()) {
    throw new ApiError('Prompt is required', 'BAD_REQUEST');
  }
  try {
    const { message } = await api().chatPrompt({ prompt, provider, model, apiKey, history });
    return message;
  } catch (error) {
    throw toApiError(error, 'Failed to generate assistant response');
  }
}

export interface ProjectSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  try {
    const { projects } = await api().listProjects();
    return projects;
  } catch (error) {
    throw toApiError(error, 'Failed to list projects');
  }
}
