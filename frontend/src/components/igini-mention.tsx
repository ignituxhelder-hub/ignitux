import type { CSSProperties, ReactNode } from 'react';

/**
 * Présente Igini de façon cohérente partout où elle apparaît côté frontend,
 * pour ne pas dupliquer/désynchroniser le nom de marque et son style.
 */
export function IginiMention({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <p className="muted" style={style}>
      <strong style={{ color: 'var(--accent)' }}>Igini</strong>, l&apos;intelligence
      d&apos;Ignitux, {children}
    </p>
  );
}
