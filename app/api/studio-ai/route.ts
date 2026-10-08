import { NextResponse } from 'next/server';

/**
 * POST /api/studio-ai
 *
 * Server-side proxy for the AG Studio AI assistant (Gemini). Keeps
 * GOOGLE_GENERATIVE_AI_API_KEY off the client — the Studio adapter running in
 * the browser only ever calls this route.
 *
 * Body: { contents: GeminiContent[], tools?: [{name, description, parameters}], instructions?: string }
 * Returns the raw Gemini generateContent response.
 */
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GOOGLE_GENERATIVE_AI_API_KEY is not configured' },
        { status: 503 }
      );
    }
    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.contents)) {
      return NextResponse.json({ error: 'Invalid request: contents array required' }, { status: 400 });
    }

    const model = (body.model || process.env.AI_MODEL || 'gemini-3.5-flash').trim();
    const geminiBody: Record<string, unknown> = { contents: body.contents };
    if (Array.isArray(body.tools) && body.tools.length > 0) {
      geminiBody.tools = [{ functionDeclarations: body.tools }];
    }
    if (typeof body.instructions === 'string' && body.instructions.trim()) {
      geminiBody.systemInstruction = { parts: [{ text: body.instructions }] };
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      }
    );
    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: json?.error?.message ?? `Gemini HTTP ${res.status}` },
        { status: res.status }
      );
    }
    return NextResponse.json(json);
  } catch (err) {
    console.error('[api] POST /api/studio-ai failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
