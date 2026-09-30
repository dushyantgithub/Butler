import React, { useMemo } from 'react';
import { Marked } from 'marked';
import { employeeLook, ceoLook, DEPARTMENTS } from '../shared/roster.js';

export async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, {
    method,
    headers:
      method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Butler-Client': 'office' },
    ...(method !== 'GET' ? { body: JSON.stringify(body || {}) } : {}),
  });
  const result = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(result.error || 'The office could not complete that action.');
  return result;
}

export const deptOf = (state, id) => state?.departments?.find((d) => d.id === id);
export const workerOf = (state, id) => state?.workers?.find((w) => w.id === id);
export const personName = (w) => w?.persona?.fullName || w?.name || 'Employee';
export const firstName = (w) => w?.persona?.firstName || w?.name || 'Employee';

// Flat brick-head portrait for lists, feeds and chips (cheap, no WebGL).
export function FaceAvatar({ worker, avatar, size = 36, ring }) {
  const look =
    worker?.ceo || avatar
      ? ceoLook(avatar || worker?.avatar)
      : worker?.persona?.look || employeeLook(worker?.id || 'x', worker?.department);
  const color =
    worker?.ceo || avatar
      ? '#1D1D1F'
      : DEPARTMENTS.find((d) => d.id === worker?.department)?.color || '#8E8E93';
  const hair = look.hair;
  const hc =
    hair === 'wrap'
      ? ['#6E4A7E', '#2F6F73', '#B5533C', '#1F3B63', '#C9A13B'][look.seed % 5]
      : look.hairColor;
  return (
    <span
      className="face-avatar"
      style={{ width: size, height: size, '--ring': ring || 'transparent' }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 40 40" width={size} height={size}>
        <defs>
          <linearGradient id={`bg-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.95" />
            <stop offset="1" stopColor={color} stopOpacity="0.65" />
          </linearGradient>
        </defs>
        <circle cx="20" cy="20" r="20" fill={`url(#bg-${color.slice(1)})`} />
        <path d="M8 40c1-8 5-11 12-11s11 3 12 11z" fill={look.torso || color} opacity="0.95" />
        {hair === 'afro' && <circle cx="20" cy="14" r="11.5" fill={hc} />}
        {['long', 'wavy', 'bob', 'braids'].includes(hair) && (
          <rect x="9.5" y="9" width="21" height="19" rx="6" fill={hc} />
        )}
        {hair === 'wrap' && <rect x="9" y="6" width="22" height="22" rx="9" fill={hc} />}
        <rect x="11.5" y="9.5" width="17" height="17.5" rx="5.5" fill={look.skin} />
        {!['bald', 'afro', 'wrap', 'buzz'].includes(hair) && (
          <path d="M11 15c0-6 4-8.5 9-8.5s9 2.5 9 8.5c-3-2-6-3-9-3s-6 1-9 3z" fill={hc} />
        )}
        {hair === 'buzz' && (
          <path d="M11.5 13c1-4.5 4.4-5.6 8.5-5.6s7.5 1.1 8.5 5.6z" fill={hc} opacity="0.85" />
        )}
        {hair === 'bun' && <circle cx="20" cy="6.5" r="3.4" fill={hc} />}
        {hair === 'spiky' && <path d="M11 13l2-6 3 4 2-6 3 5 3-5 2 5 3-4 1 7z" fill={hc} />}
        {hair === 'ponytail' && <circle cx="29" cy="12" r="2.8" fill={hc} />}
        {hair === 'curly' && (
          <g fill={hc}>
            {[12, 16, 20, 24, 28].map((x) => (
              <circle key={x} cx={x} cy={10.5} r="3.2" />
            ))}
          </g>
        )}
        <ellipse cx="16.4" cy="18.2" rx="1.2" ry="1.5" fill="#1c1b1f" />
        <ellipse cx="23.6" cy="18.2" rx="1.2" ry="1.5" fill="#1c1b1f" />
        {look.glasses !== 'none' && (
          <g fill="none" stroke="#2B2B30" strokeWidth="0.9">
            <circle cx="16.4" cy="18.2" r="2.7" />
            <circle cx="23.6" cy="18.2" r="2.7" />
            <path d="M19.1 18.2h1.8" />
          </g>
        )}
        {look.facial === 'beard' && (
          <path
            d="M12 21c1 6 4 7.5 8 7.5s7-1.5 8-7.5c-2 2-5 3-8 3s-6-1-8-3z"
            fill={look.hairColor}
          />
        )}
        <path
          d="M16.8 22.3q3.2 2.6 6.4 0"
          fill="none"
          stroke="#1c1b1f"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const markdown = new Marked({
  gfm: true,
  renderer: {
    // Model output is untrusted: raw HTML is shown as text, links are limited to web/mail.
    html({ text }) {
      return escapeHtml(text);
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      if (!/^(https?:|mailto:)/i.test(href || '')) return text;
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer noopener"${title ? ` title="${escapeHtml(title)}"` : ''}>${text}</a>`;
    },
    image({ text }) {
      return escapeHtml(text || '');
    },
  },
});
export function Markdown({ text, className = '' }) {
  const html = useMemo(() => markdown.parse(String(text || ''), { async: false }), [text]);
  return <div className={`markdown ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

export const when = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
export function ago(value) {
  if (!value) return '';
  const s = Math.max(0, (Date.now() - Date.parse(value)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
export const STATUS_LABEL = {
  working: 'Working',
  queued: 'In the queue',
  approval: 'Waiting for you',
  idle: 'Free',
  bench: 'On the bench',
};
export const APPROVAL_LABEL = {
  publish: 'Publish',
  send: 'Send',
  contact: 'Contact',
  verify: 'Verify a fact',
  spend: 'Spend',
  legal: 'Legal',
  other: 'Decision',
};
export function level(count) {
  const lvl = 1 + Math.floor(count / 3);
  return { level: lvl, progress: (count % 3) / 3 };
}
