export type UserRole = 'employee' | 'manager' | 'admin';

export interface User {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  department: string;
  position: string;
  avatar: string;
  status: 'active' | 'inactive';
}

export interface Pointage {
  id: string;
  userId: string;
  date: string;
  entryTime: string | null;
  exitTime: string | null;
  duration: number; // en minutes
  status: 'normal' | 'late' | 'incomplete';
  isActive: boolean;
}

export interface Absence {
  id: string;
  userId: string;
  type: 'congé' | 'maladie' | 'autre';
  startDate: string;
  endDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  comment?: string;
}

export interface CorrectionRequest {
  id: string;
  userId: string;
  pointageId: string;
  requestDate: string;
  originalEntry: string | null;
  originalExit: string | null;
  newEntry: string;
  newExit: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface ActivityLog {
  id: string;
  userId: string;
  action: string;
  details: string;
  timestamp: string;
  type: 'auth' | 'pointage' | 'absence' | 'user' | 'validation';
}

// Utilisateurs mockés
export const mockUsers: User[] = [
  // Admins
  { id: '1', email: 'admin@company.com', password: 'password', firstName: 'Sophie', lastName: 'Martin', role: 'admin', department: 'Direction', position: 'Directrice Générale', avatar: '👩‍💼', status: 'active' },
  { id: '2', email: 'admin2@company.com', password: 'password', firstName: 'Pierre', lastName: 'Bernard', role: 'admin', department: 'Direction', position: 'Directeur IT', avatar: '👨‍💻', status: 'active' },
  
  // Managers
  { id: '3', email: 'manager@company.com', password: 'password', firstName: 'Julie', lastName: 'Dupont', role: 'manager', department: 'Développement', position: 'Chef de Projet', avatar: '👩‍💼', status: 'active' },
  { id: '4', email: 'manager2@company.com', password: 'password', firstName: 'Marc', lastName: 'Lefebvre', role: 'manager', department: 'Commercial', position: 'Responsable Commercial', avatar: '👨‍💼', status: 'active' },
  { id: '5', email: 'manager3@company.com', password: 'password', firstName: 'Emma', lastName: 'Moreau', role: 'manager', department: 'RH', position: 'Responsable RH', avatar: '👩', status: 'active' },
  
  // Employés
  { id: '6', email: 'employee@company.com', password: 'password', firstName: 'Thomas', lastName: 'Petit', role: 'employee', department: 'Développement', position: 'Développeur Full Stack', avatar: '👨‍💻', status: 'active' },
  { id: '7', email: 'marie.durand@company.com', password: 'password', firstName: 'Marie', lastName: 'Durand', role: 'employee', department: 'Développement', position: 'Développeuse Frontend', avatar: '👩‍💻', status: 'active' },
  { id: '8', email: 'lucas.roux@company.com', password: 'password', firstName: 'Lucas', lastName: 'Roux', role: 'employee', department: 'Développement', position: 'Développeur Backend', avatar: '👨‍💻', status: 'active' },
  { id: '9', email: 'camille.garcia@company.com', password: 'password', firstName: 'Camille', lastName: 'Garcia', role: 'employee', department: 'Commercial', position: 'Attachée Commerciale', avatar: '👩', status: 'active' },
  { id: '10', email: 'maxime.blanc@company.com', password: 'password', firstName: 'Maxime', lastName: 'Blanc', role: 'employee', department: 'Commercial', position: 'Commercial Senior', avatar: '👨', status: 'active' },
  { id: '11', email: 'lea.simon@company.com', password: 'password', firstName: 'Léa', lastName: 'Simon', role: 'employee', department: 'RH', position: 'Chargée de Recrutement', avatar: '👩', status: 'active' },
  { id: '12', email: 'hugo.michel@company.com', password: 'password', firstName: 'Hugo', lastName: 'Michel', role: 'employee', department: 'Comptabilité', position: 'Comptable', avatar: '👨', status: 'active' },
  { id: '13', email: 'clara.fontaine@company.com', password: 'password', firstName: 'Clara', lastName: 'Fontaine', role: 'employee', department: 'Comptabilité', position: 'Assistante Comptable', avatar: '👩', status: 'active' },
  { id: '14', email: 'antoine.chevalier@company.com', password: 'password', firstName: 'Antoine', lastName: 'Chevalier', role: 'employee', department: 'Développement', position: 'DevOps', avatar: '👨‍💻', status: 'active' },
  { id: '15', email: 'sarah.girard@company.com', password: 'password', firstName: 'Sarah', lastName: 'Girard', role: 'employee', department: 'Commercial', position: 'Chargée de Clientèle', avatar: '👩', status: 'active' },
];

// Fonction pour générer des pointages sur les 30 derniers jours
const generatePointages = (): Pointage[] => {
  const pointages: Pointage[] = [];
  const today = new Date();
  
  mockUsers.filter(u => u.role === 'employee').forEach(user => {
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      // Pas de pointage le week-end
      if (date.getDay() === 0 || date.getDay() === 6) continue;
      
      // 90% de présence
      if (Math.random() > 0.9) continue;
      
      const entryHour = 8 + Math.floor(Math.random() * 2); // 8h-10h
      const entryMinute = Math.floor(Math.random() * 60);
      const entryTime = `${entryHour.toString().padStart(2, '0')}:${entryMinute.toString().padStart(2, '0')}`;
      
      const exitHour = 17 + Math.floor(Math.random() * 2); // 17h-19h
      const exitMinute = Math.floor(Math.random() * 60);
      const exitTime = i === 0 && user.id === '6' ? null : `${exitHour.toString().padStart(2, '0')}:${exitMinute.toString().padStart(2, '0')}`;
      
      const duration = exitTime ? (exitHour - entryHour) * 60 + (exitMinute - entryMinute) - 60 : 0; // -60 pour la pause
      const isLate = entryHour >= 9 && entryMinute > 0;
      
      pointages.push({
        id: `p-${user.id}-${i}`,
        userId: user.id,
        date: date.toISOString().split('T')[0],
        entryTime,
        exitTime,
        duration,
        status: exitTime ? (isLate ? 'late' : 'normal') : 'incomplete',
        isActive: i === 0 && user.id === '6' && !exitTime
      });
    }
  });
  
