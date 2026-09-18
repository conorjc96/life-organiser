import React from 'react';
import './ScreenHeader.css';

function ScreenHeader({ eyebrow, title, subtitle }) {
  return (
    <header className="screen-header">
      {eyebrow && <p className="screen-header-eyebrow">{eyebrow}</p>}
      <h1 className="screen-header-title">{title}</h1>
      {subtitle && <p className="screen-header-subtitle">{subtitle}</p>}
    </header>
  );
}

export default ScreenHeader;
