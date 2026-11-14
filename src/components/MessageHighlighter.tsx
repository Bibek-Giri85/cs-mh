import React from 'react';

export function HighlightedMessage({ text }: { text: string }) {
  const parts = String(text || '').split(/(\bMH[A-Z0-9]{3,12}\b|\+91\s?\d{5}\s?\d{5}|\b\d{10}\b)/g);

  return (
    <span className="whitespace-pre-line">
      {parts.map((part, idx) => {
        if (/^MH[A-Z0-9]{3,12}$/.test(part)) {
          return (
            <strong key={idx} className="hl-coupon">
              {part}
            </strong>
          );
        }
        if (/^(\+91\s?\d{5}\s?\d{5}|\d{10})$/.test(part)) {
          return (
            <strong key={idx} className="hl-phone">
              {part}
            </strong>
          );
        }
        return <React.Fragment key={idx}>{part}</React.Fragment>;
      })}
    </span>
  );
}
