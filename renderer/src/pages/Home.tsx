import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ApiError, createProject, listProjects, type ProjectSummary } from '../lib/api';

export default function HomePage() {
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('Untitled');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [openId, setOpenId] = useState('');

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);
    setProjectsError(null);
    try {
      const result = await listProjects();
      setProjects(result);
    } catch (err) {
      if (err instanceof ApiError) {
        setProjectsError(err.message);
      } else {
        setProjectsError('Failed to load projects');
      }
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!window.desktopApi?.onAppCloseRequest) {
      return undefined;
    }
    const unsubscribe = window.desktopApi.onAppCloseRequest(() => {
      if (window.desktopApi?.respondToClose) {
        void window.desktopApi.respondToClose(true);
      }
    });
    return unsubscribe;
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId.trim()) {
      setError('Project ID is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const id = projectId.trim();
      await createProject(id, title.trim());
      navigate(`/p/${id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to create project');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = (id: string) => {
    if (!id.trim()) {
      setProjectsError('Project ID is required to open');
      return;
    }
    setProjectsError(null);
    setOpenId('');
    navigate(`/p/${id.trim()}`);
  };

  const formattedProjects = useMemo(
    () =>
      projects.map((project) => ({
        ...project,
        updatedDisplay: new Date(project.updatedAt).toLocaleString(),
      })),
    [projects],
  );

  return (
    <main className="space-y-10">
      <header className="space-y-3">
        <span className="inline-flex items-center gap-2 border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-sky-200">
          Proof workspace
        </span>
        <h1 className="text-4xl font-semibold tracking-tight text-white">Cursor for Math Proofs</h1>
        <p className="max-w-3xl text-base text-slate-300">
          Capture notation, facts, lemmas, and proof attempts in one polished desktop workspace. Pick up where you left off or start a fresh project with a couple of clicks.
        </p>
      </header>
      <section className="grid gap-6 lg:grid-cols-2">
        <article className="border border-white/10 bg-slate-900/90 p-8 shadow-sm">
          <h2 className="text-2xl font-semibold text-white">Create a project</h2>
          <p className="mt-2 text-sm text-slate-300">Choose a memorable identifier and optional title to spin up a new proof space.</p>
          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200" htmlFor="projectId">
                Project ID
              </label>
              <input
                id="projectId"
                name="projectId"
                className="w-full border border-white/10 bg-slate-950 px-4 py-3 text-base text-slate-100 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                placeholder="e.g. algebraic-topology"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200" htmlFor="title">
                Title
              </label>
              <input
                id="title"
                name="title"
                className="w-full border border-white/10 bg-slate-950 px-4 py-3 text-base text-slate-100 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={loading}
              />
            </div>
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            <button
              type="submit"
              className="inline-flex items-center justify-center bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
            >
              {loading ? 'Creating…' : 'Create project'}
            </button>
          </form>
        </article>
        <article className="border border-white/10 bg-slate-900/90 p-8 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white">Open a project</h2>
              <p className="mt-1 text-sm text-slate-300">Browse recent projects or jump straight to an ID.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="w-52 border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                placeholder="Enter project ID"
                value={openId}
                onChange={(event) => setOpenId(event.target.value)}
              />
              <button
                type="button"
                className="bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400"
                onClick={() => handleOpen(openId)}
              >
                Open
              </button>
              <button
                type="button"
                className="border border-white/10 px-4 py-2.5 text-sm text-slate-200 transition hover:border-sky-400 hover:text-sky-200"
                onClick={loadProjects}
                disabled={loadingProjects}
              >
                {loadingProjects ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </div>
          {projectsError ? <p className="mt-3 text-sm text-red-400">{projectsError}</p> : null}
          <div className="mt-5 max-h-80 overflow-y-auto border border-white/5 bg-slate-900">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-900 text-xs uppercase tracking-wide text-slate-300">
                <tr>
                  <th className="px-5 py-3 font-semibold">Title</th>
                  <th className="px-5 py-3 font-semibold">ID</th>
                  <th className="px-5 py-3 font-semibold">Last updated</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-200">
                {formattedProjects.length ? (
                  formattedProjects.map((project) => (
                    <tr key={project.id} className="transition hover:bg-slate-800/60">
                      <td className="px-5 py-3 text-sm font-medium text-white">{project.title || 'Untitled'}</td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-300">{project.id}</td>
                      <td className="px-5 py-3 text-sm text-slate-300">{project.updatedDisplay}</td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          className="bg-sky-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-sky-400"
                          onClick={() => handleOpen(project.id)}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-5 py-10 text-center text-sm text-slate-400" colSpan={4}>
                      {loadingProjects ? 'Loading projects…' : 'No projects found yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </main>
  );
}
