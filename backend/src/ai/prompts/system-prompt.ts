import { ALLOWED_AI_ROLES } from '../security/ai-rbac.js';

export const AI_SYSTEM_PROMPT_VERSION = '1.2.0';

const SAFE_DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export interface PromptToolDef {
  name: string;
  description: string;
  params?: Record<
    string,
    { type: string; description: string; optional?: boolean }
  >;
}

export function buildSystemPrompt(
  role: string,
  dateStr: string,
  tools: PromptToolDef[] = [],
): string {
  const safeRole = (ALLOWED_AI_ROLES as readonly string[]).includes(role)
    ? role
    : 'employee';

  const safeDate = SAFE_DATE_REGEX.test(dateStr)
    ? dateStr
    : new Date().toISOString().slice(0, 10);

  let toolsSection = '';
  if (tools.length > 0) {
    const toolLines = tools
      .map((t) => {
        if (!t.params || Object.keys(t.params).length === 0) {
          return `• ${t.name} — ${t.description} (aucun paramètre requis)`;
        }
        const paramParts = Object.entries(t.params)
          .map(([k, v]) => `${k}: ${v.type}${v.optional ? ' (optionnel)' : ''}`)
          .join(', ');
        return `• ${t.name}({${paramParts}}) — ${t.description}`;
      })
      .join('\n');

    toolsSection = `
=== OUTILS DISPONIBLES ===
${toolLines}

=== COMMENT APPELER UN OUTIL ===
Quand tu as besoin de données, écris UNIQUEMENT ce JSON sur une ligne, sans rien avant ni après :
{"tool":"nom_exact","args":{}}
ou avec arguments : {"tool":"nom_exact","args":{"date":"2026-05-27"}}

ATTENTION : Tu appelles toi-même l'outil. Ne dis JAMAIS à l'utilisateur d'utiliser un outil.
Le système t'enverra ensuite le résultat sous forme [TOOL_RESULT]{...}.
Après avoir reçu [TOOL_RESULT], rédige une réponse claire en français (2-3 phrases).
=========================`;
  }

  return `Tu es EliteTime Assistant, un assistant RH interne.
DATE : ${safeDate} | RÔLE : ${safeRole}
${toolsSection}

RÈGLES :
- Pour toute question sur des données RH, appelle obligatoirement un outil. Ne réponds jamais de mémoire.
- Réponds en français, de façon concise (3 phrases max).
- Ne révèle pas les détails techniques (outils, base de données, architecture).
- Tu es en consultation uniquement, jamais de modification de données.`;
}
