import React, { useState } from 'react'
import { CopyButton, PanelHeading } from './accountUi'

const REPOSITORY_URL = 'https://github.com/8041q/3dVR'
const REQUIRED_NODE_MAJOR = 22
const REQUIRED_NODE_MINOR = 13
const REQUIRED_NODE_PATCH = 0

function asNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

function bytes(value) {
  const amount = asNumber(value)
  if (amount < 1024) return `${amount} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(amount) / Math.log(1024)) - 1)
  const divisor = 1024 ** (index + 1)
  const valueForUnit = amount / divisor
  return `${valueForUnit.toFixed(valueForUnit >= 10 ? 0 : 1)} ${units[index]}`
}

function toGibibytes(value) {
  const amount = asNumber(value)
  if (amount === 0) return 0
  return Math.round((amount / (1024 ** 3)) * 100) / 100
}

function duration(seconds) {
  const total = Math.floor(asNumber(seconds))
  if (total < 60) return 'Less than a minute'
  const hours = Math.floor(total / 3600)
  const days = Math.floor(hours / 24)
  if (days) return `${days}d ${hours % 24}h`
  const minutes = Math.floor((total % 3600) / 60)
  return `${hours}h ${minutes}m`
}

function Metric({ label, value, detail }) {
  return (
    <section className="account-panel account-server-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </section>
  )
}

function Activity({ events = [] }) {
  const labels = {
    invite: 'Invitation created',
    accept: 'Invitation accepted',
    'temporary-password-issued': 'Temporary password issued',
    'required-password-changed': 'Required password changed',
    'account-update': 'Account updated',
    'account-deletion-scheduled': 'Account deletion scheduled',
    'account-deletion-canceled': 'Account deletion cancelled',
    'account-deletion-completed': 'Account deletion completed',
    'project-access': 'Project access updated',
    'project-create': 'Project created',
    init: 'Owner setup',
    recover: 'Owner recovery',
    assign: 'Project assigned',
  }

  return (
    <section className="account-panel">
      <PanelHeading title="Recent activity" description="Account and project access changes recorded by this installation." />
      {events.length ? (
        <div className="account-table-wrap">
          <table>
            <thead><tr><th>When</th><th>Action</th><th>Account or project</th></tr></thead>
            <tbody>
              {events.map(event => (
                <tr key={event.id}>
                  <td>{new Date(String(event.at).replace(' ', 'T') + (String(event.at).includes('Z') ? '' : 'Z')).toLocaleString()}</td>
                  <td>{labels[event.action] || event.action}</td>
                  <td>{event.target || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="account-help">No activity has been recorded yet.</p>
      )}
    </section>
  )
}

function CheckItem({ label, ok, detail }) {
  return (
    <li className="account-check-item">
      <span
        className={`account-check-dot ${ok ? 'account-check-dot--ok' : 'account-check-dot--bad'}`}
        aria-hidden="true"
      >
        {ok ? (
          <svg viewBox="0 0 16 16" focusable="false">
            <path d="m3.1 8.2 3 3 6.8-6.6" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" focusable="false">
            <path d="M8 1.65 14.45 13H1.55L8 1.65Z" />
            <path d="M8 5.1v3.7" />
            <circle cx="8" cy="11.15" r=".55" />
          </svg>
        )}
      </span>
      <span className="account-check-label">{label}</span>
      {detail && <span className="account-check-detail">{detail}</span>}
    </li>
  )
}

const LIMIT_FIELDS = [
  { key: 'userQuotaBytes', label: 'Per-account media allowance', help: 'Maximum media storage allocated to one account.' },
  { key: 'assetUploadBytes', label: 'Individual upload', help: 'Maximum size of a single uploaded asset.' },
  { key: 'projectSizeBytes', label: 'Project size', help: 'Maximum size of a project ZIP upload or its extracted contents.' },
]

export default function ServerConsole({ data, onRefresh, onNavigate, refreshing = false }) {
  const hosting = data?.hosting || {}
  const server = data?.server || {}
  const usage = data?.usage || {}
  const limits = data?.limits || {}
  const security = data?.security || {}
  const diskTotal = asNumber(hosting.totalBytes)
  const diskFree = asNumber(hosting.freeBytes)
  const diskUsed = diskTotal > 0 ? Math.max(0, diskTotal - diskFree) : 0
  const diskPercent = diskTotal > 0 ? Math.min(100, Math.round(diskUsed / diskTotal * 100)) : 0
  const publicOrigin = server.publicOrigin || location.origin
  const activeAccounts = asNumber(usage.activeAccounts || usage.accounts)

  const [limitEdits, setLimitEdits] = useState({
    userQuotaBytes: 0,
    assetUploadBytes: 0,
    projectSizeBytes: 0,
  })
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [saveError, setSaveError] = useState('')
  const [showLimitDialog, setShowLimitDialog] = useState(false)

  function openLimitDialog() {
    setLimitEdits({
      userQuotaBytes: toGibibytes(limits.userQuotaBytes),
      assetUploadBytes: toGibibytes(limits.assetUploadBytes),
      projectSizeBytes: toGibibytes(limits.projectSizeBytes),
    })
    setSaveMessage('')
    setSaveError('')
    setShowLimitDialog(true)
  }

  function closeLimitDialog() {
    if (saving) return
    setShowLimitDialog(false)
    setSaveError('')
  }

  async function saveLimits(event) {
    event?.preventDefault()
    if (saving) return

    setSaving(true)
    setSaveError('')
    setSaveMessage('')

    try {
      const payload = {
        userQuotaBytes: Math.round(asNumber(limitEdits.userQuotaBytes) * 1024 ** 3),
        assetUploadBytes: Math.round(asNumber(limitEdits.assetUploadBytes) * 1024 ** 3),
        projectSizeBytes: Math.round(asNumber(limitEdits.projectSizeBytes) * 1024 ** 3),
      }

      for (const [key, value] of Object.entries(payload)) {
        const response = await fetch('/api/owner/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        })
        if (!response.ok) {
          throw new Error(`The server rejected the ${key} setting (HTTP ${response.status}).`)
        }
      }

      setSaveMessage('Installation limits saved.')
      setShowLimitDialog(false)
      window.setTimeout(() => setSaveMessage(''), 4000)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save installation limits.')
    } finally {
      setSaving(false)
    }
  }

  function updateLimit(key, value) {
    setLimitEdits(current => ({ ...current, [key]: value }))
  }

  return (
    <>
      <section className="account-server-hero">
        <div className="account-server-hero__content">
          <div className="account-server-hero__header">
            <span className="account-eyebrow">SELF-HOSTED INSTALLATION</span>
            <div className="account-server-hero__title-row">
              <h2>Server overview</h2>
              <span className="account-server-divider" aria-hidden="true">·</span>
              <span className="account-server-status" role="status">
                <span className="account-server-status-dot account-server-status-dot--online" aria-hidden="true" />
                <span>Online</span>
              </span>
            </div>
          </div>
          <p>Live information for this installation. Configuration and secrets remain local to the server.</p>
        </div>
        <div className="account-server-hero__actions">
          <button onClick={onRefresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh status'}</button>
          <CopyButton value={publicOrigin} label="Copy address" />
        </div>
      </section>

      <div className="account-server-metrics">
        <Metric label="Available disk" value={bytes(diskFree)} detail={diskTotal ? `${bytes(diskUsed)} of ${bytes(diskTotal)} used` : 'Disk capacity unavailable'} />
        <Metric label="Projects" value={asNumber(usage.projects)} detail={`${activeAccounts} active ${activeAccounts === 1 ? 'account' : 'accounts'}`} />
        <Metric label="Active sessions" value={asNumber(hosting.activeSessions)} detail={asNumber(usage.pendingDeletionAccounts) ? `${asNumber(usage.pendingDeletionAccounts)} deletion pending` : 'No deletions pending'} />
        <Metric label="Server uptime" value={duration(server.uptimeSeconds)} detail={`${server.appVersion ? `v${server.appVersion}` : 'Atria 3DVR'} · ${server.nodeVersion || 'Node runtime'}`} />
      </div>

      <div className="account-server-columns">
        <section className="account-panel">
          <PanelHeading title="Capacity" description="Disk space is shared by source uploads, processed panoramas, project histories, and account exports." />
          <div className="account-capacity">
            <div className="account-capacity__labels">
              <strong>{diskTotal ? `${diskPercent}% used` : 'Usage unavailable'}</strong>
              <span>{diskTotal ? `${bytes(diskFree)} free` : 'The filesystem did not report total capacity.'}</span>
            </div>
            {diskTotal > 0 && <div className="account-capacity__track" aria-label={`${diskPercent}% of disk space used`}><span style={{ width: `${diskPercent}%` }} /></div>}
            <div className="account-stat-row">
              <span className="account-stat-row__label">Tracked account media</span>
              <span className="account-stat-row__value">{bytes(usage.storageBytes)}</span>
            </div>
            <div className="account-stat-row">
              <span className="account-stat-row__label">Per-account media allowance</span>
              <span className="account-stat-row__value">{bytes(hosting.userQuotaBytes)}</span>
            </div>
          </div>
        </section>
        <section className="account-panel">
          <PanelHeading title="Public access" description="This is the configured application address. It is not inferred from incoming request headers." />
          <div className="account-stat-row">
            <span className="account-stat-row__label">Public address</span>
            <span className="account-stat-row__value"><code>{publicOrigin}</code></span>
          </div>
          <div className="account-stat-row">
            <span className="account-stat-row__label">Connection</span>
            <span className="account-stat-row__value"><span className="account-badge">{server.https ? 'HTTPS configured' : 'Development HTTP'}</span></span>
          </div>
        </section>
      </div>

      <div className="account-server-columns">
        <section className="account-panel">
          <PanelHeading title="Security posture" description="Actual checks performed against this running installation and its configuration." />
          <ul className="account-check-list">
            <CheckItem label="Production environment" ok={security.production === true} detail={security.production === true ? 'Production mode' : 'Development mode'} />
            <CheckItem label="Node.js runtime" ok={security.nodeVersionOk === true} detail={`${server.nodeVersion || 'unknown'} (requires ${REQUIRED_NODE_MAJOR}.${REQUIRED_NODE_MINOR}.${REQUIRED_NODE_PATCH}+)`} />
            <CheckItem label="HTTPS configuration" ok={security.httpsConfigured === true} detail={security.httpsConfigured ? 'Public address uses HTTPS' : 'Public address uses HTTP'} />
            <CheckItem label="Owner authentication" ok={security.ownerMfaConfigured === true} detail={security.ownerMfaConfigured ? 'Owner authenticator configured' : 'Owner authenticator not configured'} />
            <CheckItem label="Registration protection" ok={security.registrationDisabled === true} detail={security.registrationDisabled ? 'Public account registration is disabled' : 'Public account registration is enabled'} />
            <CheckItem label="Authentication storage" ok={security.authStorageValid === true} detail={security.authStorageValid ? 'Auth secret and database accessible' : 'Auth secret or database unavailable'} />
            <CheckItem label="Database integrity" ok={security.databaseIntegrity === true} detail={security.databaseIntegrity ? 'SQLite integrity check passed' : 'SQLite integrity check failed'} />
            <CheckItem label="Storage availability" ok={security.storageAvailable === true} detail={security.storageAvailable ? 'Disk space available' : 'Disk capacity unavailable or exhausted'} />
          </ul>
        </section>

        <section className="account-panel">
          <PanelHeading title="Installation limits" description="Server-wide upload and import limits. These apply globally to all accounts on this installation." />
          <div className="account-stat-row">
            <span className="account-stat-row__label">Per-account media allowance</span>
            <span className="account-stat-row__value">{bytes(hosting.userQuotaBytes)}</span>
          </div>
          <div className="account-stat-row">
            <span className="account-stat-row__label">Individual upload</span>
            <span className="account-stat-row__value">{bytes(limits.assetUploadBytes)}</span>
          </div>
          <div className="account-stat-row">
            <span className="account-stat-row__label">Project size</span>
            <span className="account-stat-row__value">{bytes(limits.projectSizeBytes)}</span>
          </div>
          <div className="account-actions">
            <button className="account-primary" onClick={openLimitDialog}>Change limits</button>
          </div>
          {saveMessage && <p className="account-save-feedback" role="status">{saveMessage}</p>}
        </section>
      </div>

      <section className="account-panel account-server-actions">
        <PanelHeading title="Manage this installation" description="Use the workspace controls for people and account security. Ports, certificates, storage paths, and secrets are intentionally managed on the server itself." />
        <div className="account-actions">
          <button className="account-primary" onClick={() => onNavigate?.('users')}>Manage people</button>
          <button onClick={() => onNavigate?.('security')}>Account security</button>
          <a className="account-button" href={`${REPOSITORY_URL}/blob/main/docs/SERVER_SECURITY.md`} target="_blank" rel="noopener noreferrer">Server security guide <span aria-hidden="true">↗</span></a>
        </div>
      </section>

      <Activity events={data?.events} />

      {showLimitDialog && (
        <div
          className="account-dialog-backdrop account-limit-backdrop"
          onMouseDown={event => {
            if (event.target === event.currentTarget) closeLimitDialog()
          }}
        >
          <section
            className="account-dialog account-limit-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-limit-title"
            aria-describedby="account-limit-description"
            onMouseDown={event => event.stopPropagation()}
          >
            <header className="account-limit-dialog__header">
              <div>
                <span className="account-eyebrow">SERVER CONFIGURATION</span>
                <h2 id="account-limit-title">Change installation limits</h2>
                <p id="account-limit-description">Set the maximum storage and upload sizes used across this installation.</p>
              </div>
              <button className="account-limit-dialog__close" type="button" onClick={closeLimitDialog} disabled={saving} aria-label="Close dialog">×</button>
            </header>

            <form className="account-limit-form" onSubmit={saveLimits}>
              <div className="account-limit-form__intro">
                <strong>Global limits</strong>
                <span>All values are in GiB (1 GiB = 1,024 MiB).</span>
              </div>

              <div className="account-limit-fields">
                {LIMIT_FIELDS.map(field => (
                  <label className="account-limit-field" key={field.key}>
                    <span className="account-limit-field__label">{field.label}</span>
                    <span className="account-limit-input-wrap">
                      <input
                        className="account-limit-input"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        required
                        value={limitEdits[field.key]}
                        onChange={event => updateLimit(field.key, event.target.value)}
                        disabled={saving}
                      />
                      <span className="account-limit-unit">GiB</span>
                    </span>
                    <span className="account-limit-field__help">{field.help}</span>
                  </label>
                ))}
              </div>

              {saveError && <p className="account-limit-error" role="alert">{saveError}</p>}

              <footer className="account-limit-dialog__footer">
                <button type="button" onClick={closeLimitDialog} disabled={saving}>Cancel</button>
                <button className="account-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving limits…' : 'Save limits'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </>
  )
}