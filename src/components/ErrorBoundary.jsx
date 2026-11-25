import React from 'react';
import { AlertTriangle, RotateCcw, X } from 'lucide-react';

// Catches errors thrown while rendering so one broken screen shows a message
// instead of unmounting the whole app (React's default is a blank page).
//
// variant="page":  full-page message with a Reload button (wraps the app).
// variant="modal": a small dialog with Close (wraps a modal); it resets itself
//                  when `resetKey` changes, e.g. the next time the modal opens.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(`[TrustTrace] ${this.props.name || 'screen'} crashed:`, error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { variant = 'page', name = 'This screen', onClose } = this.props;

    if (variant === 'modal') {
      if (!this.props.open) return null;
      const close = () => {
        this.setState({ error: null });
        onClose?.();
      };
      return (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div className="modal-panel max-w-md p-5 space-y-3" role="alertdialog" aria-modal="true" aria-label={`${name} failed to load`}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-sm">{name} couldn't be displayed</h2>
                <p className="text-xs text-[#666666] dark:text-[#8B949E] mt-1">
                  Something went wrong while showing this window. Your data is safe. Close it and try again; if it keeps happening, reload the page.
                </p>
              </div>
              <button onClick={close} className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[#666666]" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => window.location.reload()} className="linkedin-btn-neutral text-xs">
                <RotateCcw className="w-3.5 h-3.5" /> Reload page
              </button>
              <button type="button" onClick={close} className="linkedin-btn-primary text-xs">
                Close
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#F4F2EE] dark:bg-[#0D1117] text-[#191919] dark:text-white">
        <div role="alert" className="max-w-md w-full rounded-2xl bg-white dark:bg-[#1B1F23] border border-[#E0DFDC] dark:border-[#30363D] p-6 space-y-3 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto" />
          <h1 className="font-bold text-base">TrustTrace hit an unexpected error</h1>
          <p className="text-sm text-[#666666] dark:text-[#8B949E]">
            Your account and credentials are safe on the server. Reloading usually fixes this.
          </p>
          <button type="button" onClick={() => window.location.reload()} className="linkedin-btn-primary mx-auto">
            <RotateCcw className="w-4 h-4" /> Reload
          </button>
        </div>
      </div>
    );
  }
}
