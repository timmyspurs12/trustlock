import type { AgLlmAdapter, AgLlmRequest, AgLlmResponse, AgLlmResponseHandler } from 'ag-studio';

/**
 * Minimal AG Studio LLM adapter backed by TrustLock's server-side Gemini
 * proxy (/api/studio-ai). One executeTurn = one Gemini generateContent call.
 *
 * The Studio harness drives the tool loop (it executes Studio's tools and
 * feeds results back); this adapter only translates between the Studio
 * protocol and Gemini — conversation mapping, tool declarations, and the
 * streamed event shapes (TEXT_MESSAGE_* / TOOL_CALL_*).
 */

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: { content: string } };
}
interface GeminiContent {
  role: string;
  parts: GeminiPart[];
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) => part?.text ?? part?.content ?? '')
      .join('');
  }
  if (content && typeof content === 'object') {
    const c = content as any;
    if (typeof c.text === 'string') return c.text;
    if (Array.isArray(c.parts)) return c.parts.map((p: any) => p?.text ?? '').join('');
  }
  return '';
}

function toGeminiContents(input: unknown): { contents: GeminiContent[]; systemText: string } {
  const contents: GeminiContent[] = [];
  let systemText = '';
  const toolNameByCallId = new Map<string, string>();

  for (const item of (input as any[]) ?? []) {
    if (!item || typeof item !== 'object') continue;
    const anyItem = item as any;

    if (anyItem.type === 'message' && anyItem.kind === 'input') {
      const text = extractText(anyItem.content);
      if (!text) continue;
      if (anyItem.role === 'system') {
        systemText += (systemText ? '\n' : '') + text;
        continue;
      }
      contents.push({ role: 'user', parts: [{ text }] });
    } else if (anyItem.type === 'message' && anyItem.kind === 'output') {
      const text = extractText(anyItem.content);
      if (text) contents.push({ role: 'model', parts: [{ text }] });
    } else if (anyItem.type === 'function_call' && anyItem.kind === 'output') {
      const callId = anyItem.callId ?? anyItem.id;
      if (anyItem.name) toolNameByCallId.set(callId, anyItem.name);
      contents.push({
        role: 'model',
        parts: [{ functionCall: { name: anyItem.name, args: anyItem.arguments ?? {} } }],
      });
    } else if (anyItem.type === 'function_call_output') {
      const name = toolNameByCallId.get(anyItem.callId) ?? 'unknown';
      contents.push({
        role: 'function',
        parts: [{ functionResponse: { name, response: { content: String(anyItem.output ?? '') } } }],
      });
    }
  }
  return { contents, systemText };
}

/** Create the adapter (call once, reuse the instance). */
export function createStudioGeminiAdapter(): AgLlmAdapter {
  return {
    executeTurn(request: AgLlmRequest, options?: { signal?: AbortSignal }): AgLlmResponseHandler {
      const events: any[] = [];

      const complete = (async (): Promise<AgLlmResponse> => {
        const { contents, systemText } = toGeminiContents((request as any).input ?? []);
        const instructions =
          [(request as any).instructions, systemText].filter(Boolean).join('\n\n') || undefined;
        const tools =
          Array.isArray((request as any).tools) && (request as any).tools.length > 0
            ? (request as any).tools.map((t: any) => ({
                name: t.name,
                description: t.description ?? '',
                parameters: t.parameters ?? { type: 'object', properties: {} },
              }))
            : undefined;

        const res = await fetch('/api/studio-ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents, tools, instructions }),
          signal: options?.signal,
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error ?? `Studio AI proxy HTTP ${res.status}`);
        }

        const parts: GeminiPart[] = json?.candidates?.[0]?.content?.parts ?? [];
        let text = '';
        const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
        for (const part of parts) {
          if (part.text) text += part.text;
          if (part.functionCall) {
            toolCalls.push({ name: part.functionCall.name, args: part.functionCall.args ?? {} });
          }
        }

        const messageId = `msg-${Date.now()}`;
        if (text) {
          events.push({ type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' });
          events.push({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta: text });
          events.push({ type: 'TEXT_MESSAGE_END', messageId });
        }
        toolCalls.forEach((call, i) => {
          const toolCallId = `call-${Date.now()}-${i}`;
          events.push({ type: 'TOOL_CALL_START', toolCallId, toolCallName: call.name });
          events.push({ type: 'TOOL_CALL_ARGS', toolCallId, delta: JSON.stringify(call.args) });
          events.push({ type: 'TOOL_CALL_END', toolCallId });
        });

        const output: any[] = [];
        if (text) {
          output.push({
            kind: 'output',
            type: 'message',
            id: messageId,
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'text', text }],
          });
        }
        toolCalls.forEach((call, i) => {
          output.push({
            kind: 'output',
            type: 'function_call',
            id: `call-${Date.now()}-${i}`,
            name: call.name,
            arguments: call.args,
          });
        });

        return { id: `resp-${Date.now()}`, createdAt: Date.now(), output } as AgLlmResponse;
      })();

      return {
        stream: {
          async *[Symbol.asyncIterator]() {
            await complete;
            for (const event of events) yield event;
          },
        },
        complete,
      };
    },
  };
}
