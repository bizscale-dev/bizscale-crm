'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { submitEodReport, getWebClientPages } from './actions';

const BRAND_COLOR = 'var(--primary)';

// Not-yet-submitted entries are kept in localStorage too — a manager can lose
// nothing but React state, and a redeploy invalidating the page's server action
// references (the "unexpected response" error, unrelated to this app's own code)
// means the fix is a reload, which would otherwise wipe out everything they'd
// staged. Scoped per browser/device, not shared with the server — purely a local
// safety net until a real submit succeeds.
const STAGED_STORAGE_KEY = 'bizscale-eod-staged-seo-manager-v1';

// Groups a flat list of entries first by client/heading name, then within each
// client by the exact (work done, description) pair — so pages saved together in
// one go (same work done/description, e.g. several pages picked in a single Save)
// collapse into one block listing every page once, while a later save for the same
// client with different work still shows as its own separate block underneath the
// same name.
function groupEntriesForDisplay(entries, { nameKey, workKey, descKey }) {
  const clientGroups = [];
  const byClient = new Map();
  entries.forEach(e => {
    const name = e[nameKey];
    if (!byClient.has(name)) {
      const group = { name, workGroups: [] };
      byClient.set(name, group);
      clientGroups.push(group);
    }
    const clientGroup = byClient.get(name);
    const workDone = e[workKey];
    const description = e[descKey] || '';
    let workGroup = clientGroup.workGroups.find(w => w.workDone === workDone && w.description === description);
    if (!workGroup) {
      workGroup = { workDone, description, items: [] };
      clientGroup.workGroups.push(workGroup);
    }
    workGroup.items.push(e);
  });
  return clientGroups;
}

const labelStyle = {
  display: 'block',
  marginBottom: '0.4rem',
  fontSize: '0.75rem',
  fontWeight: '600',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
};

