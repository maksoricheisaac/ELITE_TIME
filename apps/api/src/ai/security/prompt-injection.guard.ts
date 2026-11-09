const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /disregard\s+(all\s+)?previous/i,
  /forget\s+(all\s+)?previous/i,
  /override\s+(all\s+)?instructions?/i,
  /ignore[rz]?\s+(toutes?\s+)?(les?\s+)?instructions?\s+pr[ee]c[ee]dentes?/i,
  /oublie[rz]?\s+(toutes?\s+)?(les?\s+)?instructions?\s+pr[ee]c[ee]dentes?/i,
  /nouvelle[sz]?\s+instructions?:/i,
  /new\s+instructions?:/i,
  /you\s+are\s+now\s+(?!EliteTime)/i,
  /tu\s+es\s+maintenant\s+(?!EliteTime)/i,
  /act\s+as\s+(?!assistant|EliteTime)/i,
  /pretend\s+(you\s+are|to\s+be)/i,
  /r[o]le[- ]play/i,
  /\[INST\]/i,
  /<<SYS>>/i,
  /<\|system\|>/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /\[\/INST\]/i,
  /override\s+safety/i,
  /bypass\s+(safety|security|filter)/i,
  /jailbreak/i,
  /DAN\s+mode/i,
  /^system:/im,
  /\nsystem:/im,
];

export const AI_MAX_MESSAGE_LENGTH = 1000;
export const AI_MAX_HISTORY_ENTRY_LENGTH = 2000;

function stripControlChars(text: string): string {
  return text
    .split('')
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return !(
        code <= 8 ||
        code === 11 ||
        code === 12 ||
        (code >= 14 && code <= 31) ||
        code === 127
      );
    })
    .join('');
}

export function sanitizeAiInput(
  text: string,
  maxLength = AI_MAX_MESSAGE_LENGTH,
): string {
  return stripControlChars(text.replace(/<[^>]*>/g, ''))
    .slice(0, maxLength)
    .trim();
}

export function detectPromptInjection(message: string): boolean {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(message)) {
      return true;
    }
  }
  return false;
}

export function validateAiMessage(message: string): {
  clean: boolean;
  reason?: string;
} {
  if (!message || message.trim().length === 0) {
    return { clean: false, reason: 'Message vide.' };
  }
  if (message.length > AI_MAX_MESSAGE_LENGTH) {
    return { clean: false, reason: 'Message trop long.' };
  }
  if (detectPromptInjection(message)) {
    return { clean: false, reason: 'Contenu non autorise.' };
  }
  return { clean: true };
}
