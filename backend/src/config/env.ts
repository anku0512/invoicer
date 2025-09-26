import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  // Firebase Admin Configuration
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  
  // Google OAuth Configuration
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  
  // Original invoicer configuration (for fallback)
  GOOGLE_CLIENT_EMAIL: z.string().optional(),
  GOOGLE_PRIVATE_KEY: z.string().optional(),
  SOURCE_SHEET_ID: z.string().optional(),
  SOURCE_SHEET_TAB: z.string().optional(),
  SOURCE_LINK_COLUMN: z.string().default('Invoices'),
  TARGET_SHEET_ID: z.string().optional(),
  TARGET_INVOICES_TAB: z.string().default('Invoices'),
  TARGET_LINE_ITEMS_TAB: z.string().default('Invoice Line Items'),

  LLAMAPARSE_BASE_URL: z.string().url().default('https://api.cloud.llamaindex.ai'),
  LLAMAPARSE_API_KEY: z.string().transform(s => s.trim()),
  LLAMAPARSE_PROJECT_ID: z.string().transform(s => s.trim()),

  GROQ_API_KEY: z.string().transform(s => s.trim()),
  GROQ_MODEL: z.string().default('openai/gpt-oss-20b'),
  GROQ_MAX_RETRIES: z.coerce.number().default(5),
  GROQ_RETRY_BASE_MS: z.coerce.number().default(1000),
  GROQ_BATCH_SIZE: z.coerce.number().default(5),

  POLL_CRON: z.string().default('*/1 * * * *'),
  BATCH_SIZE: z.coerce.number().default(1),
  POLL_INTERVAL_MS: z.coerce.number().default(2000),
  TMP_DIR: z.string().default('/tmp/invoicer'),
  LOG_LEVEL: z.string().default('info'),
});

export const env = EnvSchema.parse(process.env);