import React, { useEffect, useRef, useState } from 'react';
import { terms } from '../lib/glossary';
import { usePreferences } from '../context/Preferences';

export default function Glossary() {
  const { prefs, t } = usePreferences();
  const [entry, setEntry] = useState(null),
    [list, setList] = useState(false);
  const dialog = useRef(null),
    button = useRef(null);
  useEffect(() => {
    const lookup = new Map();
    terms.forEach((row) =>
      [row[0], row[1], t(row[0])]
        .join('|')
        .split('|')
        .forEach((alias) => lookup.set(alias.toLowerCase(), row)),
    );
    const pattern = new RegExp(
      '(?<![\\p{L}\\p{N}])(?:' +
        [...lookup.keys()].sort((a, b) => b.length - a.length).map(alias => alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') +
        ')(?![\\p{L}\\p{N}])',
      'giu',
    );
    let matches = new WeakMap(),
      frame;
    const root = document.querySelector('.app-shell');
    if (!root) return;
    function scan() {
      matches = new WeakMap();
      const ranges = [],
        walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (
          node.parentElement?.closest(
            'button,select,input,textarea,svg,script,style,a,dialog,[data-glossary]',
          )
        )
          continue;
        for (const match of node.nodeValue.matchAll(pattern)) {
          const range = new Range();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          const entries = matches.get(node) || [];
          entries.push({
            range,
            text: match[0],
            row: lookup.get(match[0].toLowerCase()),
          });
          matches.set(node, entries);
          ranges.push(range);
        }
      }
      if (window.CSS?.highlights && window.Highlight)
        CSS.highlights.set('finance', new Highlight(...ranges));
    }
    function click(e) {
      if (e.target.closest('[data-glossary]')) return;
      setEntry(null);
      const pos = document.caretPositionFromPoint?.(e.clientX, e.clientY);
      const fallback =
        !pos && document.caretRangeFromPoint?.(e.clientX, e.clientY);
      for (const item of matches.get(
        pos?.offsetNode || fallback?.startContainer,
      ) || []) {
        const inside = Array.from(item.range.getClientRects()).find(
          (r) =>
            e.clientX >= r.left &&
            e.clientX <= r.right &&
            e.clientY >= r.top &&
            e.clientY <= r.bottom,
        );
        if (inside) {
          setEntry({
            text: item.text,
            def: t(item.row[2], item.row[3]),
            x: inside.left,
            y: inside.top,
            bottom: inside.bottom,
          });
          break;
        }
      }
    }
    const hide = () => setEntry(null),
      escape = (e) => {
        if (e.key === 'Escape') hide();
      };
    scan();
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(scan);
    });
    observer.observe(root, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    document.addEventListener('click', click);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    window.addEventListener('keydown', escape);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      CSS.highlights?.delete('finance');
      document.removeEventListener('click', click);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('keydown', escape);
    };
  }, [prefs.language]);
  useEffect(() => {
    if (list) dialog.current?.showModal();
  }, [list]);
  return (
    <div data-glossary="">
      <button
        className="btn btn-ghost"
        ref={button}
        onClick={() => {
          setEntry(null);
          setList(true);
        }}
      >
        {t('Glossary', 'Słownik')}
      </button>
      {entry && (
        <aside
          className="term-tip"
          role="status"
          style={{
            left: Math.max(8, Math.min(entry.x, window.innerWidth - 300)),
            ...(entry.y > 120
              ? { bottom: window.innerHeight - entry.y + 6 }
              : { top: entry.bottom + 6 }),
          }}
        >
          <strong>{entry.text}</strong>
          <p>{entry.def}</p>
        </aside>
      )}
      {list && (
        <dialog
          ref={dialog}
          className="message-dialog glossary-list"
          onClose={() => {
            setList(false);
            button.current?.focus();
          }}
          aria-label={t('Glossary', 'Słownik')}
        >
          <button
            className="btn btn-ghost"
            onClick={() => dialog.current.close()}
          >
            {t('Close')}
          </button>
          <dl>
            {terms.map((row) => (
              <div key={row[0]}>
                <dt>{t(row[0], row[1]).split('|')[0]}</dt>
                <dd>{t(row[2], row[3])}</dd>
              </div>
            ))}
          </dl>
        </dialog>
      )}
    </div>
  );
}
