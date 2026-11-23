import React from 'react';
import {
  Wallet,
  ScanLine,
  Building2,
  Sun,
  Moon,
  Monitor,
  PlusCircle,
  Settings,
  LogOut
} from 'lucide-react';
import BrandLogo from './BrandLogo.jsx';
import Avatar from './Avatar.jsx';

export default function Navbar({
  currentUser,
  themeMode,
  setThemeMode,
  draftQueueCount = 0,
  onOpenScanner,
  onOpenProfileModal,
  onLogout,
  customLogoUrl
}) {
  const role = currentUser?.role || 'student';

  const roleBadge = {
    student: { label: 'Student Wallet', route: '/student', icon: Wallet },
    recruiter: { label: 'Recruiter Portal', route: '/recruiter', icon: ScanLine },
    admin: { label: 'University Admin', route: '/admin', icon: Building2 }
  }[role] || { label: 'Student Wallet', route: '/student', icon: Wallet };

  const RoleIcon = roleBadge.icon;

  const themes = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'System', icon: Monitor }
  ];


  return (
    <>
      {/* TOP LINKEDIN-STYLE NAVIGATION BAR */}
      <header className="sticky top-0 z-40 bg-white dark:bg-[#1B1F23] border-b border-[#E0DFDC] dark:border-[#30363D] transition-colors">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2">
          {/* Left: Brand Logo + Active Protected Role Indicator */}
          <div className="flex items-center gap-3">
            <BrandLogo size="md" showText={true} customLogoUrl={customLogoUrl} />

            <div className="hidden sm:flex items-center gap-1.5 pl-3 border-l border-[#E0DFDC] dark:border-[#30363D]">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#EBF3FB] text-[#0A66C2] dark:bg-[#0A66C2]/20 dark:text-[#58A6FF]">
                <RoleIcon className="w-3.5 h-3.5" />
                <span>{roleBadge.label}</span>
                {role === 'admin' && draftQueueCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                    {draftQueueCount}
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Right: Role Action, 3-Way Theme Switcher, Profile Settings & Log Out / Switch Account */}
          <div className="flex items-center gap-2">
            {role === 'student' && (
              <button
                onClick={onOpenScanner}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#0A66C2] hover:bg-[#004182] text-white transition-all shadow-xs"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Upload Certificate</span>
              </button>
            )}

            {/* 3-Way Theme Switcher (Light | Dark | System) */}
            <div
              className="flex items-center bg-[#F4F2EE] dark:bg-[#0D1117] p-0.5 rounded-lg border border-[#E0DFDC] dark:border-[#30363D]"
              role="group"
              aria-label="Theme Switcher"
            >
              {themes.map((t) => {
                const Icon = t.icon;
                const active = themeMode === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setThemeMode(t.id)}
                    title={`${t.label} Theme`}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                      active
                        ? 'bg-white dark:bg-[#1B1F23] text-[#0A66C2] dark:text-[#58A6FF] shadow-xs'
                        : 'text-[#666666] dark:text-[#8B949E] hover:text-[#191919] dark:hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Profile & Settings Trigger */}
            <button
              onClick={onOpenProfileModal}
              className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-full border border-[#E0DFDC] dark:border-[#30363D] hover:bg-[#F4F2EE] dark:hover:bg-[#0D1117] transition-all"
              title="Profile & settings"
            >
              <Avatar user={currentUser} size="xs" />
              <span className="hidden xl:inline text-xs font-semibold truncate max-w-[110px] text-[#191919] dark:text-white">
                {currentUser?.name?.split(' ').slice(0, 2).join(' ')}
              </span>
              <Settings className="w-3.5 h-3.5 text-[#666666] dark:text-[#8B949E]" />
            </button>

            {/* Log Out / Switch Account Button */}
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-[#E0DFDC] dark:border-[#30363D] text-[#404040] dark:text-[#C9D1D9] hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 hover:border-red-500/30 transition-all"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* NATIVE-STYLE MOBILE BOTTOM NAVIGATION BAR (< 768px) */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-[#1B1F23]/95 backdrop-blur-md border-t border-[#E0DFDC] dark:border-[#30363D] px-3 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex items-center justify-around h-14">
          <div className="flex flex-col items-center justify-center gap-0.5 text-[#0A66C2] dark:text-[#58A6FF] font-semibold">
            <RoleIcon className="w-5 h-5" />
            <span className="text-[10px]">{roleBadge.label}</span>
          </div>

          {role === 'student' && (
            <button
              onClick={onOpenScanner}
              className="flex flex-col items-center justify-center -mt-3"
            >
              <div className="w-10 h-10 rounded-full bg-[#0A66C2] text-white flex items-center justify-center shadow-md">
                <PlusCircle className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-semibold text-[#0A66C2] dark:text-[#58A6FF] mt-0.5">
                Upload
              </span>
            </button>
          )}

          <button
            onClick={onOpenProfileModal}
            className="flex flex-col items-center justify-center gap-0.5 text-[#666666] dark:text-[#8B949E]"
          >
            <Avatar user={currentUser} size="xs" />
            <span className="text-[10px]">Profile</span>
          </button>

          <button
            onClick={onLogout}
            className="flex flex-col items-center justify-center gap-0.5 text-[#666666] dark:text-[#8B949E]"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-[10px]">Sign out</span>
          </button>
        </div>
      </nav>
    </>
  );
}
