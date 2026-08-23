import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  Calendar,
  Clock,
  User,
  Activity,
  FileText,
  Settings,
  Bell,
  Stethoscope,
  Users,
  Shield,
  X,
} from 'lucide-react';
import clsx from 'clsx';

export const Sidebar = ({ mobileOpen = false, onClose = () => {} }) => {
  const { user } = useAuth();

  const patientLinks = [
    { name: 'My Appointments', path: '/patient', icon: Calendar },
    { name: 'Find a Physician', path: '/patient/doctors', icon: Stethoscope },
    { name: 'Book Appointment', path: '/patient/book', icon: Activity },
    { name: 'Medical Records', path: '/patient/records', icon: FileText },
    { name: 'Notifications', path: '/patient/notifications', icon: Bell },
    { name: 'Calendar & Settings', path: '/settings', icon: Settings },
  ];

  const doctorLinks = [
    { name: 'Consultations', path: '/doctor', icon: Stethoscope },
    { name: 'Schedule & Slots', path: '/doctor/schedule', icon: Clock },
    { name: 'Leaves & Time Off', path: '/doctor/leaves', icon: Calendar },
    { name: 'Calendar & Settings', path: '/settings', icon: Settings },
  ];

  const adminLinks = [
    { name: 'System Overview', path: '/admin', icon: Shield },
    { name: 'Doctors & Schedules', path: '/admin/doctors', icon: Stethoscope },
    { name: 'Notifications Log', path: '/admin/notifications', icon: Bell },
    { name: 'User Management', path: '/admin/users', icon: Users },
    { name: 'Calendar & Settings', path: '/settings', icon: Settings },
  ];

  let links = patientLinks;
  if (user?.role === 'doctor') links = doctorLinks;
  if (user?.role === 'admin') links = adminLinks;

  const content = (
    <aside className="w-64 bg-white border-r border-slate-200/80 h-full p-4 flex flex-col justify-between">
      <div className="space-y-1">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            {user?.role} Portal
          </span>
          {mobileOpen && (
            <button onClick={onClose} className="lg:hidden p-1 text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {links.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              end={item.path === '/patient' || item.path === '/doctor' || item.path === '/admin'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-teal-50 text-teal-700 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                )
              }
            >
              <Icon className="w-4 h-4" />
              <span>{item.name}</span>
            </NavLink>
          );
        })}
      </div>

      <div className="p-3 bg-teal-50/70 rounded-xl border border-teal-100/80 text-xs text-teal-900">
        <p className="font-semibold mb-0.5">🔒 Clinical Data Privacy</p>
        <p className="text-teal-700 text-[11px] leading-relaxed">
          AI triage summaries are for clinician reference only.
        </p>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <div className="hidden lg:block h-[calc(100vh-4rem)] sticky top-16 shrink-0">
        {content}
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs" onClick={onClose} />
          <div className="relative z-10 w-64 max-w-xs h-full bg-white shadow-xl">
            {content}
          </div>
        </div>
      )}
    </>
  );
};
