import React from 'react';
import { FIELDS } from '../../shared/skillTaxonomy.js';

export default function FieldSelect({ value, onChange, required = false, id = 'field-of-study' }) {
  const selected = FIELDS.find((f) => f.id === value);
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold mb-1">
        Field of study
      </label>
      <select id={id} required={required} value={value || ''} onChange={(e) => onChange(e.target.value)} className="linkedin-input">
        <option value="" disabled>
          Select your field
        </option>
        {FIELDS.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
      {selected && (
        <p className="mt-1 text-[11px] text-[#666666] dark:text-[#8B949E] leading-snug">
          Your skill radar will show: {selected.axes.map((a) => a.name).join(', ')}.
        </p>
      )}
    </div>
  );
}
