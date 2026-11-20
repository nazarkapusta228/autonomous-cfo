import { usePreferences } from '../context/Preferences';
import React from 'react';
import { useApp } from '../context/AppContext';
import RecommendationCard from './RecommendationCard';
import SimulationForm from './SimulationForm';

export default function InvestmentAgent() {
  const { t: tr } = usePreferences();
  const { state } = useApp();
  const free = state.assessments.investment?.recommendation.free_cash;
  return (
    <>
      <section className="card mb-4">
        <div className="card-title">{tr("Short-term deposit assessment")}</div>
        <p className="card-sub"> {tr("The forecast sets aside operating cash and your safety reserve. Any remaining cash can be assessed for a term deposit.")} </p>
        <RecommendationCard role="investment" />
      </section>
      <div className="grid-even enquiry-pair" key={state.revision}>
        <SimulationForm
          kind="money_market"
          title={tr("Money market enquiry")}
          suggested={free || ''}
          description={tr("Simulate a request for a fund quote within the investment agent’s free-cash limit. Run the assessment first.")}
        />
        <SimulationForm
          kind="capex"
          title={tr("Equipment finance enquiry")}
          description={tr("Enter the equipment budget and financing date for a simulated credit enquiry. Terms require a lender quote.")}
        />
      </div>
    </>
  );
}
