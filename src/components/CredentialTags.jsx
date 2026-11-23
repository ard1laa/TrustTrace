import React from 'react';
import { Award, Code2, Mic2, Trophy, Wrench, Tag } from 'lucide-react';

const TYPE_STYLE = {
  Competition: { icon: Trophy, cls: 'bg-amber-500/10 text-amber-800 dark:text-amber-300' },
  Hackathon: { icon: Code2, cls: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  Workshop: { icon: Wrench, cls: 'bg-teal-500/10 text-teal-700 dark:text-teal-300' },
  Seminar: { icon: Mic2, cls: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  Other: { icon: Tag, cls: 'bg-black/5 dark:bg-white/5 text-[#666666] dark:text-[#8B949E]' }
};

export const CATEGORY_OPTIONS = ['Competition', 'Hackathon', 'Workshop', 'Seminar', 'Other'];

export function categoryStyle(type) {
  return TYPE_STYLE[type] || TYPE_STYLE.Other;
}

// Category and result chips for a credential ("Hackathon", "1st Place").
export function CredentialTags({ credential, className = '' }) {
  const type = credential?.achievementType;
  const result = credential?.requiresScoring ? credential?.achievementResult : '';
  if (!type && !result) return null;
  const { icon: Icon, cls } = categoryStyle(type);
  return (
    <span className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {type && (
        <span className={`chip ${cls}`}>
          <Icon className="w-3 h-3" />
          {type}
        </span>
      )}
      {result && (
        <span className="chip bg-[#0A66C2]/10 text-[#0A66C2] dark:text-[#58A6FF]">
          <Award className="w-3 h-3" />
          {result}
        </span>
      )}
    </span>
  );
}
