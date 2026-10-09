import { useId } from 'react';
import { Check, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { DASHBOARD_LAYOUTS, DEFAULT_DASHBOARD_PREFERENCES, normalizeDashboardPreferences } from './dashboardPreferences';
import './dashboardPreferences.css';

const modules = [
  { id: 'scores', label: 'Player scores', description: 'Accuracy points and closest-pick results.' },
  { id: 'gaps', label: 'Matchup differences', description: 'Your guesses compared with the saved market.' },
  { id: 'history', label: 'Line history', description: 'Changes between recorded market snapshots.' },
  { id: 'connections', label: 'Data connections', description: 'Source availability and connection details.' },
];

function LayoutPreview({ layout }) {
  return <span className={`dashboard-layout-preview dashboard-layout-preview-${layout}`} aria-hidden="true">
    <span className="dashboard-preview-score" /><span className="dashboard-preview-chart" />
    <span className="dashboard-preview-row" /><span className="dashboard-preview-row" /><span className="dashboard-preview-row" />
  </span>;
}

export default function DashboardPreferences({ value, onChange, storageAvailable = true, compact = true, children }) {
  const id = useId();
  const preferences = normalizeDashboardPreferences(value);
  const visibleCount = Object.values(preferences.modules).filter(Boolean).length;
  const change = patch => onChange({ ...preferences, ...patch });
  const contents = <div className="dashboard-preferences-body">
    <p className="dashboard-preferences-storage" role="status">{storageAvailable
      ? 'Saved in this browser on this device. These preferences do not follow your account to other devices.'
      : 'Browser storage is unavailable. Your changes apply to this tab until it closes.'}</p>
    <fieldset className="dashboard-layout-fieldset"><legend>Dashboard layout</legend>
      <p className="dashboard-control-help">Choose how to arrange the same available data. Click a player or matchup to expand its details.</p>
      <div className="dashboard-layout-options">{DASHBOARD_LAYOUTS.map(option => <label className={`dashboard-layout-option${preferences.layout === option.id ? ' is-selected' : ''}`} key={option.id}>
        <input type="radio" name={`${id}-layout`} value={option.id} checked={preferences.layout === option.id} onChange={() => change({ layout: option.id })} />
        <LayoutPreview layout={option.id} />
        <span className="dashboard-layout-label"><strong>{option.label}</strong>{preferences.layout === option.id && <Check size={18} aria-hidden="true" />}</span>
        <span className="dashboard-layout-description">{option.description}</span>
      </label>)}</div>
    </fieldset>
    <fieldset><legend>Visible dashboard sections</legend>
      <p className="dashboard-control-help" id={`${id}-module-help`}>Keep at least one section visible. Hiding a section does not change your picks, scoring or access to analysis.</p>
      <div className="dashboard-checkbox-grid">{modules.map(module => {
        const lastVisible = preferences.modules[module.id] && visibleCount === 1;
        return <label className="dashboard-checkbox-option" key={module.id}>
          <input type="checkbox" checked={preferences.modules[module.id]} disabled={lastVisible} aria-describedby={`${id}-module-help`} onChange={event => change({ modules: { ...preferences.modules, [module.id]: event.target.checked } })} />
          <span><strong>{module.label}</strong><small>{module.description}{lastVisible ? ' Keep one section visible.' : ''}</small></span>
        </label>;
      })}</div>
    </fieldset>
    {children}
    <fieldset><legend>Motion</legend>
      <div className="dashboard-motion-row"><label htmlFor={`${id}-motion`}>Animation preference</label>
        <select id={`${id}-motion`} value={preferences.motion} onChange={event => change({ motion: event.target.value })}>
          <option value="system">Follow device</option><option value="subtle">Subtle</option><option value="reduced">Reduced</option>
        </select>
      </div><p className="dashboard-control-help">Subtle uses short chart and panel transitions. Reduced keeps them still. Your device’s reduced-motion setting is always respected.</p>
    </fieldset>
    <fieldset><legend>Dashboard notices</legend>
      <p className="dashboard-control-help">These notices appear inside the dashboard while you use it. Push, email and text delivery are separate features and are not enabled here.</p>
      <div className="dashboard-checkbox-grid">
        <label className="dashboard-checkbox-option"><input type="checkbox" checked={preferences.notices.marketUpdates} onChange={event => change({ notices: { ...preferences.notices, marketUpdates: event.target.checked } })} /><span><strong>New saved market update</strong><small>Show when a newer collected snapshot is available.</small></span></label>
        <label className="dashboard-checkbox-option"><input type="checkbox" checked={preferences.notices.dataIssues} onChange={event => change({ notices: { ...preferences.notices, dataIssues: event.target.checked } })} /><span><strong>Data availability notices</strong><small>Show a summary when collected data is delayed or a refresh fails. Source ages and required scoring warnings stay visible.</small></span></label>
      </div>
    </fieldset>
    <div className="dashboard-preferences-reset"><button type="button" className="secondary" onClick={() => onChange(normalizeDashboardPreferences(DEFAULT_DASHBOARD_PREFERENCES))}>Reset dashboard preferences</button></div>
  </div>;
  if (!compact) return <section className="dashboard-preferences panel" aria-labelledby={`${id}-title`}><h2 id={`${id}-title`} className="dashboard-preferences-title"><SlidersHorizontal size={20} aria-hidden="true" />Customize dashboard</h2>{contents}</section>;
  return <details className="dashboard-preferences panel"><summary><SlidersHorizontal size={20} aria-hidden="true" /><span><strong>Customize dashboard</strong><small>{DASHBOARD_LAYOUTS.find(option => option.id === preferences.layout).label} · {visibleCount} sections visible</small></span><ChevronDown size={20} aria-hidden="true" /></summary>{contents}</details>;
}
