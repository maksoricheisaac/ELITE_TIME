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

/**
 * Notifications (design-system/MASTER.md §6). Le style — fond doux sémantique, texte contrasté, icône propre
 * à chaque nature — est défini une fois pour toutes dans `ui/sonner.tsx` ; ici on ne choisit que la durée :
 *  - confirmation : courte (l'action est terminée, rien à lire longtemps) ;
 *  - information : moyenne ;
 *  - avertissement / erreur : plus longues (l'utilisateur doit pouvoir lire et agir) ;
 *  - en cours : persiste jusqu'à ce que l'appelant la remplace.
 */
export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const showSuccess = (message: string) => {
    toast.success(message, { duration: 3500 });
  };

  const showError = (message: string) => {
    toast.error(message, { duration: 7000 });
  };

  const showInfo = (message: string) => {
    toast.info(message, { duration: 4500 });
  };

  const showWarning = (message: string) => {
    toast.warning(message, { duration: 6000 });
  };

  const showLoading = (message: string) => {
    toast.loading(message);
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
