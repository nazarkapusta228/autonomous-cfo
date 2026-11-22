import React, { useLayoutEffect, useRef, useState } from 'react';
import { useAccount } from './Account';
import { usePreferences } from '../context/Preferences';
import { api } from '../lib/api';

const steps = [
  ['dashboard','dashboard','Start here to see how much cash your business has.','Tutaj sprawdzisz, ile środków ma firma.','Hier siehst du, wie viel Geld deinem Unternehmen zur Verfügung steht.'],
  ['dashboard','.cash-overview','Compare your cash balance with the invoices you still owe.','Porównaj saldo z fakturami, które masz jeszcze do opłacenia.','Vergleiche deinen Kontostand mit den noch offenen Rechnungen.'],
  ['dashboard','.dashboard-kpis','Check the projected minimum balance and whether extra funding is needed.','Sprawdź najniższe prognozowane saldo i ewentualną lukę finansową.','Prüfe den erwarteten Tiefststand und einen möglichen Finanzierungsbedarf.'],
  ['dashboard','forecast','Follow the balance day by day. The reserve line marks your safety cushion.','Śledź saldo dzień po dniu. Linia rezerwy oznacza Twój bufor.','Verfolge den Kontostand von Tag zu Tag. Die Reservelinie markiert deinen Puffer.'],
  ['data','data','Upload the financial records that power your workspace here.','Tutaj wgrasz dane finansowe używane w aplikacji.','Hier lädst du die Finanzdaten für deinen Arbeitsbereich hoch.'],
  ['data','statement','Upload booked transactions here and enter the balance before the first booking.','Wgraj zaksięgowane transakcje i podaj saldo sprzed pierwszej operacji.','Lade gebuchte Umsätze hoch und gib den Saldo vor der ersten Buchung an.'],
  ['data','plan','Add future receipts and payments with their expected dates.','Dodaj przyszłe wpływy i płatności wraz z oczekiwanymi datami.','Erfasse künftige Ein- und Auszahlungen mit ihren erwarteten Terminen.'],
  ['data','invoices','Import invoices to match them with payments and include eligible open amounts in the forecast.','Wgraj faktury, aby powiązać je z płatnościami i uwzględnić otwarte kwoty w prognozie.','Importiere Rechnungen für den Zahlungsabgleich und die Prognose offener Beträge.'],
  ['transactions','transactions','Open this page to review the activity in your bank statement.','Tutaj przejrzysz operacje z wyciągu bankowego.','Hier prüfst du die Umsätze aus deinem Kontoauszug.'],
  ['transactions','activity','Inspect individual payments and edit a row when its details need correcting.','Sprawdzaj poszczególne płatności i poprawiaj ich dane w wierszu.','Prüfe einzelne Zahlungen und korrigiere bei Bedarf die Buchungsdetails.'],
  ['liquidity','liquidity','Use the Liquidity Agent to check whether upcoming payments are covered.','Agent płynności pomoże sprawdzić pokrycie nadchodzących płatności.','Der Liquiditätsagent zeigt, ob anstehende Zahlungen gedeckt sind.'],
  ['liquidity','inputs','Choose a cut-off date, reserve and forecast period, then run the forecast.','Wybierz datę graniczną, rezerwę i okres, a następnie uruchom prognozę.','Wähle Stichtag, Reserve und Zeitraum und starte die Prognose.'],
  ['liquidity','decision','Review the funding gap and the recommendation based on your forecast.','Sprawdź lukę finansową i zalecenie wynikające z prognozy.','Prüfe die Finanzierungslücke und die Empfehlung zur Prognose.'],
  ['liquidity','.operating-scenario h3','Try changing a payment amount or date and compare the scenario with the baseline.','Zmień kwotę lub termin płatności i porównaj scenariusz z prognozą bazową.','Ändere einen Zahlungsbetrag oder Termin und vergleiche das Szenario mit der Basisprognose.'],
  ['liquidity','payments','Review the dated payments and receipts behind the forecast.','Przejrzyj terminy płatności i wpływów uwzględnionych w prognozie.','Prüfe die geplanten Ein- und Auszahlungen und ihre Termine.'],
  ['dashboard','.snail-chat input','Ask the assistant about your balance, upcoming payments or forecast.','Zapytaj asystenta o saldo, nadchodzące płatności lub prognozę.','Frage den Assistenten nach deinem Saldo, anstehenden Zahlungen oder der Prognose.'],
  ['settings','settings','Set the appearance, reporting currency and alerts for your workspace.','Dostosuj wygląd, walutę raportową i powiadomienia.','Passe Darstellung, Berichtswährung und Benachrichtigungen an.'],
  ['settings','.settings-grid .wide h3','Choose which balance changes or reserve warnings you want to see.','Wybierz zmiany salda i ostrzeżenia o rezerwie, które chcesz widzieć.','Wähle, welche Saldoänderungen und Reservewarnungen du sehen möchtest.'],
];

