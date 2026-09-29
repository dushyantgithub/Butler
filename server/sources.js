import { XMLParser } from 'fast-xml-parser';
import * as cheerio from 'cheerio';
import { marked } from 'marked';
import { ADDITIONAL_SOURCES } from './source-catalog.js';

export const SOURCES = [
  {
    id: 'openai',
    name: 'OpenAI',
    category: 'Research & releases',
    url: 'https://openai.com/news/rss.xml',
    hosts: ['openai.com'],
    color: '#355f50',
  },
  {
    id: 'google',
    name: 'Google AI',
    category: 'Products & research',
    url: 'https://blog.google/technology/ai/rss/',
    hosts: ['blog.google'],
    color: '#527aaa',
  },
  {
    id: 'deepmind',
    name: 'Google DeepMind',
    category: 'Frontier research',
    url: 'https://deepmind.google/blog/rss.xml',
    hosts: ['deepmind.google', 'blog.google'],
    color: '#7c6ca9',
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    category: 'Open source AI',
    url: 'https://huggingface.co/blog/feed.xml',
    hosts: ['huggingface.co'],
    color: '#b78836',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA',
    category: 'AI infrastructure',
    url: 'https://blogs.nvidia.com/feed/',
    hosts: ['blogs.nvidia.com'],
    color: '#779348',
  },
  ...ADDITIONAL_SOURCES,
];
const parser = new XMLParser({ ignoreAttributes: false, processEntities: false });
export const normalize = (text) =>
  String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
export function plain(html) {
  return normalize(cheerio.load(String(html || '')).text());
}
export function trustedUrl(input, source) {
  const u = new URL(input);
  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    (u.port && u.port !== '443') ||
    !source.hosts.includes(u.hostname)
  )
    throw new Error('Link leaves this publisher’s approved domain.');
  if (source.kind === 'github-release') {
    const path = decodeURIComponent(u.pathname).toLowerCase();
    const repo = source.repo.toLowerCase();
    const allowed =
      u.hostname === 'github.com'
        ? path === `/${repo}/releases.atom` || path.startsWith(`/${repo}/releases/tag/`)
        : u.hostname === 'api.github.com' && path.startsWith(`/repos/${repo}/releases/tags/`);
    if (!allowed || /[\\\0]/.test(path) || path.split('/').some((p) => p === '..' || p === '.'))
      throw new Error('Release link leaves this project’s approved repository.');
  }
  // Hugging Face hosts user/organization blogs as well as its own editorial
  // blog. A trusted hosting platform is not proof of a trusted author.
  if (
    source.id === 'huggingface' &&
    (!/^\/blog\/[a-zA-Z0-9][a-zA-Z0-9_.-]*\/?$/.test(decodeURIComponent(u.pathname)) ||
      /^\/blog\/community\/?$/.test(u.pathname))
  )
    throw new Error('Community-hosted articles are outside the approved publisher policy.');
  u.hash = '';
  for (const key of [...u.searchParams.keys()])
    if (/^(utm_|fbclid|gclid)/.test(key)) u.searchParams.delete(key);
  return u.toString();
}
export async function fetchText(url, source, fetcher = fetch) {
  let target = trustedUrl(url, source);
  for (let redirects = 0; redirects < 5; redirects++) {
    const response = await fetcher(target, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'ButlerLocal/1.0 (personal news reader)',
        Accept:
          new URL(target).hostname === 'api.github.com'
            ? 'application/vnd.github+json'
            : 'application/rss+xml, application/atom+xml, text/html, application/xml, text/xml',
      },
      signal: AbortSignal.timeout(18000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get('location');
      if (!next) throw new Error('Publisher returned an invalid redirect.');
      target = trustedUrl(new URL(next, target).href, source);
      continue;
    }
    if (!response.ok) throw new Error(`Publisher returned HTTP ${response.status}.`);
    if (Number(response.headers.get('content-length')) > 3_000_000)
      throw new Error('Publisher response is too large.');
    let size = 0;
    const chunks = [];
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 3_000_000) throw new Error('Publisher response is too large.');
      chunks.push(chunk);
    }
    return { text: Buffer.concat(chunks).toString('utf8'), url: target };
  }
  throw new Error('Too many publisher redirects.');
}
export function parseFeed(xml, source, lookbackHours, now = Date.now()) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Feed contains unsupported entities.');
  const tree = parser.parse(xml);
  if (!tree.rss?.channel && !tree.feed)
    throw new Error('Publisher did not return a readable RSS or Atom feed.');
  let entries = tree.rss?.channel?.item || tree.feed?.entry || [];
  if (!Array.isArray(entries)) entries = [entries];
  return entries.flatMap((item) => {
    try {
      const links = Array.isArray(item.link) ? item.link : [item.link];
      const link = links.find(
        (l) => typeof l === 'string' || !l?.['@_rel'] || l['@_rel'] === 'alternate',
      );
      const url = trustedUrl(typeof link === 'string' ? link : link?.['@_href'], source);
      // An edit timestamp must not make an old announcement look new.
      // GitHub Atom exposes an update date; it is only a discovery hint.
      // The release API must confirm published_at before a draft is created.
      const rawDate =
        item.pubDate ||
        item.published ||
        (source.kind === 'github-release' ? item.updated : undefined);
      const date = Date.parse(rawDate);
      let title = plain(typeof item.title === 'object' ? item.title['#text'] : item.title);
      if (
        !title ||
        !Number.isFinite(date) ||
        date > now + 300000 ||
        now - date > lookbackHours * 3600000
      )
        return [];
      if (source.kind === 'github-release') {
        if (/\b(alpha|beta|rc\d*|nightly|dev\d*|canary|preview)\b/i.test(title + ' ' + url))
          return [];
        title = `${source.name.replace(/ releases$/, '')}: ${title}`;
      }
      if (
        source.aiOnly &&
        !/\b(ai|artificial intelligence|machine learning|deep learning|llm|llms|generative|neural|robotics?|inference|language model|computer vision|agentic|copilot|gemini)\b/i.test(
          title + ' ' + plain(item.description || item.summary || item.content?.['#text']),
        )
      )
        return [];
      // NVIDIA also publishes gaming stories; keep its feed scoped to AI.
      if (
        source.id === 'nvidia' &&
        !/\b(ai|artificial intelligence|model|robot|inference|machine learning|data center)\b/i.test(
          title + ' ' + plain(item.description),
        )
      )
        return [];
      return [
        {
          title,
          url,
          publishedAt: new Date(date).toISOString(),
          sourceId: source.id,
          sourceName: source.name,
        },
      ];
    } catch {
      return [];
    }
  });
}

