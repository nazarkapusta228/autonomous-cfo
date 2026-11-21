import React from 'react';
import { usePreferences } from '../context/Preferences';

function Flag({ language }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 60 36" width="24" height="15">
      {language === 'pl' ? (
        <>
          <path fill="#fff" d="M0 0h60v18H0z" />
          <path fill="#dc143c" d="M0 18h60v18H0z" />
        </>
      ) : (
        <>
          <path fill="#25386b" d="M0 0h60v36H0z" />
          <path stroke="white" strokeWidth="7" d="m0 0 60 36m0-36L0 36" />
          <path stroke="#bd2840" strokeWidth="2" d="m0 0 60 36m0-36L0 36" />
          <path stroke="white" strokeWidth="12" d="M30 0v36M0 18h60" />
          <path stroke="#bd2840" strokeWidth="7" d="M30 0v36M0 18h60" />
        </>
      )}
    </svg>
  );
}

export default function LanguageSwitcher() {
  const { t, prefs, update } = usePreferences();
  return (
    <div
      className="language-buttons"
      role="group"
      aria-label={t('Language', 'Język')}
    >
      {[
        ['en', 'English'],
        ['pl', 'Polski'],
      ].map(([code, name]) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-label={name}
          title={name}
          aria-pressed={prefs.language === code}
          onClick={() => update({ language: code })}
        >
          <Flag language={code} />
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