const copy = {
  en: ['Quick tour','Would you like a short guided tour of your workspace?', 'Skip', 'Start tour', 'End tour','Next','Finish','Please try again.'],
  pl: ['Przewodnik','Chcesz poznać najważniejsze funkcje aplikacji?', 'Pomiń','Rozpocznij','Zakończ przewodnik','Dalej','Zakończ','Spróbuj ponownie.'],
  de: ['Kurze Einführung','Möchtest du deinen Arbeitsbereich bei einem kurzen Rundgang kennenlernen?', 'Überspringen','Rundgang starten','Rundgang beenden','Weiter','Fertig','Bitte erneut versuchen.'],
};

export default function WorkspaceTour({ active, navigate }) {
  const { user, setUser } = useAccount();
  const { prefs } = usePreferences();
  const [index, setIndex] = useState(-1);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [box, setBox] = useState(null);
  const dialog = useRef(null), panel = useRef(null);
  const step = steps[index];
  const visible = user.tour_pending || Boolean(step);
  const labels = copy[prefs.language] || copy.en;
  useLayoutEffect(() => {
    if (visible) dialog.current.showModal();
  }, [visible]);
  useLayoutEffect(() => {
    if (!step || step[0] !== active) { setBox(null); return; }
    const key = step[1];
    const target = document.querySelector(key.startsWith('.') ? key : '[data-tour="'+key+'"]');
    if (!target) { setBox(null); return; }
    target.scrollIntoView({block:'center', inline:'nearest', behavior:'instant'});
    const position = () => {
      const r = target.getBoundingClientRect();
      const card = panel.current.getBoundingClientRect();
      const clamp = (v, max) => Math.max(8, Math.min(v,max-8));
      const x = clamp(r.left, innerWidth-card.width);
      const below = r.bottom + 22;
      const y = clamp(below+card.height+8 <= innerHeight ? below : r.top-card.height-22, innerHeight-card.height);
      setBox({x,y,left:r.left,top:r.top,width:r.width,height:r.height,
        fromX:Math.max(r.left,Math.min(x+card.width/2,r.right)),fromY:y>=r.bottom?r.bottom:r.top,
        toX:x+card.width/2,toY:y>=r.bottom?y:y+card.height});
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(target); observer.observe(panel.current);
    window.addEventListener('resize',position);
    window.addEventListener('scroll',position,true);
    return () => {observer.disconnect();window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);};
  }, [step, active]);
  function go(i) { navigate(steps[i][0]); setIndex(i); }
  function finish() { setIndex(-1); navigate('dashboard'); }
  async function choose(start) {
    if (saving) return;
    setSaving(true); setFailed(false);
    try {
      await api('account/tour-dismiss',{});
      if (start) go(0);
      setUser(previous => ({...previous,tour_pending:false}));
    } catch {setFailed(true);}
    finally {setSaving(false);}
  }
  if (!visible) return null;
  return <dialog className="workspace-tour" ref={dialog} aria-labelledby="tour-title"
    onCancel={e=>{e.preventDefault(); if(step) finish(); else choose(false);}}>
    {box && <svg aria-hidden="true" className="tour-pointer">
      <rect x={box.left} y={box.top} width={box.width} height={box.height} rx="5"/>
      <line x1={box.fromX} y1={box.fromY} x2={box.toX} y2={box.toY}/>
    </svg>}
    <section ref={panel} className="tour-card card" style={box?{left:box.x,top:box.y,transform:'none'}:undefined}>
      <div aria-live="polite" aria-atomic="true">
        <h3 id="tour-title">{labels[0]} {step && <small>{index+1} / {steps.length}</small>}</h3>
        <p>{step ? step[{pl:3,de:4}[prefs.language] || 2] : labels[1]}</p>
      </div>
      {failed && <p role="alert">{labels[7]}</p>}
      <div className="tour-actions">
        <button className="btn btn-ghost" disabled={saving} onClick={()=>step?finish():choose(false)}>{labels[step?4:2]}</button>
        <button className="btn btn-primary" disabled={saving} onClick={()=>!step?choose(true):index+1===steps.length?finish():go(index+1)}>{labels[!step?3:index+1===steps.length?6:5]}</button>
      </div>
    </section>
  </dialog>;
}
