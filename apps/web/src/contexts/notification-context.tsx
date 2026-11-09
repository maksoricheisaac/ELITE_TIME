"use client"
import { createContext, useContext, ReactNode } from 'react';
import { toast } from 'sonner';

interface NotificationContextType {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
  showWarning: (message: string) => void;
  showLoading: (message: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const showSuccess = (message: string) => {
    toast.success(message, {
      unstyled: true,
      classNames: {
        toast:
          'flex items-center gap-3 rounded-lg border border-emerald-700 bg-emerald-600 px-4 py-3 text-white shadow-lg font-semibold',
      },
    });
  };

  const showError = (message: string) => {
    toast.error(message, {
      unstyled: true,
      classNames: {
        toast:
          'flex items-center gap-3 rounded-lg border border-red-800 bg-red-600 px-4 py-3 text-white shadow-lg text font-semibold',
      },
    });
  };

  const showInfo = (message: string) => {
    toast.info(message, {
      unstyled: true,
      classNames: {
        toast:
          'flex items-center gap-3 rounded-lg border border-sky-800 bg-sky-600 px-4 py-3 text-white shadow-lg font-semibold',
      },
    });
  };

  const showWarning = (message: string) => {
    toast.warning(message, {
      unstyled: true,
      classNames: {
        toast:
          'flex items-center gap-3 rounded-lg border border-amber-800 bg-amber-500 px-4 py-3 text-white shadow-lg font-semibold',
      },
    });
  };

  const showLoading = (message: string) => {
    toast.loading(message, {
      unstyled: true,
      classNames: {
        toast:
          'flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-700 px-4 py-3 text-white shadow-lg font-semibold',
      },
    });
  };

  return (
    <NotificationContext.Provider
      value={{ showSuccess, showError, showInfo, showWarning, showLoading }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
