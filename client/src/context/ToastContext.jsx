import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'success', duration = 4000) => {
    const id = Date.now() + Math.random().toString(36).substr(2, 4);
    setToasts((prev) => [...prev, { id, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      {/* Floating Toasts Container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col space-y-2 max-w-sm w-full px-4 pointer-events-none">
        {toasts.map((toast) => {
          let bgClass = 'bg-slate-900 text-white border-slate-700';
          let IconComponent = CheckCircle2;

          if (toast.type === 'success') {
            bgClass = 'bg-emerald-900/90 text-emerald-100 border-emerald-700/60 backdrop-blur-md shadow-lg shadow-emerald-950/20';
            IconComponent = CheckCircle2;
          } else if (toast.type === 'danger') {
            bgClass = 'bg-rose-900/90 text-rose-100 border-rose-700/60 backdrop-blur-md shadow-lg shadow-rose-950/20';
            IconComponent = AlertCircle;
          } else if (toast.type === 'warning') {
            bgClass = 'bg-amber-900/90 text-amber-100 border-amber-700/60 backdrop-blur-md shadow-lg shadow-amber-950/20';
            IconComponent = AlertTriangle;
          } else if (toast.type === 'info') {
            bgClass = 'bg-teal-900/90 text-teal-100 border-teal-700/60 backdrop-blur-md shadow-lg shadow-teal-950/20';
            IconComponent = Info;
          }

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto p-4 rounded-2xl border flex items-start justify-between gap-3 text-xs font-medium transition-all animate-in fade-in slide-in-from-bottom-2 duration-200 ${bgClass}`}
            >
              <div className="flex items-center gap-2.5">
                <IconComponent className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-snug">{toast.message}</span>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="opacity-70 hover:opacity-100 transition p-0.5 rounded-lg"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
