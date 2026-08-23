import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { HeartPulse, User, LogOut, Calendar, Stethoscope, Shield } from 'lucide-react';
import { Button } from './Button';

export const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getDashboardPath = () => {
    if (!user) return '/login';
    if (user.role === 'doctor') return '/doctor';
    if (user.role === 'admin') return '/admin';
    return '/patient';
  };

  return (
    <header className="sticky top-0 z-50 glassmorphism border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link to="/" className="flex items-center space-x-3 group">
          <div className="p-2 bg-gradient-to-tr from-teal-600 to-teal-500 rounded-xl text-white shadow-md shadow-teal-500/20 group-hover:scale-105 transition-transform">
            <HeartPulse className="h-6 w-6" />
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-teal-700 to-slate-900 bg-clip-text text-transparent">
            VibeHealth
          </span>
        </Link>

        {/* Navigation Actions */}
        <nav className="flex items-center space-x-4">
          {isAuthenticated ? (
            <div className="flex items-center space-x-3">
              <Link to={getDashboardPath()}>
                <Button variant="outline" size="sm" className="hidden sm:inline-flex items-center gap-1.5">
                  {user?.role === 'doctor' && <Stethoscope className="w-4 h-4 text-teal-600" />}
                  {user?.role === 'admin' && <Shield className="w-4 h-4 text-purple-600" />}
                  {user?.role === 'patient' && <Calendar className="w-4 h-4 text-teal-600" />}
                  <span>Dashboard</span>
                </Button>
              </Link>
              <div className="flex items-center space-x-2 text-sm text-slate-700 font-medium pl-2">
                <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-xs uppercase">
                  {user?.name?.charAt(0) || 'U'}
                </div>
                <span className="hidden md:inline-block">{user?.name}</span>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-slate-500 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                title="Log out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-3">
              <Link to="/login">
                <Button variant="ghost" size="sm">
                  Sign In
                </Button>
              </Link>
              <Link to="/register">
                <Button variant="primary" size="sm">
                  Get Started
                </Button>
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
};
