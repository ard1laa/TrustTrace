import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';

/**
 * Dedicated <BrandLogo /> Component
 * Loads `/logo.png` (or `/logo.svg` or custom override) from the `public/` folder
 * with an automatic clean fallback.
 */
export default function BrandLogo({ size = 'md', showText = true, customLogoUrl = '' }) {
  const [imgError, setImgError] = useState(false);
  const src = customLogoUrl || '/logo.png';

  const dimensions = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14'
  }[size] || 'w-10 h-10';

  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      <div
        className={`${dimensions} rounded-lg bg-[#EBF3FB] dark:bg-[#161B22] border border-[#0A66C2]/20 dark:border-[#30363D] flex items-center justify-center overflow-hidden shrink-0 shadow-sm`}
      >
        {!imgError ? (
          <img
            src={src}
            alt="TrustTrace Logo"
            className="w-full h-full object-contain p-0.5"
            onError={() => setImgError(true)}
          />
        ) : (
          <ShieldCheck className="w-6 h-6 text-[#0A66C2]" />
        )}
      </div>
      {showText && (
        <div className="flex flex-col leading-none">
          <div className="flex items-center gap-1.5">
            <span className="font-bold tracking-tight text-lg text-[#191919] dark:text-white">
              Trust<span className="text-[#0A66C2] dark:text-[#58A6FF]">Trace</span>
            </span>
            <span className="hidden sm:inline-block text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#EBF3FB] text-[#0A66C2] dark:bg-[#0A66C2]/20 dark:text-[#58A6FF] border border-[#0A66C2]/20">
              ERC-5192
            </span>
          </div>
          <span className="text-[11px] text-[#666666] dark:text-[#8B949E] font-medium mt-0.5">
            Micro-Credential &amp; Skill Network
          </span>
        </div>
      )}
    </div>
  );
}
