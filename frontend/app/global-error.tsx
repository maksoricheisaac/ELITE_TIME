"use client";

import { GlobalErrorReset } from "@/components/ui/global-error-reset";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Erreur — Elite Time</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: #0f172a;
            color: #e2e8f0;
            min-height: 100dvh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
          }
          .card {
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 12px;
            padding: 2rem;
            max-width: 420px;
            width: 100%;
            text-align: center;
          }
          .icon { font-size: 2.5rem; margin-bottom: 1rem; }
          h1 { font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem; }
          p { font-size: 0.875rem; color: #94a3b8; margin-bottom: 1.5rem; }
          .digest {
            font-family: monospace;
            font-size: 0.75rem;
            color: #64748b;
            margin-bottom: 1.5rem;
          }
        `}</style>
      </head>
      <body>
        <div className="card">
          <div className="icon">⚠️</div>
          <h1>Une erreur inattendue est survenue</h1>
          <p>
            L&apos;application a rencontré une erreur critique.
            Veuillez réessayer ou contacter votre administrateur.
          </p>
          {error.digest && (
            <p className="digest">Référence : {error.digest}</p>
          )}
          <GlobalErrorReset onReset={reset} />
        </div>
      </body>
    </html>
  );
}
