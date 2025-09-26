## Node.js Script — Technical Design (mirrors `My workflow 3` n8n)

### 1) Goal

Build a single Node.js service that replicates the n8n workflow: poll a Google Sheet of Drive links, download invoice files (zip or single), extract files, upload to LlamaParse, poll until complete, run AI normalization, then write rows to two target Google Sheets (Invoices, Invoice Line Items).

### 2) High-level Architecture

- Scheduler: cron-style poller (e.g., node-cron) runs every minute (configurable).
- Google Sheets client: read source links, upsert/append to destination sheets.
- Google Drive client: download files via fileId parsed from links.
- File handler: writes zip to tmp, cleans tmp, unzips, enumerates pdf/png/jpg/jpeg.
- LlamaParse client: upload document, poll job status, fetch markdown/result.
- AI extraction: prompt + LLM (Groq) to convert markdown to strict JSON.
- Accumulator: hold invoices and line items in-memory during run; flush once per batch.
- Logger + metrics: structured logs for each stage; simple counters.

### 3) Data Flow (maps to n8n nodes)

1. Poll Google Sheet ("PO invoice links") → read rows with `Invoices` URL column.
2. For each link:
   - Extract `fileId` using regex: `https://(drive|docs).google.com/.../d/<id>`.
   - Download binary from Drive.
   - If extension is `.zip`: write to `TMP_DIR/input.zip` → clean `TMP_DIR/unzipped` → unzip → read files matching `**/*.{pdf,png,jpg,jpeg}`.
   - If not zip: treat downloaded binary as a single input file.
3. For each input file:
   - Build multipart request and `POST` to LlamaParse `/api/v1/parsing/upload` with header auth.
   - Poll `/api/v1/parsing/job/{id}` until `SUCCESS` (backoff between polls).
   - On success, `GET` `/api/v1/parsing/job/{id}/result/markdown`.
4. Run AI normalization:
   - Prompt LLM (Groq) with system+user messages that enforce strict schema and rules (numbers, dates, taxes, invoice_key, etc.).
   - Validate JSON shape against a schema (Ajv) equivalent to the n8n Structured Output Parser.
   - Split into `invoice` (single object) and `line_items` (array of objects).
   - Accumulate into in-memory arrays.
5. After batch (or after all links):
   - Upsert `Invoices` rows by `invoice_key` (supplier_gstin + '|' + invoice_number).
   - Append `Invoice Line Items` rows.
   - Clear accumulators.

### 4) Environment Variables (see .env.example)

- Google auth (Service Account recommended):
  - `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`
- Source sheet of links:
  - `SOURCE_SHEET_ID`, `SOURCE_SHEET_TAB` (name or gid), `SOURCE_LINK_COLUMN`
- Destination sheets:
  - `TARGET_SHEET_ID`
  - `TARGET_INVOICES_TAB`, `TARGET_LINE_ITEMS_TAB`
- LlamaParse:
  - `LLAMAPARSE_BASE_URL`, `LLAMAPARSE_API_KEY`, `LLAMAPARSE_PROJECT_ID`
- LLM for normalization (Groq):
  - `GROQ_API_KEY`, `GROQ_MODEL`
- Runtime:
  - `POLL_CRON`, `BATCH_SIZE`, `POLL_INTERVAL_MS`, `TMP_DIR`, `LOG_LEVEL`

### 5) Dependencies

- google APIs: `googleapis`
- HTTP: `axios` or `undici`
- Auth: built into `googleapis` (JWT for service account)
- File ops: `fs-extra`, `glob`, `unzipper` (or `yauzl`)
- Scheduling: `node-cron`
- Validation: `ajv`
- Env: `dotenv`, `zod` (for config)
- Logging: `pino` (optional)

### 6) Directory Structure

```
src/
  config/
    env.ts            # parse/validate env
    constants.ts      # derived constants
  google/
    sheets.ts         # read links, write destination
    drive.ts          # download by fileId
  ingest/
    fileHandler.ts    # zip/unzip/list binaries
    llamaparse.ts     # upload/poll/get markdown
  ai/
    normalize.ts      # LLM call + schema validation
    schema.ts         # Ajv JSON schemas
  core/
    accumulator.ts    # collect invoices/lines
    scheduler.ts      # cron runner
    runner.ts         # orchestrate one cycle
index.ts              # bootstrap service
```

