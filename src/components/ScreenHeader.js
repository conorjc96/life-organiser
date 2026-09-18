import React from 'react';
import './ScreenHeader.css';

function ScreenHeader({ eyebrow, title, subtitle }) {
  return (
    <header className="screen-header">
      <div className="screen-header-inner">
        {eyebrow && <p className="screen-header-eyebrow">{eyebrow}</p>}
        <h1 className="screen-header-title">{title}</h1>
        {subtitle && <p className="screen-header-subtitle">{subtitle}</p>}
      </div>
    </header>
  );
}

export default ScreenHeader;
