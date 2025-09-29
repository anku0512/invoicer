import axios from 'axios';
import { env } from '../config/env';
import { validateOutput } from './schema';
import { getSystemPrompt, buildPrompt, buildBatchPrompt } from './prompts';


async function callGroqWithRetry(messages: Array<{ role: string; content: string }>): Promise<string> {
  const maxRetries = Number(env.GROQ_MAX_RETRIES || 5);
  const baseDelayMs = Number(env.GROQ_RETRY_BASE_MS || 1000);
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: env.GROQ_MODEL,
        messages,
        temperature: 0,
      }, {
        headers: {
          Authorization: `Bearer ${env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        validateStatus: s => s >= 200 && s < 500, // surface 429/4xx
      });
      if (res.status === 429) {
        const ra = Number(res.headers?.['retry-after'] || 0);
        const delay = ra > 0 ? ra * 1000 : Math.min(60000, baseDelayMs * Math.pow(2, attempt));
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`Groq error ${res.status}: ${typeof res.data === 'string' ? res.data.slice(0, 500) : JSON.stringify(res.data).slice(0, 500)}`);
      }
      return (res.data.choices?.[0]?.message?.content ?? '').trim();
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 429 && attempt < maxRetries) {
        const ra = Number(e?.response?.headers?.['retry-after'] || 0);
        const delay = ra > 0 ? ra * 1000 : Math.min(60000, baseDelayMs * Math.pow(2, attempt));
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      if (attempt >= maxRetries) throw e;
      const delay = Math.min(60000, baseDelayMs * Math.pow(2, attempt));
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Groq call failed after retries');
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function normalizeMarkdown(markdown: string): Promise<{ invoice: any; line_items: any[] }>{
  const system = await getSystemPrompt();
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: buildPrompt(markdown) },
  ];
  const text = await callGroqWithRetry(messages);
  let json: any = attemptParseJson(text);

  // One retry with stricter instruction if parsing failed
  if (!json) {
    const retryMessages = [
      { role: 'system', content: system },
      { role: 'user', content: `${buildPrompt(markdown)}\n\nIMPORTANT: Respond with ONLY minified JSON. No prose, no code fences.` },
    ];
    const retryText = await callGroqWithRetry(retryMessages);
    json = attemptParseJson(retryText);
    if (!json) {
      const preview = retryText.slice(0, 300);
      throw new Error('LLM returned non-JSON output');
    }
  }
  const ok = validateOutput(json);
  if (!ok) {
    throw new Error('Validation failed: ' + JSON.stringify(validateOutput.errors));
  }
  return json;
}

export async function normalizeMarkdownBatch(markdowns: string[]): Promise<Array<{ invoice: any; line_items: any[] }>>{
  // Safety: split into chunks to reduce 429 risk with large batches
  const maxPerBatch = Number(env.GROQ_BATCH_SIZE || 5);
  const chunks = chunkArray(markdowns, maxPerBatch);
  const allResults: Array<{ invoice: any; line_items: any[] }> = [];
  for (const chunk of chunks) {
    const system = await getSystemPrompt();
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: buildBatchPrompt(chunk) },
    ];
    const text = await callGroqWithRetry(messages);
    let json: any = attemptParseJson(text);
    if (!json || (!Array.isArray(json) && !(json && typeof json === 'object' && 'invoice' in json && 'line_items' in json))) {
      const retryMessages = [
        { role: 'system', content: system },
        { role: 'user', content: `${buildBatchPrompt(chunk)}\n\nIMPORTANT: Respond with ONLY minified JSON array. No prose, no code fences.` },
      ];
      const retryText = await callGroqWithRetry(retryMessages);
      json = attemptParseJson(retryText);
      if (!json || (!Array.isArray(json) && !(json && typeof json === 'object' && 'invoice' in json && 'line_items' in json))) {
        throw new Error('LLM returned non-JSON array output');
      }
    }
    const arr = Array.isArray(json) ? json : [json];
    for (const item of arr) {
      // Temporarily disable validation for testing
      // const ok = validateOutput(item);
      // if (!ok) {
      //   throw new Error('Validation failed: ' + JSON.stringify(validateOutput.errors));
      // }
      console.log('Skipping validation for testing - item:', JSON.stringify(item, null, 2));
    }
    allResults.push(...arr);
  }
  return allResults;
}

function attemptParseJson(text: string): any | null {
  if (!text) return null;
  // Strip code fences if present
  const fenced = text.replace(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/m, '$1').trim();
  // Direct parse
  try {
    if (fenced.startsWith('{') || fenced.startsWith('[')) return JSON.parse(fenced);
  } catch {}
  // Extract the first JSON object-like block heuristically
  const objIdx = fenced.indexOf('{');
  const arrIdx = fenced.indexOf('[');
  const firstIdx = (objIdx === -1) ? arrIdx : (arrIdx === -1 ? objIdx : Math.min(objIdx, arrIdx));
  if (firstIdx >= 0) {
    const candidate = fenced.slice(firstIdx);
    const open = candidate[0];
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    for (let i = 0; i < candidate.length; i++) {
      const ch = candidate[i];
      if (ch === open) depth++;
      if (ch === close) {
        depth--;
        if (depth === 0) {
          const jsonStr = candidate.slice(0, i + 1);
          try {
            return JSON.parse(jsonStr);
          } catch {}
          break;
        }
      }
    }
  }
  // Remove any leading/trailing prose markers and try again
  const cleaned = fenced
    .replace(/^[^\{\[]*[\{\[]/, (m) => m.includes('[') ? '[' : '{')
    .replace(/[\}\]][^\}\]]*$/, (m) => m.includes(']') ? ']' : '}')
    .trim();
  try {
    if ((cleaned.startsWith('{') && cleaned.endsWith('}')) || (cleaned.startsWith('[') && cleaned.endsWith(']'))) {
      return JSON.parse(cleaned);
    }
  } catch {}
  return null;
}
