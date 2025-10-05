import { useParams } from 'react-router-dom';

import ProjectEditor from '../components/ProjectEditor';

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return (
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Invalid project URL</h2>
        <p className="text-sm text-red-400">A project identifier is required.</p>
      </section>
    );
  }

  return <ProjectEditor projectId={id} />;
}
