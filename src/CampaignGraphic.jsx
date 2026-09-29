import React, { useRef, useState } from 'react';

function wrap(text, width, maxLines) {
  const lines = [];
  let line = '';
  for (const word of String(text || '').split(/\s+/)) {
    if (line.length + word.length + 1 > width && line) {
      lines.push(line);
      line = '';
    }
    line += (line ? ' ' : '') + word;
  }
  if (line) lines.push(line);
  return lines
    .slice(0, maxLines)
    .map((s, i) => (i === maxLines - 1 && lines.length > maxLines ? s.slice(0, -1) + '…' : s));
}
export default function CampaignGraphic({ draft }) {
  const svg = useRef(),
    [error, setError] = useState('');
  const headline = wrap(draft.graphicHeadline || draft.title, 22, 5);
  async function download() {
    try {
      const xml = new XMLSerializer().serializeToString(svg.current);
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1200;
      canvas.getContext('2d').drawImage(image, 0, 0);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Image export failed.');
      const url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = 'campaign-graphic.png';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError('Could not export the image in this browser. Try another browser.');
    }
  }
  return (
    <div className="campaign-graphic">
      <svg
        ref={svg}
        viewBox="0 0 1200 1200"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`Campaign graphic for ${draft.projectName}`}
      >
        <defs>
          <linearGradient id="campaign-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#122f35" />
            <stop offset="1" stopColor="#355b48" />
          </linearGradient>
        </defs>
        <rect width="1200" height="1200" fill="url(#campaign-gradient)" />
        <circle cx="1080" cy="170" r="310" fill="#e2edbb" opacity=".08" />
        <circle
          cx="1100"
          cy="900"
          r="370"
          fill="none"
          stroke="#cbdf9b"
          strokeWidth="2"
          opacity=".25"
        />
        <circle
          cx="1100"
          cy="900"
          r="280"
          fill="none"
          stroke="#cbdf9b"
          strokeWidth="2"
          opacity=".2"
        />
        <rect x="80" y="83" width="12" height="46" rx="6" fill="#c6e697" />
        <text
          x="118"
          y="118"
          fontFamily="Arial, sans-serif"
          fontSize="32"
          fill="#e6eed8"
          letterSpacing="3"
        >
          {String(draft.projectName || '').slice(0, 35)}
        </text>
        {headline.map((line, i) => (
          <text
            key={i}
            x="80"
            y={350 + i * 102}
            fontFamily="Arial, sans-serif"
            fontWeight="700"
            fontSize="82"
            fill="#faf6e8"
          >
            {line}
          </text>
        ))}
        <rect x="80" y="968" width="88" height="6" fill="#c6e697" />
        <text x="80" y="1060" fontFamily="Arial, sans-serif" fontSize="28" fill="#dce7cd">
          {draft.projectWebsite ? new URL(draft.projectWebsite).hostname : draft.projectName}
        </text>
      </svg>
      <button type="button" className="button secondary" onClick={download}>
        Download graphic · PNG
      </button>
      <p className="form-hint">
        1200 × 1200 campaign graphic. Review the headline before using it. The publish button sends
        text only.
      </p>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
