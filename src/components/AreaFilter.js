import React from 'react';
import './AreaFilter.css';

function AreaFilter({ areas, selectedAreaId, onChange }) {
  return (
    <div className="area-filter">
      <button
        type="button"
        className={selectedAreaId === 'all' ? 'area-chip area-chip--active' : 'area-chip'}
        onClick={() => onChange('all')}
      >
        All
      </button>
      {areas.map((area) => (
        <button
          key={area.id}
          type="button"
          className={
            selectedAreaId === area.id ? 'area-chip area-chip--active' : 'area-chip'
          }
          onClick={() => onChange(area.id)}
        >
          <span aria-hidden="true">{area.icon}</span> {area.name}
        </button>
      ))}
    </div>
  );
}

export default AreaFilter;
