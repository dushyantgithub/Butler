import { z } from 'zod';
import { lookup } from 'node:dns/promises';
import { BlockList } from 'node:net';
import { get } from 'node:https';
import * as cheerio from 'cheerio';

export function publicWebsite(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) ||
    /\.(localhost|local|internal|test|invalid)$/i.test(url.hostname)
  )
    throw new Error('Use a public HTTPS website without credentials.');
  return url.href;
}
const web = z
  .string()
  .max(1200)
  .refine((v) => {
    try {
      publicWebsite(v);
      return true;
    } catch {
      return false;
    }
  }, 'Use a public HTTPS URL.');
export const projectSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    website: z.union([z.literal(''), web]).default(''),
    company: z.string().max(2000).default(''),
    products: z.string().max(4000).default(''),
    audience: z.string().max(1500).default(''),
    voice: z.string().max(1500).default(''),
    goals: z.string().max(2000).default(''),
    facts: z.string().max(6000).default(''),
    restrictions: z.string().max(2000).default(''),
    sources: z.array(web).max(8).default([]),
  })
  .strict();
const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
])
  blocked.addSubnet(address, prefix);
export async function readProjectSource(value, redirects = 0, dependencies = {}) {
  const url = new URL(publicWebsite(value));
  const addresses = await (dependencies.lookup || lookup)(url.hostname, { family: 4, all: true });
  if (!addresses.length || addresses.some(({ address }) => blocked.check(address)))
    throw new Error('Private network destinations are blocked.');
  const response = await new Promise((resolve, reject) => {
    // Pin the checked address, preserving the hostname for TLS verification.
    const request = (dependencies.get || get)(
      url,
      {
        lookup: (_host, options, cb) =>
          options?.all ? cb(null, [addresses[0]]) : cb(null, addresses[0].address, 4),
        headers: { 'User-Agent': 'ButlerLocal/1.0', Accept: 'text/html,text/plain' },
      },
      resolve,
    );
    request.setTimeout(18000, () => request.destroy(new Error('Source request timed out.')));
    request.on('error', reject);
  });
  if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
    response.resume();
    if (redirects >= 3 || !response.headers.location)
      throw new Error('Source redirected too many times.');
    return readProjectSource(
      new URL(response.headers.location, url).href,
      redirects + 1,
      dependencies,
    );
  }
  if (
    response.statusCode !== 200 ||
    !/text\/(html|plain)/i.test(response.headers['content-type'] || '')
  ) {
    response.resume();
    throw new Error(`Source did not return a readable page (HTTP ${response.statusCode}).`);
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of response) {
    size += chunk.length;
    if (size > 1_000_000) {
      response.destroy();
      throw new Error('Source page is too large.');
    }
    chunks.push(chunk);
  }
  const $ = cheerio.load(Buffer.concat(chunks).toString('utf8'));
  $('script,style,nav,footer,header,noscript').remove();
  const text = ($('main,article').first().text() || $('body').text())
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6500);
  if (text.length < 60) throw new Error('Source contains too little readable text.');
  return {
    url: url.href,
    title: $('title').text().slice(0, 200),
    text,
    checkedAt: new Date().toISOString(),
  };
}
