import { Outlet } from 'react-router-dom';

export default function AppLayout() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-slate-950 text-slate-100">
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
