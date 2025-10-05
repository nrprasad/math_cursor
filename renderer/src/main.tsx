import React from 'react';
import ReactDOM from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router-dom';

import AppLayout from './App';
import HomePage from './pages/Home';
import ProjectPage from './pages/Project';
import NotFoundPage from './pages/NotFound';

import 'katex/dist/katex.min.css';
import './styles/globals.css';

const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'p/:id', element: <ProjectPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
