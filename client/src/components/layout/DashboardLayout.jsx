import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from '../common/Navbar';
import { Sidebar } from '../common/Sidebar';
import { Menu } from 'lucide-react';

export const DashboardLayout = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar />
      
      {/* Mobile Top Navigation Bar Bar */}
      <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex items-center gap-2 text-xs font-semibold text-slate-700 p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
        >
          <Menu className="w-4 h-4 text-teal-600" />
          <span>Menu</span>
        </button>
        <span className="text-[11px] font-bold text-teal-700 uppercase tracking-wider">VibeHealth Portal</span>
      </div>

      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        <Sidebar mobileOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
        <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