  return pointages;
};

export const mockPointages: Pointage[] = generatePointages();

// Absences mockées
export const mockAbsences: Absence[] = [
  { id: 'a1', userId: '6', type: 'congé', startDate: '2025-11-15', endDate: '2025-11-20', reason: 'Vacances d\'été', status: 'approved', comment: 'Approuvé par le manager' },
  { id: 'a2', userId: '7', type: 'maladie', startDate: '2025-11-01', endDate: '2025-11-02', reason: 'Grippe', status: 'approved' },
  { id: 'a3', userId: '8', type: 'congé', startDate: '2025-11-25', endDate: '2025-11-30', reason: 'Congés de fin d\'année', status: 'pending' },
  { id: 'a4', userId: '9', type: 'autre', startDate: '2025-11-10', endDate: '2025-11-10', reason: 'Rendez-vous médical', status: 'approved' },
  { id: 'a5', userId: '10', type: 'congé', startDate: '2025-12-01', endDate: '2025-12-05', reason: 'Vacances', status: 'rejected', comment: 'Période chargée' },
];

// Demandes de correction
export const mockCorrectionRequests: CorrectionRequest[] = [
  { id: 'c1', userId: '7', pointageId: 'p-7-5', requestDate: '2025-11-04', originalEntry: '09:15', originalExit: '18:30', newEntry: '08:45', newExit: '18:30', reason: 'J\'étais arrivé à l\'heure mais j\'ai oublié de pointer', status: 'pending' },
  { id: 'c2', userId: '9', pointageId: 'p-9-3', requestDate: '2025-11-02', originalEntry: '08:30', originalExit: null, newEntry: '08:30', newExit: '17:45', reason: 'Oubli de pointage sortie', status: 'pending' },
];

// Logs d'activité
export const mockActivityLogs: ActivityLog[] = [
  { id: 'l1', userId: '1', action: 'Connexion', details: 'Connexion réussie', timestamp: new Date().toISOString(), type: 'auth' },
  { id: 'l2', userId: '6', action: 'Pointage Entrée', details: 'Pointage enregistré à 08:45', timestamp: new Date(Date.now() - 3600000).toISOString(), type: 'pointage' },
  { id: 'l3', userId: '3', action: 'Validation Congé', details: 'Congé de Marie Durand approuvé', timestamp: new Date(Date.now() - 7200000).toISOString(), type: 'validation' },
  { id: 'l4', userId: '1', action: 'Création Utilisateur', details: 'Nouvel employé ajouté: Jean Dupont', timestamp: new Date(Date.now() - 86400000).toISOString(), type: 'user' },
  { id: 'l5', userId: '2', action: 'Modification Paramètres', details: 'Horaires de travail modifiés', timestamp: new Date(Date.now() - 172800000).toISOString(), type: 'user' },
];

// Paramètres système
export interface SystemSettings {
  workStartTime: string;
  workEndTime: string;
  breakDuration: number; // en minutes
  overtimeThreshold: number; // en heures
  holidays: string[];
}

export const mockSettings: SystemSettings = {
  workStartTime: '09:00',
  workEndTime: '18:00',
  breakDuration: 60,
  overtimeThreshold: 8,
  holidays: [
    '2025-11-01',
    '2025-11-11',
    '2025-12-25',
    '2026-01-01',
  ]
};
