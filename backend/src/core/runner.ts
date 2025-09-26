import { readSourceLinks, ensureHeaders, upsertInvoices, appendLineItems } from '../google/sheets';
import { REGEX } from '../config/constants';
import { downloadDriveFile } from '../google/drive';
import { prepareTmp, isZip, writeZipAndExtract } from '../ingest/fileHandler';
import { uploadToLlamaParse, pollJob, getMarkdown } from '../ingest/llamaparse';
import { normalizeMarkdown, normalizeMarkdownBatch } from '../ai/normalize';
import fs from 'fs-extra';
import path from 'path';
import { Accumulator } from './accumulator';

export async function runOnce() {
  await ensureHeaders();
  await prepareTmp();
  const links = await readSourceLinks();
  const acc = new Accumulator();

  for (const link of links) {
    const m = link.match(REGEX.driveFileId);
    if (!m) continue;
    const fileId = m[1];
    const { buffer, fileName } = await downloadDriveFile(fileId);

    const files: {fileName: string; buffer: Buffer;}[] = [];
    if (isZip(fileName)) {
      const { files: extracted } = await writeZipAndExtract(buffer);
      for (const f of extracted) {
        const b = await fs.readFile(f.filePath);
        files.push({ fileName: f.fileName, buffer: b });
      }
    } else {
      files.push({ fileName, buffer });
    }

    // Upload all files to LlamaParse and collect their markdowns
    const jobIds: string[] = [];
    for (const f of files) {
      const up = await uploadToLlamaParse(f.buffer, f.fileName);
      jobIds.push(up.id);
    }

    // Poll all jobs
    for (const id of jobIds) {
      let status: 'SUCCESS'|'PENDING'|'ERROR' = 'PENDING';
      for (let i = 0; i < 60; i++) {
        try {
          status = await pollJob(id);
          console.log(`LlamaParse job ${id} status: ${status}`);
        } catch (e: any) {
          console.error(`Error polling job ${id}:`, e?.message);
          throw e;
        }
        if (status === 'SUCCESS') break;
        if (status === 'ERROR') break;
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // Small delay, then fetch markdown for successful jobs
    await new Promise(r => setTimeout(r, 1500));
    const markdowns: string[] = [];
    for (const id of jobIds) {
      try {
        const md = await getMarkdown(id);
        markdowns.push(md);
      } catch (e: any) {
        const statusCode = e?.response?.status;
        const body = e?.response?.data;
        console.error(`Failed to fetch result for job ${id}:`, e?.message, statusCode, body);
        // skip this one, continue with others
      }
    }

    if (markdowns.length === 0) continue;

    // Single Groq call for all markdowns
    const results = await normalizeMarkdownBatch(markdowns);
    for (const r of results) {
      const inv = toStringRecord(r.invoice);
      const lines = r.line_items.map(toStringRecord);
      acc.addInvoice(inv);
      acc.addLines(lines);
    }
  }

  if (acc.invoices.length || acc.lines.length) {
    await upsertInvoices(acc.invoices);
    await appendLineItems(acc.lines);
  }
}

function toStringRecord(obj: any): Record<string,string> {
  const out: Record<string,string> = {};
  for (const [k,v] of Object.entries(obj || {})) out[k] = v == null ? '' : String(v);
  return out;
}
