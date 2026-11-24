// Material-style tap ripple for buttons, added with one delegated listener.
// Opt in with the button classes below or `.ripple`; honours reduced motion.
const SELECTOR = '.linkedin-btn-primary, .linkedin-btn-outline, .linkedin-btn-neutral, .ripple';

export function installRipple() {
  if (typeof window === 'undefined' || window.__ttRipple) return;
  window.__ttRipple = true;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (reduced?.matches || e.button > 0) return;
      const host = e.target.closest?.(SELECTOR);
      if (!host || host.disabled || host.getAttribute('aria-disabled') === 'true') return;
      const rect = host.getBoundingClientRect();
      const size = Math.hypot(rect.width, rect.height) * 2;
      const dot = document.createElement('span');
      dot.className = 'tt-ripple';
      dot.style.width = dot.style.height = `${size}px`;
      dot.style.left = `${e.clientX - rect.left - size / 2}px`;
      dot.style.top = `${e.clientY - rect.top - size / 2}px`;
      host.appendChild(dot);
      dot.addEventListener('animationend', () => dot.remove(), { once: true });
    },
    { passive: true }
  );
}
