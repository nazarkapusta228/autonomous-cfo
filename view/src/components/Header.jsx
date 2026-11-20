import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { usePreferences } from '../context/Preferences';
import { Profile } from './Settings';

function Flag({ language }) {
  return <svg aria-hidden="true" viewBox="0 0 60 36" width="24" height="15">
    {language === 'pl' ? <>
      <path fill="#fff" d="M0 0h60v18H0z"/><path fill="#dc143c" d="M0 18h60v18H0z"/>
    </> : <>
      <path fill="#25386b" d="M0 0h60v36H0z"/>
      <path stroke="white" strokeWidth="7" d="m0 0 60 36m0-36L0 36"/>
      <path stroke="#bd2840" strokeWidth="2" d="m0 0 60 36m0-36L0 36"/>
      <path stroke="white" strokeWidth="12" d="M30 0v36M0 18h60"/>
      <path stroke="#bd2840" strokeWidth="7" d="M30 0v36M0 18h60"/>
    </>}
  </svg>;
}

export default function Header({ title, subtitle }) {
  const { t, prefs, update } = usePreferences();
  const [mode, setMode] = useState(null);
  const panel = useRef(null);
  const trigger = useRef(null);
  const close = () => { setMode(null); trigger.current?.focus(); };

  useEffect(() => {
    if (!mode) return;
    function outside(event) {
      if (!panel.current?.contains(event.target)) setMode(null);
    }
    function escape(event) { if (event.key === 'Escape') close(); }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [mode]);

  return <header className="header">
    <div><h2>{t(title)}</h2><div className="subtitle">{t(subtitle)}</div></div>
    <div className="header-actions">
      <div className="language-buttons" role="group" aria-label={t('Language', 'Język')}>
        {[['en', 'English'], ['pl', 'Polski']].map(([code, name]) =>
          <button key={code} type="button" lang={code} aria-label={name} title={name}
            aria-pressed={prefs.language === code} onClick={() => update({language: code})}>
            <Flag language={code}/>{code.toUpperCase()}
          </button>)}
      </div>
      <div className="profile-anchor" ref={panel}
        onPointerEnter={e => { if (e.pointerType === 'mouse') setMode(previous => previous || 'hover'); }}
        onPointerLeave={() => setMode(previous => previous === 'hover' ? null : previous)}
        onBlur={e => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setMode(null); }}>
        <button ref={trigger} type="button" className="user-chip" aria-expanded={Boolean(mode)}
          aria-controls="account-widget" onClick={() => setMode(previous => previous === 'pinned' ? null : 'pinned')}>
          <span className="user-avatar">AM</span><span>Alex Morgan<small>{t('My profile','Mój profil')}</small></span>
        </button>
        {mode && <div id="account-widget" className="profile-popover">
          <section aria-labelledby="profile-title" className="profile-sheet">
            <header><h3 id="profile-title">{t('My profile','Mój profil')}</h3>
              <button type="button" className="btn btn-ghost" aria-label={t('Close')} onClick={close}><X size={16}/></button></header>
            <Profile/>
          </section>
        </div>}
      </div>
    </div>
  </header>;
}
