import React from 'react';
import { CustomSelect } from './ui.jsx';

export function memberVisual(val) {
  if (val?.hadir) return 'present';
  if (val?.izin) return 'permitted';
  if (val?.alpha) return 'explicit-alpha';
  return 'untouched';
}

export default function MemberRow({ m, val, absenceOptions = [], onHadir, onIzin, onAlpha }) {
  const state = memberVisual(val);
  const locked = state === 'permitted' || state === 'explicit-alpha';
  const displayName = m.nickname || m.full_name;
  return (
    <div className={`member-row is-${state}`} data-state={state}>
      <input
        type="checkbox"
        checked={state === 'present'}
        disabled={locked}
        onChange={(e) => onHadir(m.id, e.target.checked)}
        aria-label={`Hadir ${displayName}`}
      />
      <span className="member-name">{displayName}</span>
      <span className="member-controls">
        <CustomSelect
          value={val?.izin || ''}
          ariaLabel={`Izin ${displayName}`}
          placeholder="Tidak ada izin"
          disabled={state === 'present' || state === 'explicit-alpha'}
          options={[{ value: '', label: 'Tidak ada izin' }, ...absenceOptions.map((t) => ({ value: t.name, label: t.name }))]}
          onChange={(v) => onIzin(m.id, v)}
        />
        <button
          type="button"
          className="alpha-btn"
          aria-pressed={state === 'explicit-alpha'}
          aria-label={state === 'explicit-alpha' ? `Batalkan Alpha ${displayName}` : `Tandai Alpha ${displayName}`}
          title={state === 'explicit-alpha' ? 'Batalkan Alpha' : 'Tandai Alpha'}
          disabled={state === 'present' || state === 'permitted'}
          onClick={() => onAlpha(m.id)}
        >
          A
        </button>
      </span>
    </div>
  );
}
