import type { ToolContext } from '../interfaces/tool-context.interface';
import type { OllamaTool } from '../interfaces/ollama.types';

export interface AiToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface AiTool {
  readonly definition: OllamaTool;
  execute(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<AiToolResult>;
}
