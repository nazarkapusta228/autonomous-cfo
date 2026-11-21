import { usePreferences } from '../context/Preferences';
import React from 'react';
import RecommendationCard from './RecommendationCard';

export default function InvestmentAgent() {
  const { t: tr } = usePreferences();
  return (
    <>
      <section className="card mb-4">
        <div className="card-title">{tr("Short-term deposit assessment")}</div>
        <p className="card-sub"> {tr("The forecast sets aside operating cash and your safety reserve. Any remaining cash can be assessed for a term deposit.")} </p>
        <RecommendationCard role="investment" />
      </section>
    </>
  );
}
