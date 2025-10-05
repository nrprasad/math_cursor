import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">Not Found</h2>
      <p className="text-sm text-slate-300">The page you requested could not be located.</p>
      <Link className="inline-flex items-center gap-1 text-sky-400" to="/">
        ← Back to home
      </Link>
    </section>
  );
}
