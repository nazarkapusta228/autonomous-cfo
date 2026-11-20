import React from 'react';
import { usePreferences } from '../context/Preferences';

export default function Header({ title, subtitle, onProfile }) {
  const { t, prefs, update } = usePreferences();
  return <header className="header">
    <div><h2>{t(title)}</h2><div className="subtitle">{t(subtitle)}</div></div>
    <div className="header-actions"><select aria-label={t('Language','Język')} value={prefs.language} onChange={e => update({language:e.target.value})}>
      <option value="en">English</option><option value="pl">Polski</option>
    </select><button className="user-chip" onClick={onProfile}><span className="user-avatar">AM</span>
      <span>Alex Morgan<small>{t('My profile','Mój profil')}</small></span></button></div>
  </header>;
}
