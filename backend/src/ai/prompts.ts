import fs from 'fs/promises';
import path from 'path';
import { env } from '../config/env';
export const SYSTEM = `You are a finance data extraction agent. Input is JSON that contains a \`markdown\` field (sometimes the whole input is an array; use the first element). The markdown is an Indian GST invoice rendered as plain text with tables.\n\nOutput ONLY the JSON below (no prose, no explanations, no code fences):\n\n{\n  "invoice": { /* keys exactly match the 'Invoices' sheet headers */ },\n  "line_items": [ /* array of objects exactly matching the 'Invoice Line Items' headers */ ]\n}\n\nCRITICAL JSON RULES:\n- Must be valid JSON syntax\n- Use double quotes for all strings\n- Escape special characters (\\n, \\", \\\\)\n- No trailing commas\n- No comments in the actual output\n- If description contains quotes, escape them as \\\"\n\nData Rules:\n- Numbers: strip ₹ and commas; keep 2 decimals.\n- Dates → YYYY-MM-DD; ack_date → YYYY-MM-DDTHH:mm:ss if present.\n- invoice_key = supplier_gstin + "|" + invoice_number (idempotent).\n- Invoice month like "Dec.24" → 2024-12.\n- Parse CGST/SGST/IGST rates/amounts. Totals check within ₹0.10.\n- Place of supply: extract state + code in parentheses.\n- HSN list: unique codes joined by commas.\n- Bank last4: last 4 digits of account number.\n- Line items: include only charge rows (ignore subtotal/tax/rounding/total/balance rows). If qty/unit missing, use "".\n- Allocate taxes to lines proportionally to line_amount; round to 2 decimals; adjust the LAST line so column sums match the invoice totals.\n\nHeaders to match exactly:\n\nInvoices:\ninvoice_key,supplier_name,supplier_gstin,buyer_name,buyer_gstin,invoice_number,invoice_date,due_date,payment_terms,invoice_month,place_of_supply_state,place_of_supply_code,currency,taxable_value,cgst_rate_pct,cgst_amount,sgst_rate_pct,sgst_amount,igst_rate_pct,igst_amount,rounding,invoice_total,balance_due,hsn_list,line_items_json,excel_mis_link,irn,ack_no,ack_date,bank_beneficiary,bank_name,bank_account_last4,bank_ifsc,po_number\n\nInvoice Line Items:\nline_key,invoice_key,invoice_number,invoice_date,supplier_name,description,hsn_sac,line_no,quantity,unit_price,line_amount,cgst_rate_pct,cgst_amount,sgst_rate_pct,sgst_amount,igst_rate_pct,igst_amount,po_number\n\nIf a field is unknown, return an empty string "" (not null).\n\nFor problematic content, simplify descriptions and avoid special characters that could break JSON.`;

export function buildPrompt(markdown: string): string {
  return `You will receive invoice markdown in the incoming JSON.\n\nParse and normalize per the System message.\nReturn ONLY the JSON object with "invoice" and "line_items" (no extra text).\n\nReturn only valid minified JSON. No code fences, no comments, no explanations.\n\nInput JSON:\n${JSON.stringify({ markdown }, null, 2)}`;
}

export function buildBatchPrompt(markdowns: string[]): string {
  return `You will receive multiple invoice markdowns in the incoming JSON array.\n\nEach element is one invoice's markdown. Parse and normalize each per the System message.\nReturn ONLY a JSON array where each element is an object with keys "invoice" and "line_items". No extra text.\n\nReturn only valid minified JSON. No code fences, no comments, no explanations.\n\nInput JSON:\n${JSON.stringify({ markdown: markdowns }, null, 2)}`;
}

let cachedSystemPrompt: string | null = null;
let cachedSystemPromptPath: string | null = null;
let cachedSystemPromptMtimeMs: number | null = null;

function candidatePromptPaths(): string[] {
  const candidates: string[] = [];
  const overridePath = process.env.SYSTEM_PROMPT_PATH;
  if (overridePath && overridePath.trim()) {
    candidates.push(path.resolve(overridePath));
  }
  // Co-located with compiled JS
  candidates.push(path.resolve(__dirname, 'PROMPT_SYSTEM.md'));
  // Common project roots during dev and prod
  candidates.push(path.resolve(process.cwd(), 'backend/src/ai/PROMPT_SYSTEM.md'));
  candidates.push(path.resolve(process.cwd(), 'backend/dist/ai/PROMPT_SYSTEM.md'));
  candidates.push(path.resolve(process.cwd(), 'src/ai/PROMPT_SYSTEM.md'));
  candidates.push(path.resolve(process.cwd(), 'dist/ai/PROMPT_SYSTEM.md'));
  return candidates;
}

export async function getSystemPrompt(): Promise<string> {
  // Try cached if file unchanged
  if (cachedSystemPrompt && cachedSystemPromptPath && cachedSystemPromptMtimeMs !== null) {
    try {
      const stat = await fs.stat(cachedSystemPromptPath);
      if (stat.mtimeMs === cachedSystemPromptMtimeMs) return cachedSystemPrompt;
    } catch {}
  }
  // Probe candidates
  for (const p of candidatePromptPaths()) {
    try {
      const stat = await fs.stat(p);
      if (!stat.isFile()) continue;
      const content = await fs.readFile(p, 'utf8');
      cachedSystemPrompt = content.trim();
      cachedSystemPromptPath = p;
      cachedSystemPromptMtimeMs = stat.mtimeMs;
      return cachedSystemPrompt;
    } catch {}
  }
  // Fallback: use in-code SYSTEM constant
  cachedSystemPrompt = SYSTEM;
  cachedSystemPromptPath = null;
  cachedSystemPromptMtimeMs = null;
  return SYSTEM;
}
