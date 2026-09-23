import React from 'react';
import './AnimatedCheckbox.css';

// The checkbox and the label text are separate tap targets — the checkbox
// toggles done/not-done, and when `onLabelClick` is given (tasks, not
// activities) tapping the name opens that item's detail dialog instead.
// They used to be one <label> (tapping anywhere toggled the checkbox);
// splitting them is deliberate, not accidental drift — don't recombine
// them into a single wrapping <label> again.
function AnimatedCheckbox({ checked, onChange, label, sublabel, overdue, onLabelClick }) {
  const labelClass = [
    'anim-checkbox-label',
    onLabelClick && 'anim-checkbox-label--clickable',
    checked && 'done',
    overdue && !checked && 'overdue',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className="anim-checkbox">
      <label className="checkbox-hit-target">
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
      </label>
      {onLabelClick ? (
        <button type="button" className={labelClass} onClick={onLabelClick}>
          {label}
          <span className="strike" />
        </button>
      ) : (
        <span className={labelClass}>
          {label}
          <span className="strike" />
        </span>
      )}
      {sublabel && <span className="anim-checkbox-tag">{sublabel}</span>}
    </span>
  );
}

export default AnimatedCheckbox;
