## How the Invoice Automation Works

This small app checks a Google Sheet for links to your invoice files on Google Drive. It then reads those files (even inside zip folders), sends them to a trusted service to turn them into clean text, understands that text, and finally fills two Google Sheets with tidy, consistent data.

### What you need to provide

- A Google Sheet with links to your invoices (PDFs or images). This is the “source” sheet.
- Access to the Google account (service account) that can read that source sheet and those Drive files, and write to your “target” sheet.
- An API key for LlamaParse (the service that converts invoices to text) and a Groq API key (the AI that formats the data).

### What it does step by step

1. Looks at your source Google Sheet every minute for new or updated links.
2. Downloads each linked file from Google Drive. If the link is a zip file, it opens it and reads all the PDFs/images inside.
3. Sends each file to LlamaParse, which turns it into plain text that looks like the original invoice.
4. Uses AI to read that text and fill a standard template (same column names every time).
5. Saves the results into your target Google Sheet:
   - “Invoices” tab: one row per invoice.
   - “Invoice Line Items” tab: one row for each item on the invoice.

### Why two sheets?

- Invoices tab shows one summary row per invoice (totals, dates, GSTINs, etc.).
- Invoice Line Items tab lists each product/service line (descriptions, amounts, tax split).

### How it keeps data clean

- Dates are standardized (YYYY-MM-DD).
- Numbers have no currency symbols or commas and are rounded properly.
- Tax amounts (CGST/SGST/IGST) are split and added up so totals match.
- A unique key is used to avoid duplicates: supplier GSTIN + invoice number.

### What happens if something goes wrong?

- If a file can’t be read or the AI output isn’t valid, the app records the problem and moves on to the next file. You can retry later.

### What you need to set up (once)

1. Share your source sheet, target sheet, and Drive files with the service account email.
2. Put your sheet IDs, tab names, and API keys into a `.env` file (a simple settings file).
3. Start the app. It runs automatically and keeps filling your sheets.

That’s it. You keep dropping invoice links into your source sheet; the app does the heavy lifting and keeps your records up to date.

### What prompt we send to Groq (in plain English)

When the invoice text is ready, we ask the AI to return only a strict JSON structure with two parts:

- "invoice": one object matching the exact column names in the "Invoices" sheet
- "line_items": an array where each object matches the exact column names in the "Invoice Line Items" sheet

Key rules we instruct the AI to follow:

- Use valid JSON only (no comments, no code blocks, properly escaped characters)
- Dates are normalized (YYYY-MM-DD) and acknowledgment date can include time
- Numbers are cleaned (no ₹, no commas) and kept to 2 decimals
- Totals should match within a tiny tolerance
- Line items must include only charge rows (subtotals/tax/rounding/total rows are ignored)
- If a field is unknown, return an empty string
- Create a unique key per invoice (supplier GSTIN + invoice number)

We also support batch prompting: when a zip contains several invoices, we send a single request that includes all invoice texts together, and the AI returns an array of results—one per invoice.

Where to find it in the code:

- Prompt and batch request: `src/ai/normalize.ts` (look for `SYSTEM`, `buildPrompt`, `buildBatchPrompt`, `normalizeMarkdownBatch`)
- Output validation: `src/ai/schema.ts`

### What calculations/logic happen and where

- Tax allocation and totals: We ask the AI to compute CGST/SGST/IGST rates and amounts per line so the sums match invoice totals. This instruction is part of the prompt in `src/ai/normalize.ts`. We do not recalculate taxes in code; we validate the structure.
- Data normalization rules (dates, numbers, keys, ignoring subtotal/total rows): These are also enforced by the prompt in `src/ai/normalize.ts`.
- Schema validation (to prevent malformed output): Implemented via AJV in `src/ai/schema.ts`.
- Sheet column headers (what fields exist): Defined in `src/config/constants.ts` (`INVOICE_HEADERS`, `LINE_HEADERS`).
- Batch behavior for zip files: Implemented in `src/core/runner.ts` using `normalizeMarkdownBatch`.
- Rate-limit handling and batching knobs: Environment variables in `src/config/env.ts` (`GROQ_MAX_RETRIES`, `GROQ_RETRY_BASE_MS`, `GROQ_BATCH_SIZE`). Example values are listed in `ENV_EXAMPLE.txt`.
