import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CircuitBreakerService } from './circuit-breaker/circuit-breaker.service.js';
import type {
  OllamaChatRequest,
  OllamaChatResponse,
} from './interfaces/ollama.types.js';

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'qwen2.5:1.5b';
const TIMEOUT_MS = 90_000;
const STREAM_TIMEOUT_MS = 180_000;
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 800;
const HEALTH_TIMEOUT_MS = 3_000;

// ─── Registre de modèles ───────────────────────────────────────────────────────

export interface ModelConfig {
  displayName: string;
  /** Nombre max de tokens de sortie recommandé */
  maxPredictTokens: number;
  /** Température recommandée pour les requêtes RH */
  temperature: number;
  /** Supporte l'appel d'outils natif */
  supportsTools: boolean;
}

const MODEL_REGISTRY: Record<string, ModelConfig> = {
  'qwen2.5': {
    displayName: 'Qwen 2.5',
    maxPredictTokens: 512,
    temperature: 0.1,
    supportsTools: true,
  },
  'qwen2.5:0.5b': {
    displayName: 'Qwen 2.5 0.5B',
    maxPredictTokens: 256,
    temperature: 0.1,
    supportsTools: true,
  },
  'qwen2.5:1.5b': {
    displayName: 'Qwen 2.5 1.5B',
    maxPredictTokens: 512,
    temperature: 0.1,
    supportsTools: true,
  },
  'qwen2.5:7b': {
    displayName: 'Qwen 2.5 7B',
    maxPredictTokens: 512,
    temperature: 0.1,
    supportsTools: true,
  },
  'qwen2.5:14b': {
    displayName: 'Qwen 2.5 14B',
    maxPredictTokens: 768,
    temperature: 0.1,
    supportsTools: true,
  },
  'llama3.2': {
    displayName: 'Llama 3.2',
    maxPredictTokens: 512,
    temperature: 0.1,
    supportsTools: true,
  },
  'llama3.1': {
    displayName: 'Llama 3.1',
    maxPredictTokens: 512,
    temperature: 0.1,
    supportsTools: true,
  },
  mistral: {
    displayName: 'Mistral 7B',
    maxPredictTokens: 512,
    temperature: 0.1,
    supportsTools: false,
  },
  phi3: {
    displayName: 'Phi-3 Mini',
    maxPredictTokens: 256,
    temperature: 0.1,
    supportsTools: false,
  },
};

// ─── Types streaming ──────────────────────────────────────────────────────────

export interface OllamaStreamChunk {
  content: string;
  done: boolean;
  done_reason?: string;
}

// ─── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class OllamaService implements OnModuleInit {
  private readonly logger = new Logger(OllamaService.name);
  private readonly baseUrl: string;
  private readonly _model: string;
  private readonly modelConfig: ModelConfig;
  constructor(private readonly circuitBreaker: CircuitBreakerService) {
    this.baseUrl = (process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL).replace(
      /\/$/,
      '',
    );
    this._model = process.env.OLLAMA_MODEL ?? DEFAULT_MODEL;
    this.modelConfig = MODEL_REGISTRY[this._model] ?? {
      displayName: this._model,
      maxPredictTokens: 512,
      temperature: 0.1,
      supportsTools: true,
    };
  }

  onModuleInit(): void {
    this.validateConfiguration();
  }

  private validateConfiguration(): void {
    const baseUrl = process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL;
    try {
      const url = new URL(baseUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        this.logger.error(
          `OLLAMA_BASE_URL invalide : protocole "${url.protocol}" non supporté.`,
        );
      }
    } catch {
      this.logger.error(
        `OLLAMA_BASE_URL invalide : "${baseUrl}" n'est pas une URL valide.`,
      );
    }
    const model = process.env.OLLAMA_MODEL ?? DEFAULT_MODEL;
    if (!model?.trim()) {
      this.logger.error('OLLAMA_MODEL vide. Modèle par défaut utilisé.');
    }
    this.logger.log(
      `OllamaService initialisé — URL: ${this.baseUrl} | modèle: ${this._model} (${this.modelConfig.displayName})`,
    );
  }

  get model(): string {
    return this._model;
  }

  get config(): ModelConfig {
    return this.modelConfig;
  }

  get circuitState(): string {
    return this.circuitBreaker.currentState;
  }

  getCircuitStats() {
    return this.circuitBreaker.getStats();
  }

  resetCircuit(): void {
    this.circuitBreaker.reset();
  }

  // ─── Requête non-streaming (tool calling) ──────────────────────────────────

  async chat(request: OllamaChatRequest): Promise<OllamaChatResponse> {
    return this.circuitBreaker.execute(
      () => this.doChat(request),
      'Ollama chat',
    );
  }

  private async doChat(
    request: OllamaChatRequest,
  ): Promise<OllamaChatResponse> {
    const url = `${this.baseUrl}/api/chat`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...request, stream: false }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(
            `Ollama HTTP ${response.status}: ${body.slice(0, 200)}`,
          );
        }

        const data = (await response.json()) as OllamaChatResponse;
        this.logger.debug(
          `Ollama OK: done=${data.done} reason=${data.done_reason}`,
        );
        return data;
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        lastError = err instanceof Error ? err : new Error(String(err));

        if (lastError.name === 'AbortError') {
          this.logger.warn(
            `[Tentative ${attempt + 1}] Ollama timeout (${TIMEOUT_MS}ms)`,
          );
        } else {
          this.logger.error(
            `[Tentative ${attempt + 1}] Ollama erreur: ${lastError.message}`,
          );
        }

        if (attempt < MAX_RETRIES) {
          await new Promise((res) =>
            setTimeout(res, RETRY_DELAY_MS * (attempt + 1)),
          );
        }
      }
    }

    throw new ServiceUnavailableException(
      "L'assistant IA est temporairement indisponible. Veuillez réessayer.",
    );
  }

  // ─── Streaming (génération finale token par token) ─────────────────────────

  /**
   * Génère la réponse finale en streaming NDJSON.
   * Yield chaque token reçu depuis Ollama.
   * À utiliser uniquement pour la dernière itération (sans tool calls attendus).
   */
  async *chatStream(
    request: Omit<OllamaChatRequest, 'stream'>,
    signal?: AbortSignal,
  ): AsyncGenerator<OllamaStreamChunk> {
    if (this.circuitBreaker.isOpen) {
      throw new ServiceUnavailableException(
        "L'assistant IA est temporairement indisponible. Veuillez réessayer.",
      );
    }

    const url = `${this.baseUrl}/api/chat`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

    // Propager l'annulation externe
    const onExternalAbort = () => controller.abort();
    signal?.addEventListener('abort', onExternalAbort);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, stream: true }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(
          `Ollama HTTP ${response.status}: ${body.slice(0, 200)}`,
        );
      }

      const body = response.body;
      if (!body) throw new Error('Ollama response body vide');

      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Traiter le reste du buffer
          if (buffer.trim()) {
            yield* this.parseNDJSON(buffer);
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Traiter les lignes complètes
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // Dernier fragment potentiellement incomplet

        for (const line of lines) {
          if (line.trim()) {
            yield* this.parseNDJSON(line);
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  private *parseNDJSON(line: string): Iterable<OllamaStreamChunk> {
    try {
      const data = JSON.parse(line) as {
        message?: { content?: string };
        done?: boolean;
        done_reason?: string;
      };

      yield {
        content: data.message?.content ?? '',
        done: data.done ?? false,
        done_reason: data.done_reason,
      };
    } catch {
      // Ligne malformée — ignorée silencieusement
    }
  }

  async isAvailable(): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      clearTimeout(timeoutId);
      return false;
    }
  }
}