const inputStyle = {
  width: '100%',
  padding: '0.6rem 0.85rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)',
  fontSize: '0.9rem',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const primaryButtonStyle = {
  padding: '0.65rem 1.35rem',
  backgroundColor: BRAND_COLOR,
  color: 'white',
  border: 'none',
  borderRadius: '0.5rem',
  cursor: 'pointer',
  fontWeight: '600',
  fontSize: '0.875rem',
};

const secondaryButtonStyle = {
  padding: '0.65rem 1.35rem',
  backgroundColor: 'transparent',
  color: 'var(--foreground)',
  border: '1px solid var(--border)',
  borderRadius: '0.5rem',
  cursor: 'pointer',
  fontWeight: '600',
  fontSize: '0.875rem',
};

// Reads any staged entries left over from before a reload (or a redeploy that
// invalidated the page's server action references — see the catch block in
// handleSubmit below). Read once via lazy useState initializers rather than an
// effect, so there's no extra render and no risk of briefly showing an empty
// form before the restore lands. Returns [] outside the browser (SSR) or if
// localStorage is unavailable/corrupted.
function readStagedFromStorage() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STAGED_STORAGE_KEY);
    if (!raw) return [];
    const saved = JSON.parse(raw);
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export default function EodReportClient({ webClients, history, today }) {
  const router = useRouter();

  // 'select' -> pick a web client, 'page' -> pick which page(s) on that site,
  // 'details' -> fill in work done + description, 'saved' -> add more or submit
  const [step, setStep] = useState(() => (readStagedFromStorage().length > 0 ? 'saved' : 'select'));
  const [selectedClientId, setSelectedClientId] = useState('');
  const [manualHeading, setManualHeading] = useState('');
  const [pageLoading, setPageLoading] = useState(false);
  const [pages, setPages] = useState([]);
  const [pageFetchError, setPageFetchError] = useState(null);
  const [allowManualPage, setAllowManualPage] = useState(false);
  const [selectedPageUrls, setSelectedPageUrls] = useState([]);
  const [manualPageUrls, setManualPageUrls] = useState('');
  const [workDone, setWorkDone] = useState('');
  const [description, setDescription] = useState('');
  const [staged, setStaged] = useState(readStagedFromStorage);
  const [lastSavedCount, setLastSavedCount] = useState(() => readStagedFromStorage().length || 1);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedReportId, setExpandedReportId] = useState(null);

  useEffect(() => {
    try {
      if (staged.length > 0) {
        window.localStorage.setItem(STAGED_STORAGE_KEY, JSON.stringify(staged));
      } else {
        window.localStorage.removeItem(STAGED_STORAGE_KEY);
      }
    } catch {
      // localStorage unavailable — staged entries just won't survive a reload.
    }
  }, [staged]);

  const selectedClient = webClients.find(c => String(c.id) === String(selectedClientId));
  const entryLabel = selectedClient?.label || manualHeading.trim();
  const manualPageList = manualPageUrls.split('\n').map(u => u.trim()).filter(Boolean);
  const chosenPageUrls = allowManualPage
    ? [...new Set([...selectedPageUrls, ...manualPageList])]
    : selectedPageUrls;

  const togglePage = (url) => {
    setSelectedPageUrls(current =>
      current.includes(url) ? current.filter(u => u !== url) : [...current, url]
    );
  };

  const handleContinueToPage = async () => {
    if (!selectedClientId && !manualHeading.trim()) {
      setMessage({ type: 'error', text: 'Select a website or enter a heading first' });
      return;
    }
    setMessage(null);
    setPages([]);
    setPageFetchError(null);
    setSelectedPageUrls([]);
    setManualPageUrls('');

    if (!selectedClientId) {
      // Manual heading — there's no real client to fetch a sitemap for, so skip
      // straight to the page step with manual entry available.
      setAllowManualPage(true);
      setStep('page');
      return;
    }

    setPageLoading(true);
    setAllowManualPage(false);
    try {
      const result = await getWebClientPages(selectedClientId);
      if (result.error) {
        setPageFetchError(result.error);
        setAllowManualPage(!!result.allowManual);
      } else {
        setPages(result.pages || []);
      }
    } catch (err) {
      setPageFetchError(err.message);
      setAllowManualPage(true);
    } finally {
      setPageLoading(false);
      setStep('page');
    }
  };

  const handleContinueToDetails = () => {
    setMessage(null);
    setStep('details');
  };

  const handleSave = () => {
    if (!workDone.trim()) {
      setMessage({ type: 'error', text: 'Work done is required' });
      return;
    }
    const trimmedWorkDone = workDone.trim();
    const trimmedDescription = description.trim();
    const pageUrlsToStage = chosenPageUrls.length > 0 ? chosenPageUrls : [null];
    // Manual-heading entries have no real web_clients row — 0 is a sentinel the
    // server/admin viewer treat as "no client", keeping the manually-typed label.
    const webClientId = selectedClientId || 0;
    setStaged(current => [
      ...current,
      ...pageUrlsToStage.map((pageUrl, i) => ({
        key: `${webClientId}-${Date.now()}-${i}`,
        webClientId,
        webClientName: entryLabel,
        pageUrl,
        workDone: trimmedWorkDone,
        description: trimmedDescription,
      })),
    ]);
    setSelectedClientId('');
    setManualHeading('');
    setPages([]);
    setPageFetchError(null);
    setAllowManualPage(false);
    setSelectedPageUrls([]);
    setManualPageUrls('');
    setWorkDone('');
    setDescription('');
    setLastSavedCount(chosenPageUrls.length);
    setStep('saved');
    setMessage(null);
  };

  const handleAddMore = () => {
    setStep('select');
    setMessage(null);
  };

  const handleRemoveStaged = (key) => {
    setStaged(current => {
      const next = current.filter(e => e.key !== key);
      if (next.length === 0) setStep('select');
      return next;
    });
  };

  // Pulls a staged entry back out of the list and into the details form so it can
  // be changed — it's removed from `staged` now and re-added (as a new entry) when
  // Save is clicked again, same as any other entry.
  const handleEditStaged = (key) => {
    const entry = staged.find(e => e.key === key);
    if (!entry) return;

    setStaged(current => current.filter(e => e.key !== key));

    if (entry.webClientId && entry.webClientId !== 0) {
      setSelectedClientId(String(entry.webClientId));
      setManualHeading('');
    } else {
      setSelectedClientId('');
      setManualHeading(entry.webClientName);
    }
    setPages([]);
    setPageFetchError(null);
    setAllowManualPage(true);
    setSelectedPageUrls([]);
    setManualPageUrls(entry.pageUrl || '');
    setWorkDone(entry.workDone);
    setDescription(entry.description || '');
    setStep('details');
    setMessage(null);
  };

  const handleSubmit = async () => {
    if (staged.length === 0) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await submitEodReport(staged.map(e => ({
        webClientId: e.webClientId,
        webClientName: e.webClientName,
        pageUrl: e.pageUrl,
        workDone: e.workDone,
        description: e.description,
      })));

      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setStaged([]);
        setStep('select');
        setMessage({
          type: 'success',
          text: `EOD report submitted for ${result.reportDate} — ${result.entriesAdded} ${result.entriesAdded === 1 ? 'entry' : 'entries'} recorded.`,
        });
        router.refresh();
      }
    } catch (err) {
      // Next.js itself throws this exact generic message when a page's server
      // action reference goes stale after a new deploy — not an error from this
      // app's own code. Reloading picks up the current build; nothing staged is
      // lost since it's also saved to localStorage above.
      const isStaleDeploy = /unexpected response/i.test(err.message || '');
      setMessage({
        type: 'error',
        text: isStaleDeploy
          ? 'The app was updated since this page loaded. Your entries are saved — please reload the page, then submit again.'
          : err.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', margin: 0, marginBottom: '0.5rem' }}>EOD Report</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
          Record the work done on each website today. Add an entry per website, then submit —
          everything is filed under <strong>{today}</strong>. Submitting again later today adds
          to the same report.
        </p>
      </div>

      {message && (
        <div style={{
          backgroundColor: message.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
          color: message.type === 'error' ? 'var(--danger)' : 'var(--success)',
          padding: '1rem',
          borderRadius: '0.5rem',
          border: `1px solid ${message.type === 'error' ? 'var(--danger)' : 'var(--success)'}`,
          fontSize: '0.875rem',
        }}>
          {message.text}
        </div>
      )}

      {webClients.length === 0 ? (
        <div className="card">
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>No active web clients yet.</p>
        </div>
      ) : (
        <div className="card">
          {step === 'select' && (
            <>
              <h2 style={{ fontSize: '1.1rem', margin: 0, marginBottom: '1.25rem' }}>
                {staged.length > 0 ? 'Add another website' : 'Select a website'}
              </h2>
              <div style={{ maxWidth: '420px', marginBottom: '1rem' }}>
                <label style={labelStyle}>Website</label>
                <select
                  value={selectedClientId}
                  onChange={(e) => { setSelectedClientId(e.target.value); if (e.target.value) setManualHeading(''); }}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="">Select a website...</option>
                  {webClients.map(c => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ maxWidth: '420px', marginBottom: '1.25rem' }}>
                <label style={labelStyle}>Or Enter a Heading Manually</label>
                <input
                  type="text"
                  value={manualHeading}
                  onChange={(e) => { setManualHeading(e.target.value); if (e.target.value) setSelectedClientId(''); }}
                  placeholder="e.g. a client not in the list"
                  style={inputStyle}
                />
              </div>
              <button type="button" onClick={handleContinueToPage} disabled={pageLoading} style={{ ...primaryButtonStyle, opacity: pageLoading ? 0.6 : 1, cursor: pageLoading ? 'not-allowed' : 'pointer' }}>
                {pageLoading ? 'Loading pages...' : 'Continue'}
              </button>
            </>
          )}

          {step === 'page' && (
            <>
              <h2 style={{ fontSize: '1.1rem', margin: 0, marginBottom: '0.35rem' }}>
                {entryLabel}
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0, marginBottom: '1.25rem' }}>
                Which page(s) was this work done on? Select as many as apply — the same work
                done/description will be recorded against each one. Optional — leave none
                selected to continue without a specific page.
              </p>

              <div style={{ maxWidth: '640px', marginBottom: '1.25rem' }}>
                {pages.length > 0 && (
                  <div style={{ marginBottom: allowManualPage ? '1rem' : 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <label style={{ ...labelStyle, marginBottom: 0 }}>Pages</label>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {selectedPageUrls.length} selected
                      </span>
                    </div>
                    <div style={{
                      maxHeight: '260px',
                      overflowY: 'auto',
                      border: '1px solid var(--border)',
                      borderRadius: '0.5rem',
                      backgroundColor: 'var(--background)',
                    }}>
                      {pages.map(url => (
                        <label
                          key={url}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.6rem',
                            padding: '0.55rem 0.85rem',
                            borderBottom: '1px solid var(--border)',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedPageUrls.includes(url)}
                            onChange={() => togglePage(url)}
                          />
                          <span style={{ wordBreak: 'break-all' }}>{url}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {pageFetchError && pages.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 0.75rem 0' }}>
                    {pageFetchError}{allowManualPage ? ' — enter the page URL(s) below instead.' : ''}
                  </p>
                )}

                {allowManualPage && (
                  <div>
                    <label style={labelStyle}>Page URL(s)</label>
                    <textarea
                      value={manualPageUrls}
                      onChange={(e) => setManualPageUrls(e.target.value)}
                      placeholder={'https://example.com/some-page/\nhttps://example.com/another-page/'}
                      style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }}
                    />
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: '0.35rem 0 0 0' }}>
                      One page URL per line.
                    </p>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button type="button" onClick={handleContinueToDetails} style={primaryButtonStyle}>Continue</button>
                <button type="button" onClick={() => { setStep('select'); setMessage(null); }} style={secondaryButtonStyle}>
                  Back
                </button>
              </div>
            </>
          )}

          {step === 'details' && (
            <>
              <h2 style={{ fontSize: '1.1rem', margin: 0, marginBottom: '0.35rem' }}>
                {entryLabel}
              </h2>
              <div style={{ margin: '0 0 0.35rem 0' }}>
                {chosenPageUrls.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0, marginBottom: '0.25rem' }}>
                    No specific page selected.
                  </p>
                ) : (
                  <>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0, marginBottom: '0.25rem' }}>
                      {chosenPageUrls.length} {chosenPageUrls.length === 1 ? 'page' : 'pages'} selected:
                    </p>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                      {chosenPageUrls.map(url => (
                        <li key={url} style={{ fontSize: '0.75rem', wordBreak: 'break-all', marginBottom: '0.15rem' }}>
                          <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: BRAND_COLOR, textDecoration: 'none' }}>{url}</a>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0, marginBottom: '1.25rem' }}>
                What was done{chosenPageUrls.length === 1 ? ' on this page' : ' today'}?
                {chosenPageUrls.length > 1 && ' The same work done/description will be recorded against each one.'}
              </p>

              <div style={{ maxWidth: '640px', display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <label style={labelStyle}>Work Done</label>
                  <input
                    type="text"
                    value={workDone}
                    onChange={(e) => setWorkDone(e.target.value)}
                    placeholder="e.g. Published 2 guest posts"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Any extra detail worth recording"
                    style={{ ...inputStyle, minHeight: '110px', resize: 'vertical' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button type="button" onClick={handleSave} style={primaryButtonStyle}>Save</button>
                <button type="button" onClick={() => { setStep('page'); setMessage(null); }} style={secondaryButtonStyle}>
                  Back
                </button>
              </div>
            </>
          )}

          {step === 'saved' && (
            <>
              <h2 style={{ fontSize: '1.1rem', margin: 0, marginBottom: '0.35rem' }}>
                {lastSavedCount === 1 ? 'Entry saved' : `${lastSavedCount} entries saved`}
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0, marginBottom: '1.25rem' }}>
                Add another website, or submit the report as it stands.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button type="button" onClick={handleAddMore} style={secondaryButtonStyle}>+ Add More</button>
                <button type="button" onClick={handleSubmit} disabled={submitting} style={{ ...primaryButtonStyle, opacity: submitting ? 0.6 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}>
                  {submitting ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {staged.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Not yet submitted</h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {staged.length} {staged.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.25rem' }}>
            {groupEntriesForDisplay(staged, { nameKey: 'webClientName', workKey: 'workDone', descKey: 'description' }).map(group => (
              <div key={group.name} style={{ padding: '0.85rem 1rem', border: '1px solid var(--border)', borderRadius: '0.5rem' }}>
                <div style={{ fontWeight: '600', fontSize: '0.9rem', marginBottom: '0.6rem' }}>{group.name}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {group.workGroups.map((wg, wi) => (
                    <div key={wi} style={{ paddingLeft: '0.75rem', borderLeft: '2px solid var(--border)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.5rem' }}>
                        {wg.items.map(entry => (
                          <div key={entry.key} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
                            {entry.pageUrl ? (
                              <div style={{ fontSize: '0.75rem', color: BRAND_COLOR, wordBreak: 'break-all' }}>{entry.pageUrl}</div>
                            ) : (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No specific page</div>
                            )}
                            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                              <button
                                type="button"
                                onClick={() => handleEditStaged(entry.key)}
                                style={{ padding: '0.25rem 0.6rem', backgroundColor: 'transparent', color: BRAND_COLOR, border: `1px solid ${BRAND_COLOR}`, borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.7rem', fontWeight: '600', whiteSpace: 'nowrap' }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveStaged(entry.key)}
                                style={{ padding: '0.25rem 0.6rem', backgroundColor: 'transparent', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.7rem', fontWeight: '600', whiteSpace: 'nowrap' }}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: '0.85rem' }}>{wg.workDone}</div>
                      {wg.description && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{wg.description}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button type="button" onClick={handleSubmit} disabled={submitting} style={{ ...primaryButtonStyle, opacity: submitting ? 0.6 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}>
            {submitting ? 'Submitting...' : `Submit Report (${staged.length})`}
          </button>
        </div>
      )}

      <div className="card">
        <button
          type="button"
          onClick={() => setHistoryOpen(o => !o)}
          style={{
            width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
            color: 'inherit', font: 'inherit', textAlign: 'left',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.1rem', fontWeight: '600' }}>
            🕐 My Previous EODs
            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '999px', padding: '0.1rem 0.55rem' }}>
              {history.length}
            </span>
          </span>
          <span style={{ color: 'var(--text-muted)' }}>{historyOpen ? '▾' : '▸'}</span>
        </button>

        {historyOpen && (
          history.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '1rem 0 0 0' }}>No reports submitted yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '1rem' }}>
              {history.map(report => {
                const siteCount = new Set(report.entries.map(e => e.web_client_name)).size;
                const isOpen = expandedReportId === report.id;
                return (
                  <div key={report.id} style={{ border: '1px solid var(--border)', borderRadius: '0.5rem', overflow: 'hidden' }}>
                    <button
                      type="button"
                      onClick={() => setExpandedReportId(isOpen ? null : report.id)}
                      style={{
                        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.85rem 1rem', backgroundColor: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'inherit', font: 'inherit', textAlign: 'left', gap: '1rem',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{isOpen ? '▾' : '▸'}</span>
                        <span>
                          <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>
                            {report.report_date}{report.report_date === today ? ' (today)' : ''}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                            {report.entries.length} {report.entries.length === 1 ? 'page' : 'pages'} across {siteCount} {siteCount === 1 ? 'site' : 'sites'}
                          </div>
                        </span>
                      </span>
                      <span style={{
                        fontSize: '0.7rem', fontWeight: '600', color: 'var(--success)',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)', padding: '0.25rem 0.65rem', borderRadius: '999px', whiteSpace: 'nowrap',
                      }}>
                        ✓ SUBMITTED
                      </span>
                    </button>

                    {isOpen && (
                      <div style={{ padding: '0 1rem 1rem 1rem', borderTop: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
                          {groupEntriesForDisplay(report.entries, { nameKey: 'web_client_name', workKey: 'work_done', descKey: 'description' }).map(group => (
                            <div key={group.name} style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '0.5rem' }}>
                              <div style={{ fontWeight: '600', fontSize: '0.85rem', marginBottom: '0.5rem' }}>{group.name}</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                {group.workGroups.map((wg, wi) => (
                                  <div key={wi} style={{ paddingLeft: '0.75rem', borderLeft: '2px solid var(--border)' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginBottom: '0.35rem' }}>
                                      {wg.items.map(entry => (
                                        entry.page_url ? (
                                          <a key={entry.id} href={entry.page_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontSize: '0.75rem', color: BRAND_COLOR, wordBreak: 'break-all', textDecoration: 'none' }}>
                                            {entry.page_url}
                                          </a>
                                        ) : (
                                          <div key={entry.id} style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No specific page</div>
                                        )
                                      ))}
                                    </div>
                                    <div style={{ fontSize: '0.85rem' }}>{wg.workDone}</div>
                                    {wg.description && (
                                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{wg.description}</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
