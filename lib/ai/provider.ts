import 'server-only';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';

/**
 * AI provider abstraction (server-only).
 *
 * Provider selection is driven by which API key is configured:
 *   GOOGLE_GENERATIVE_AI_API_KEY → Gemini (free tier: https://aistudio.google.com)
 *   OPENAI_API_KEY               → OpenAI
 * The model name is configurable via AI_MODEL.
 */

export interface AiModelHandle {
  model: any;
  provider: string;
  modelName: string;
}

export function getAiModel(): AiModelHandle {
  const chain = getAiModelChain();
  if (chain.length === 0) {
    throw new Error(
      'No AI provider configured. Set GOOGLE_GENERATIVE_AI_API_KEY (free at https://aistudio.google.com) or OPENAI_API_KEY.'
    );
  }
  return chain[0];
}

/**
 * Ordered fallback chain of models to try. Demo reliability matters: if the
 * primary model is overloaded (503) or out of quota (429), the review agent
 * transparently retries with the next one. Every attempt is a real API call.
 */
export function getAiModelChain(): AiModelHandle[] {
  const configured = process.env.AI_MODEL?.trim();

  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()) {
    const names = [configured || 'gemini-3.8-flash', 'gemini-3.5-flash'].filter(
      (v, i, arr) => v && arr.indexOf(v) === i
    );
    return names.map((modelName) => ({ model: google(modelName), provider: 'google', modelName }));
  }
  if (process.env.OPENAI_API_KEY?.trim()) {
    const modelName = configured || 'gpt-4o-mini';
    return [{ model: openai(modelName), provider: 'openai', modelName }];
  }
  return [];
}
