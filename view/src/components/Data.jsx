import React, { useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { usePreferences } from '../context/Preferences';

const datasets = [
  [
    'statement',
    'Bank statement',
    'Wyciąg bankowy',
    'Booked payments feed Transactions, balances and the forecast. Upload the example bank CSV here.',
    'Zaksięgowane płatności zasilają transakcje, salda i prognozę. Tutaj wgraj przykładowy CSV z banku.',
  ],
  [
    'plan',
    'Cash flow plan',
    'Plan przepływów',
    'Planned EUR receipts and payments replace the recurring-payment estimate in the forecast.',
    'Planowane wpływy i wydatki w EUR zastępują prognozę opartą na cyklicznych płatnościach.',
  ],
  [
    'invoices',
    'Invoices',
    'Faktury',
    'Invoices are matched to booked payments. Eligible outstanding invoices feed the forecast.',
    'Faktury są uzgadniane z płatnościami. Kwalifikujące się nierozliczone faktury trafiają do prognozy.',
  ],
];

function Dataset({ kind, title, description }) {
  const { state, busy, submit, setError, confirm } = useApp();
  const { t } = usePreferences();
  const [upload, setUpload] = useState(null);
  const [format, setFormat] = useState('csv');
  const [notice, setNotice] = useState('');
  const picker = useRef();
  const info = state.data_files[kind];
  async function select(file) {
    setNotice('');
    setUpload(null);
    if (!file) return;
    try {
      if (file.size > 4 * 1024 * 1024)
        throw Error(t('File exceeds 4 MiB', 'Plik przekracza 4 MiB'));
      const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
        await file.arrayBuffer(),
      );
      const source = { filename: file.name, content };
      const preview = await submit('data/' + kind + '/preview', source, false);
      if (preview)
        setUpload({
          ...source,
          ...preview,
          constants: {},
          revision: state.revision,
        });
    } catch (e) {
      setError(e.message);
    }
  }
  function clear() {
    setUpload(null);
    picker.current.value = '';
  }
  const stale = upload && upload.revision !== state.revision;
  const ready =
    upload &&
    !stale &&
    Object.entries(upload.mapping).every(
      ([f, v]) =>
        v || upload.constants[f]?.trim() || upload.optional.includes(f),
    );
  return (
    <section className="card mb-4 data-panel">
      <h3>{title}</h3>
      <p className="card-sub">{description}</p>
      <p>
        {info.filename ? (
          <a
            className="data-original"
            download
            href={'/api/data/' + kind + '/original?revision=' + state.revision}
          >
            {info.filename}
          </a>
        ) : info.present ? (
          t('Current workspace data', 'Dane przestrzeni roboczej')
        ) : (
          t('No data loaded', 'Brak danych')
        )}
      </p>
      <div className="data-tools">
        <label>
          {title}
          <input
            ref={picker}
            type="file"
            accept=".csv,.json,.txt"
            disabled={busy}
            onChange={(e) => select(e.target.files[0])}
          />
        </label>
        {info.present && (
          <>
            <label>
              {t('Export format', 'Format eksportu')}
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              >
                {['csv', 'json', 'txt', 'pdf'].map((f) => (
                  <option key={f} value={f}>
                    {f.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            <a
              className="btn btn-ghost"
              download
              href={
                '/api/data/' +
                kind +
                '/export?revision=' +
                state.revision +
                '&format=' +
                format
              }
            >
              {t('Download', 'Pobierz')}
            </a>
            <button
              className="btn btn-ghost"
              disabled={busy}
              onClick={async () => {
                if (
                  await confirm(
                    t(
                      'Delete this dataset and recalculate the workspace?',
                      'Usunąć te dane i przeliczyć prognozę?',
                    ),
                  ) &&
                  (await submit('data/' + kind + '/remove'))
                ) {
                  clear();
                  setNotice(t('Dataset removed.', 'Usunięto dane.'));
                }
              }}
            >
              {t('Delete data', 'Usuń dane')}
            </button>
          </>
        )}
      </div>
      {upload && (
        <div className="data-preview">
          <h4>
            {t('Review columns', 'Sprawdź kolumny')} · {upload.count}{' '}
            {t('rows', 'wierszy')}
          </h4>
          <details key={upload.filename} open={!ready || undefined}><summary>{t("Column matching", "Dopasowanie kolumn")} · {Object.values(upload.mapping).filter(Boolean).length}</summary>
          <p>
            {upload.model_used
              ? t(
                  'Qwen suggested the mapping. Check the examples before importing.',
                  'Qwen zaproponował dopasowanie. Sprawdź przykłady przed importem.',
                )
              : t(
                  'Check the matched columns and choose any missing fields.',
                  'Sprawdź dopasowane kolumny i wybierz brakujące pola.',
                )}
          </p>
          <div className="data-map">
            {Object.entries(upload.mapping).map(([field, col]) => (
              <label key={field}>
                {field}
                {upload.optional.includes(field) ? '' : ' *'}
                <select
                  value={col}
                  onChange={(e) =>
                    setUpload({
                      ...upload,
                      mapping: { ...upload.mapping, [field]: e.target.value },
                    })
                  }
                >
                  <option value="">
                    {t('Select column', 'Wybierz kolumnę')}
                  </option>
                  {upload.headers.map((h) => (
                    <option
                      key={h}
                      disabled={
                        col !== h && Object.values(upload.mapping).includes(h)
                      }
                    >
                      {h}
                    </option>
                  ))}
                </select>
                {!col && !upload.optional.includes(field) ? (
                  <input
                    aria-label={
                      t('Fixed value for ', 'Stała wartość dla ') + field
                    }
                    placeholder={t(
                      'Or enter a fixed value',
                      'Lub podaj stałą wartość',
                    )}
                    value={upload.constants[field] || ''}
                    onChange={(e) =>
                      setUpload({
                        ...upload,
                        constants: {
                          ...upload.constants,
                          [field]: e.target.value,
                        },
                      })
                    }
                  />
                ) : (
                  <small>{col ? upload.sample[0][col] : '—'}</small>
                )}
              </label>
            ))}
          </div>
          </details>
          {stale && (
            <p role="alert">
              {t(
                'Workspace changed. Select the file again.',
                'Dane uległy zmianie. Wybierz plik ponownie.',
              )}
            </p>
          )}
          <div className="data-tools">
            <button
              className="btn btn-primary"
              disabled={busy || !ready}
              onClick={async () => {
                if (
                  await submit('data/' + kind + '/import', {
                    filename: upload.filename,
                    content: upload.content,
                    mapping: upload.mapping,
                    constants: Object.fromEntries(
                      Object.entries(upload.constants).filter(
                        ([k, v]) => !upload.mapping[k] && v.trim(),
                      ),
                    ),
                    revision: upload.revision,
                  })
                ) {
                  clear();
                  setNotice(
                    t(
                      'Imported. Forecast updated.',
                      'Zaimportowano. Prognoza zaktualizowana.',
                    ),
                  );
                }
              }}
            >
              {info.present
                ? t('Replace dataset', 'Zastąp dane')
                : t('Import dataset', 'Importuj dane')}
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={clear}>
              {t('Cancel', 'Anuluj')}
            </button>
          </div>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}

export default function Data() {
  const { t } = usePreferences();
  return (
    <>
      <p className="card-sub">
        {t(
          'Upload UTF-8 CSV, delimited TXT, or a JSON array of records. Each import replaces one dataset.',
          'Wgraj CSV w UTF-8, TXT z separatorami lub tablicę rekordów JSON. Import zastępuje jeden zestaw danych.',
        )}
      </p>
      {datasets.map(([kind, en, pl, desc, opis]) => (
        <Dataset
          key={kind}
          kind={kind}
          title={t(en, pl)}
          description={t(desc, opis)}
        />
      ))}
    </>
  );
}
