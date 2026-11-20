import React from 'react';
import { useApp } from '../context/AppContext';
import RecommendationCard from './RecommendationCard';
import SimulationForm from './SimulationForm';

export default function InvestmentAgent() {
  const { state } = useApp();
  const free = state.assessments.investment?.recommendation.free_cash;
  return (
    <>
      <section className="card mb-4">
        <div className="card-title">Short-term deposit assessment</div>
        <RecommendationCard role="investment" />
      </section>
      <div className="grid-even" key={state.revision}>
        <SimulationForm
          key={free ?? 'unassessed'}
          kind="money_market"
          title="Money market enquiry"
          suggested={free || ''}
          disabled={!(Number(free) > 0)}
          description="Simulate a request for a fund quote within the investment agent’s free-cash limit. Run the assessment first."
        />
        <SimulationForm
          kind="capex"
          title="Equipment finance enquiry"
          description="Enter the equipment budget and financing date for a simulated credit enquiry. Terms require a lender quote."
        />
      </div>
    </>
  );
}