export async function readArticle(
  article,
  source,
  lookbackHours,
  fetcher = fetchText,
  now = Date.now(),
) {
  if (source.kind !== 'github-release') {
    const page = await fetcher(article.url, source);
    return { ...article, url: page.url, ...extractArticle(page.text) };
  }
  const url = new URL(trustedUrl(article.url, source));
  const prefix = `/${source.repo}/releases/tag/`;
  if (!url.pathname.toLowerCase().startsWith(prefix.toLowerCase()))
    throw new Error('Not a project release page.');
  const tag = decodeURIComponent(url.pathname.slice(prefix.length));
  const apiUrl = `https://api.github.com/repos/${source.repo}/releases/tags/${encodeURIComponent(tag)}`;
  const page = await fetcher(apiUrl, source);
  const release = JSON.parse(page.text);
  const published = Date.parse(release.published_at);
  if (
    release.draft ||
    release.prerelease ||
    !Number.isFinite(published) ||
    published > now + 300000 ||
    now - published > lookbackHours * 3600000
  )
    throw new Error('Release is unpublished, a prerelease, or outside the freshness window.');
  const canonical = trustedUrl(release.html_url, source);
  if (canonical !== article.url || release.tag_name !== tag)
    throw new Error('Release identity does not match the feed.');
  if (typeof release.body !== 'string' || release.body.length > 200000)
    throw new Error('Release notes are missing or too large.');
  const content = extractArticle(
    `<article>${marked.parse(release.body, { async: false })}</article>`,
  );
  return { ...article, url: canonical, publishedAt: new Date(published).toISOString(), ...content };
}
export function extractArticle(html) {
  const $ = cheerio.load(html);
  $(
    'script,style,nav,header,footer,aside,form,button,noscript,[role="navigation"],.cookie-banner',
  ).remove();
  const root = $('article').first().length
    ? $('article').first()
    : $('main').first().length
      ? $('main').first()
      : $('body');
  const paragraphs = root
    .find('p, li')
    .toArray()
    .filter((el) => el.tagName !== 'li' || $(el).find('p').length === 0)
    .map((el) => normalize($(el).text()))
    .filter(
      (t) => t.length >= 65 && !/cookie|subscribe to|sign up for|all rights reserved/i.test(t),
    );
  const text = paragraphs.join('\n').slice(0, 9000);
  if (text.length < 180) throw new Error('Not enough readable article text to support a draft.');
  const candidates = paragraphs
    .flatMap((p) => p.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [p])
    .map(normalize)
    .filter(
      (s) =>
        s.split(/\s+/).length >= 8 &&
        s.split(/\s+/).length <= 24 &&
        s.length < 230 &&
        !/https?:|@|ignore (previous|all)|system prompt/i.test(s),
    )
    .slice(0, 10);
  if (!candidates.length) throw new Error('No short, complete supporting excerpt found.');
  return { text, candidates };
}
