import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from '../common/Navbar';

export const MainLayout = () => {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="bg-white border-t border-slate-200 py-8 text-center text-sm text-slate-500">
        <div className="max-w-7xl mx-auto px-4">
          <p>© {new Date().getFullYear()} VibeHealth Platform. All rights reserved.</p>
          <p className="text-xs text-slate-400 mt-1">
            Compliant with clinical safety, triage disclaimers, and data protection standards.
          </p>
        </div>
      </footer>
    </div>
  );
};
