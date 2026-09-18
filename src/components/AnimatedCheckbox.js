import React from 'react';
import './AnimatedCheckbox.css';

function AnimatedCheckbox({ checked, onChange, label, sublabel, overdue }) {
  const labelClass = [
    'anim-checkbox-label',
    checked && 'done',
    overdue && !checked && 'overdue',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <label className="anim-checkbox">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="checkbox-visual">
        <svg className="check-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 12.5L10 17.5L19 7.5"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className={labelClass}>
        {label}
        <span className="strike" />
      </span>
      {sublabel && <span className="anim-checkbox-tag">{sublabel}</span>}
    </label>
  );
}

export default AnimatedCheckbox;