### 7) Schemas (mirror n8n Structured Output Parser)

- Invoice required: `invoice_key`, `supplier_name`, `supplier_gstin`, `buyer_name`, `buyer_gstin`, `invoice_number`, `invoice_date`, `invoice_total`.
- Line item required: `invoice_key`, `invoice_number`, `description`, `line_no`, `line_amount`.
- Use Ajv to validate; coerce types as strings where specified.

### 8) Key Logic Details

- `invoice_key = supplier_gstin + '|' + invoice_number`.
- Numbers: strip currency symbols and commas; keep 2 decimals.
- Dates: `YYYY-MM-DD`; `ack_date` if timestamp → `YYYY-MM-DDTHH:mm:ss`.
- Taxes: CGST/SGST/IGST rates and amounts; allocate to lines proportionally; fix rounding on last line so column sums match totals (±0.10 INR tolerance).
- HSN list: unique codes joined by commas.
- Bank last4: last 4 digits of account number.
- Ignore non-charge rows when producing line items.

### 9) Error Handling & Retries

- Drive download: retry with exponential backoff on 5xx/429; log 4xx as permanent.
- Unzip: guard against corrupt archives; skip unreadable entries.
- LlamaParse: backoff poll; fail a file after timeout; continue others.
- LLM normalization: retry once with a shorter prompt if JSON invalid; log raw markdown snippet for audit.
- Sheets write: batch writes; if a row fails, collect to a dead-letter JSON file in `TMP_DIR`.

### 10) Security & Access

- Prefer Google Service Account. Share the source and target sheets, and the Drive folders/files with the service account email.
- Do not log full PII; mask GSTIN except last 4 when logging.
- Store secrets only in `.env`; never commit.

### 11) Observability

- Per-file trace id; log lifecycle: queued → downloaded → uploaded → parsed → normalized → written.
- Counters: files processed, successes, failures, rows upserted/appended.

### 12) Constants Module (example)

```ts
// src/config/constants.ts
import { z } from "zod";

const Env = z.object({
  GOOGLE_CLIENT_EMAIL: z.string(),
  GOOGLE_PRIVATE_KEY: z.string(),
  SOURCE_SHEET_ID: z.string(),
  SOURCE_SHEET_TAB: z.string(),
  SOURCE_LINK_COLUMN: z.string().default("Invoices"),
  TARGET_SHEET_ID: z.string(),
  TARGET_INVOICES_TAB: z.string().default("Invoices"),
  TARGET_LINE_ITEMS_TAB: z.string().default("Invoice Line Items"),
  LLAMAPARSE_BASE_URL: z
    .string()
    .url()
    .default("https://api.cloud.llamaindex.ai"),
  LLAMAPARSE_API_KEY: z.string(),
  LLAMAPARSE_PROJECT_ID: z.string(),
  GROQ_API_KEY: z.string(),
  GROQ_MODEL: z.string().default("openai/gpt-oss-20b"),
  POLL_CRON: z.string().default("*/1 * * * *"),
  BATCH_SIZE: z.coerce.number().default(1),
  POLL_INTERVAL_MS: z.coerce.number().default(2000),
  TMP_DIR: z.string().default("/tmp/invoicer"),
  LOG_LEVEL: z.string().default("info"),
});

export const env = Env.parse(process.env);

export const REGEX = {
  driveFileId:
    /https:\/\/(?:drive|docs)\.google\.com(?:\/.*|)\/d\/([0-9a-zA-Z\-_]+)(?:\/.*|)/,
};

export const SHEETS = {
  source: {
    id: env.SOURCE_SHEET_ID,
    tab: env.SOURCE_SHEET_TAB,
    linkColumn: env.SOURCE_LINK_COLUMN,
  },
  target: {
    id: env.TARGET_SHEET_ID,
    invoicesTab: env.TARGET_INVOICES_TAB,
    linesTab: env.TARGET_LINE_ITEMS_TAB,
  },
};
```

### 13) Runbook

1. Create a Google Cloud project; create a Service Account; grant it Drive and Sheets API scopes; download JSON key.
2. Enable Drive API and Sheets API.
3. Share the source and target spreadsheets and the Drive folder/files with the service account email.
4. Copy `.env.example` → `.env` and fill values.
5. `npm i` deps; `npm start` (or `node dist/index.js`).
6. Verify logs; check target sheets for rows.
