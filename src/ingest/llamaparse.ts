import axios from 'axios';
import FormData from 'form-data';
import { env } from '../config/env';

export async function uploadToLlamaParse(fileBuffer: Buffer, fileName: string): Promise<{ id: string }>{
  const form = new FormData();
  form.append('file', fileBuffer, { filename: fileName });
  console.log(`Uploading to LlamaParse: ${fileName} (${fileBuffer.length} bytes)`);
  const res = await axios.post(`${env.LLAMAPARSE_BASE_URL}/api/v1/parsing/upload`, form, {
    headers: {
      Authorization: `Bearer ${env.LLAMAPARSE_API_KEY}`,
      accept: 'application/json',
      ...form.getHeaders(),
    },
    maxBodyLength: Infinity,
  });
  console.log(`LlamaParse upload successful, job ID: ${res.data.id}`);
  return res.data;
}

export async function pollJob(id: string): Promise<'SUCCESS'|'PENDING'|'ERROR'> {
  const url = `${env.LLAMAPARSE_BASE_URL}/api/v1/parsing/job/${id}`;
  const res = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${env.LLAMAPARSE_API_KEY}`,
      accept: 'application/json',
    },
  });
  return res.data.status as any;
}

export async function getMarkdown(id: string): Promise<string> {
  const base = (env.LLAMAPARSE_BASE_URL || '').trim(); // must be https://api.cloud.llamaindex.ai to match your curl
  const key  = (env.LLAMAPARSE_API_KEY   || '').trim();
  const proj = (env.LLAMAPARSE_PROJECT_ID || '').trim();

  console.log('[getMarkdown] LIVE base=', JSON.stringify(base), 'proj=', JSON.stringify(proj), 'keyPrefix=', key.slice(0,8));


  // 1) First hop: EXACTLY like curl (same host, same headers)
  const url = `${base}/api/v1/parsing/job/${id}/result/markdown`;
  const res = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${key}`,
      'X-Project-ID': proj,          // include because your curl did
      Accept: 'text/markdown',
    },
    responseType: 'text',
    proxy: false,                    // avoid proxies stripping Authorization
    maxRedirects: 0,                 // let us handle any redirect manually
    validateStatus: s => (s >= 200 && s < 300) || s === 302 || s === 303 || s === 307,
  });

  console.log('[getMarkdown] first-hop status=', res.status, 'location=', res.headers?.location);


  // 2) If 200 OK, return body
  if (res.status >= 200 && res.status < 300) {
    return typeof res.data === 'string' ? res.data : String(res.data ?? '');
  }

  // 3) If it’s a redirect, follow Location WITHOUT auth (presigned)
  if ((res.status === 302 || res.status === 303 || res.status === 307) && res.headers?.location) {
    const follow = await axios.get(res.headers.location, {
      headers: { Accept: 'text/markdown' }, // no auth on presigned URL
      responseType: 'text',
      proxy: false,
      validateStatus: s => s >= 200 && s < 400,
    });
    return typeof follow.data === 'string' ? follow.data : String(follow.data ?? '');
  }

  // 4) Otherwise, throw with context
  const ct = res.headers?.['content-type'] || '';
  const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  throw new Error(`Result fetch failed: ${res.status} ${ct} ${body?.slice(0, 500)}`);
}