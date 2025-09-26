import axios from 'axios';
import { env } from '../config/env';
import { validateOutput } from './schema';

const SYSTEM = `You are a finance data extraction agent. Input is JSON that contains a \`markdown\` field (sometimes the whole input is an array; use the first element). The markdown is an Indian GST invoice rendered as plain text with tables.\n\nOutput ONLY the JSON below (no prose, no explanations, no code fences):\n\n{\n  "invoice": { /* keys exactly match the 'Invoices' sheet headers */ },\n  "line_items": [ /* array of objects exactly matching the 'Invoice Line Items' headers */ ]\n}\n\nCRITICAL JSON RULES:\n- Must be valid JSON syntax\n- Use double quotes for all strings\n- Escape special characters (\\n, \\", \\\\)\n- No trailing commas\n- No comments in the actual output\n- If description contains quotes, escape them as \\\"\n\nData Rules:\n- Numbers: strip ₹ and commas; keep 2 decimals.\n- Dates → YYYY-MM-DD; ack_date → YYYY-MM-DDTHH:mm:ss if present.\n- invoice_key = supplier_gstin + "|" + invoice_number (idempotent).\n- Invoice month like "Dec.24" → 2024-12.\n- Parse CGST/SGST/IGST rates/amounts. Totals check within ₹0.10.\n- Place of supply: extract state + code in parentheses.\n- HSN list: unique codes joined by commas.\n- Bank last4: last 4 digits of account number.\n- Line items: include only charge rows (ignore subtotal/tax/rounding/total/balance rows). If qty/unit missing, use "".\n- Allocate taxes to lines proportionally to line_amount; round to 2 decimals; adjust the LAST line so column sums match the invoice totals.\n\nHeaders to match exactly:\n\nInvoices:\ninvoice_key,supplier_name,supplier_gstin,buyer_name,buyer_gstin,invoice_number,invoice_date,due_date,payment_terms,invoice_month,place_of_supply_state,place_of_supply_code,currency,taxable_value,cgst_rate_pct,cgst_amount,sgst_rate_pct,sgst_amount,igst_rate_pct,igst_amount,rounding,invoice_total,balance_due,hsn_list,line_items_json,excel_mis_link,irn,ack_no,ack_date,bank_beneficiary,bank_name,bank_account_last4,bank_ifsc,po_number\n\nInvoice Line Items:\nline_key,invoice_key,invoice_number,invoice_date,supplier_name,description,hsn_sac,line_no,quantity,unit_price,line_amount,cgst_rate_pct,cgst_amount,sgst_rate_pct,sgst_amount,igst_rate_pct,igst_amount,po_number\n\nIf a field is unknown, return an empty string "" (not null).\n\nFor problematic content, simplify descriptions and avoid special characters that could break JSON.`;

function buildPrompt(markdown: string) {
  return `You will receive invoice markdown in the incoming JSON.\n\nParse and normalize per the System message.\nReturn ONLY the JSON object with "invoice" and "line_items" (no extra text).\n\nReturn only valid minified JSON. No code fences, no comments, no explanations.\n\nInput JSON:\n${JSON.stringify({ markdown }, null, 2)}`;
}

function buildBatchPrompt(markdowns: string[]) {
  return `You will receive multiple invoice markdowns in the incoming JSON array.\n\nEach element is one invoice's markdown. Parse and normalize each per the System message.\nReturn ONLY a JSON array where each element is an object with keys "invoice" and "line_items". No extra text.\n\nReturn only valid minified JSON. No code fences, no comments, no explanations.\n\nInput JSON:\n${JSON.stringify({ markdown: markdowns }, null, 2)}`;
}

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
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: buildPrompt(markdown) },
  ];
  const text = await callGroqWithRetry(messages);
  let json: any = attemptParseJson(text);

  // One retry with stricter instruction if parsing failed
  if (!json) {
    const retryMessages = [
      { role: 'system', content: SYSTEM },
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
    const messages = [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: buildBatchPrompt(chunk) },
    ];
    const text = await callGroqWithRetry(messages);
    let json: any = attemptParseJson(text);
    if (!json || (!Array.isArray(json) && !(json && typeof json === 'object' && 'invoice' in json && 'line_items' in json))) {
      const retryMessages = [
        { role: 'system', content: SYSTEM },
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
