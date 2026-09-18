import React from 'react';
import ScreenHeader from './ScreenHeader';
import './ComingSoonScreen.css';

function ComingSoonScreen({ icon, title }) {
  return (
    <div className="coming-soon-screen">
      <ScreenHeader title={title} />
      <main className="coming-soon-body">
        <span className="coming-soon-icon" aria-hidden="true">{icon}</span>
        <p className="coming-soon-text">This screen is coming soon.</p>
      </main>
    </div>
  );
}

export default ComingSoonScreen;
