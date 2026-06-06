'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';

interface DownloadButtonProps {
  type: 'daily' | 'weekly' | 'monthly';
  format: 'excel' | 'csv';
  label: string;
  description: string;
  onDownload: (type: string, format: string) => void;
  isDownloading: boolean;
}

function DownloadButton({ type, format, label, description, onDownload, isDownloading }: DownloadButtonProps) {
  const handleDownload = () => {
    onDownload(type, format);
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {format === 'excel' ? <FileSpreadsheet className="h-5 w-5 text-green-600" /> : <FileText className="h-5 w-5 text-blue-600" />}
            {label}
          </CardTitle>
          <Badge variant={format === 'excel' ? 'default' : 'secondary'}>
            {format === 'excel' ? 'Excel' : 'CSV'}
          </Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button 
          onClick={handleDownload} 
          disabled={isDownloading}
          className="w-full"
          variant={format === 'excel' ? 'default' : 'outline'}
        >
          <Download className="h-4 w-4 mr-2" />
          {isDownloading ? 'Téléchargement...' : 'Télécharger'}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function TestReportsPage() {
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  const handleDownload = async (type: string, format: string) => {
    const downloadKey = `${type}-${format}`;
    setIsDownloading(downloadKey);

    try {
      const response = await fetch(`/api/test-reports?type=${type}&format=${format}`);
      
      if (!response.ok) {
        throw new Error('Erreur lors de la génération du fichier');
      }

      // Obtenir le nom du fichier depuis les headers
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition && contentDisposition.match(/filename="(.+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `rapport_${type}_${format}.${format === 'excel' ? 'xlsx' : 'csv'}`;

      // Créer un blob et déclencher le téléchargement
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (error) {
      console.error('Erreur de téléchargement:', error);
      alert('Erreur lors du téléchargement du fichier');
    } finally {
      setIsDownloading(null);
    }
  };

  const reportTypes = [
    {
      type: 'daily' as const,
      title: 'Rapport Journalier',
      description: 'Génère un rapport pour la journée du jour avec les pointages de tous les employés',
      excel: {
        label: 'Rapport Journalier Excel',
        description: 'Fichier Excel avec mise en forme et couleurs',
      },
      csv: {
        label: 'Rapport Journalier CSV',
        description: 'Fichier CSV compatible Excel avec encodage UTF-8',
      },
    },
    {
      type: 'weekly' as const,
      title: 'Rapport Hebdomadaire',
      description: 'Génère un rapport pour les 5 derniers jours avec les pointages de tous les employés',
      excel: {
        label: 'Rapport Hebdomadaire Excel',
        description: 'Fichier Excel avec mise en forme et couleurs',
      },
      csv: {
        label: 'Rapport Hebdomadaire CSV',
        description: 'Fichier CSV compatible Excel avec encodage UTF-8',
      },
    },
    {
      type: 'monthly' as const,
      title: 'Rapport Mensuel',
      description: 'Génère un rapport pour le mois en cours avec tous les pointages du mois',
      excel: {
        label: 'Rapport Mensuel Excel',
        description: 'Fichier Excel avec mise en forme et couleurs',
      },
      csv: {
        label: 'Rapport Mensuel CSV',
        description: 'Fichier CSV compatible Excel avec encodage UTF-8',
      },
    },
  ];

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Page de Test des Rapports</h1>
        <p className="text-gray-600">
          Utilisez cette page pour tester et télécharger les différents rapports générés par le système.
          Les fichiers sont générés avec des données de test pour validation.
        </p>
      </div>

      <div className="grid gap-8">
        {reportTypes.map((reportType) => (
          <div key={reportType.type}>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="text-2xl">
                {reportType.type === 'daily' && '📅'}
                {reportType.type === 'weekly' && '📊'}
                {reportType.type === 'monthly' && '📈'}
              </span>
              {reportType.title}
            </h2>
            <p className="text-gray-600 mb-4">{reportType.description}</p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <DownloadButton
                type={reportType.type}
                format="excel"
                label={reportType.excel.label}
                description={reportType.excel.description}
                onDownload={handleDownload}
                isDownloading={isDownloading === `${reportType.type}-excel`}
              />
              <DownloadButton
                type={reportType.type}
                format="csv"
                label={reportType.csv.label}
                description={reportType.csv.description}
                onDownload={handleDownload}
                isDownloading={isDownloading === `${reportType.type}-csv`}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 p-6 bg-gray-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-4">📋 Informations sur les Données</h3>
        <div className="grid md:grid-cols-2 gap-6 text-sm">
          <div>
            <h4 className="font-medium mb-2">Source des données:</h4>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li>Utilisateurs actifs depuis la base de données</li>
              <li>Pointages réels enregistrés dans le système</li>
              <li>Filtrage automatique des employés cachés</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-2">Périodes couvertes:</h4>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li>Journalier: Pointages du jour</li>
              <li>Hebdomadaire: 5 derniers jours</li>
              <li>Mensuel: Mois en cours complet</li>
            </ul>
          </div>
        </div>
        <div className="mt-4 p-4 bg-blue-50 rounded border border-blue-200">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> Ces fichiers sont générés avec les données réelles de la base de données. 
            Les employés sans pointages pour la période sélectionnée apparaîtront avec des champs vides. 
            Les données chiffrées sont automatiquement déchiffrées lors de la génération.
          </p>
        </div>
      </div>
    </div>
  );
}
