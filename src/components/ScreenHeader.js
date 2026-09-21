import React from 'react';
import './ScreenHeader.css';

function ScreenHeader({ eyebrow, title, subtitle, onBack }) {
  return (
    <header className="screen-header">
      <div className="screen-header-inner">
        {onBack && (
          <button type="button" className="screen-header-back" onClick={onBack}>
            ‹ Back
          </button>
        )}
        {eyebrow && <p className="screen-header-eyebrow">{eyebrow}</p>}
        <h1 className="screen-header-title">{title}</h1>
        {subtitle && <p className="screen-header-subtitle">{subtitle}</p>}
      </div>
    </header>
  );
}

export default ScreenHeader;
