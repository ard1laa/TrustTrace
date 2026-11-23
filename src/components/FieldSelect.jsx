import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { programGroups, resolveField } from '../../shared/skillTaxonomy.js';

const GROUPS = programGroups();

// Searchable, grouped programme picker ("Accounting", "Mechanical Engineering", …).
export default function FieldSelect({ value, onChange, required = false, label = 'Field of study', showAxes = true }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef(null);
  const search = useRef(null);
  const list = useRef(null);
  const selected = value ? resolveField(value) : null;

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GROUPS;
    return GROUPS.map((g) => ({
      ...g,
      programs: g.programs.filter((p) => [p.label, g.label, ...p.aliases].some((s) => s.toLowerCase().includes(q)))
    })).filter((g) => g.programs.length);
  }, [query]);
  const flat = useMemo(() => groups.flatMap((g) => g.programs), [groups]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !root.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    setTimeout(() => search.current?.focus(), 0);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (programId) => {
    onChange(programId);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(flat.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flat[active]) choose(flat[active].id);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  let index = -1;
  return (
    <div ref={root} className="relative">
      <label htmlFor={id} className="block text-xs font-semibold mb-1">
        {label}
      </label>
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="linkedin-input flex items-center justify-between gap-2 text-left"
      >
        <span className={`truncate ${selected ? '' : 'text-[#666666] dark:text-[#8B949E]'}`}>
          {selected ? selected.label : 'Search your programme'}
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-[#666666] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {/* Keeps native form validation working for a required picker. */}
      {required && <input tabIndex={-1} aria-hidden="true" required value={value || ''} onChange={() => {}} className="absolute opacity-0 pointer-events-none h-0 w-0 bottom-0 left-4" />}

      {open && (
        <div className="absolute z-30 mt-1.5 w-full linkedin-card p-0 shadow-xl overflow-hidden animate-scale-in">
          <div className="p-2 border-b border-[#E0DFDC] dark:border-[#30363D] flex items-center gap-2">
            <Search className="w-4 h-4 text-[#666666] shrink-0 ml-1" />
            <input
              ref={search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="e.g. Accounting, Law, Nursing"
              aria-label="Search programmes"
              className="w-full bg-transparent text-sm outline-none py-1.5"
            />
          </div>
          <ul ref={list} role="listbox" aria-label={label} className="max-h-72 overflow-y-auto py-1 overscroll-contain">
            {groups.map((g) => (
              <li key={g.id} role="presentation">
                <p className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#666666] dark:text-[#8B949E]">{g.label}</p>
                <ul role="presentation">
                  {g.programs.map((p) => {
                    index += 1;
                    const i = index;
                    const isSel = selected?.id === p.id;
                    return (
                      <li
                        key={p.id}
                        role="option"
                        aria-selected={isSel}
                        data-index={i}
                        onMouseEnter={() => setActive(i)}
                        onMouseDown={(e) => (e.preventDefault(), choose(p.id))}
                        className={`mx-1 px-2.5 py-2 rounded-lg text-sm cursor-pointer flex items-center justify-between gap-2 ${
                          i === active ? 'bg-[#EBF3FB] dark:bg-[#0A66C2]/20' : ''
                        }`}
                      >
                        <span className={isSel ? 'font-semibold text-[#0A66C2] dark:text-[#58A6FF]' : ''}>{p.label}</span>
                        {isSel && <Check className="w-4 h-4 text-[#0A66C2] dark:text-[#58A6FF] shrink-0" />}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
            {!flat.length && <li className="px-4 py-6 text-center text-xs text-[#666666] dark:text-[#8B949E]">No match — choose “Other”.</li>}
          </ul>
        </div>
      )}

      {showAxes && selected && (
        <p className="mt-1.5 text-[11px] text-[#666666] dark:text-[#8B949E] leading-snug">
          Skill radar: {selected.axes.map((a) => a.name).join(' · ')}
        </p>
      )}
    </div>
  );
}
