import React from 'react';

const SIZES = {
  xs: 'w-7 h-7 text-[10px]',
  sm: 'w-9 h-9 text-xs',
  md: 'w-12 h-12 text-sm',
  lg: 'w-20 h-20 sm:w-24 sm:h-24 text-2xl',
  xl: 'w-28 h-28 text-3xl'
};

export function initialsOf(name = '') {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  );
}

export default function Avatar({ user, size = 'sm', ring = false, className = '' }) {
  const base = `${SIZES[size] || SIZES.sm} rounded-full shrink-0 overflow-hidden flex items-center justify-center font-bold ${
    ring ? 'border-4 border-white dark:border-[#1B1F23] shadow-md' : ''
  } ${className}`;
  if (user?.avatarUrl) {
    return (
      <span className={base}>
        <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
      </span>
    );
  }
  return <span className={`${base} bg-gradient-to-br from-[#0A66C2] to-[#004182] text-white`}>{initialsOf(user?.name)}</span>;
}
