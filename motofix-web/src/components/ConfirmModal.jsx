import { useEffect, useId, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

const TONE_CLASSES = {
  primary:
    'bg-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-500',
  danger:
    'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
  warning:
    'bg-amber-500 text-white hover:bg-amber-600 focus-visible:ring-amber-500',
  success:
    'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500',
};

const TONE_ICON_CLASSES = {
  primary:
    'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300',
  danger:
    'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
  warning:
    'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  success:
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
};

const ICONS = {
  primary: '✓',
  danger: '!',
  warning: '!',
  success: '✓',
};

function normalizeDialogOptions(options, defaults = {}) {
  if (options && typeof options === 'object' && !Array.isArray(options)) {
    return { ...defaults, ...options };
  }

  const text = String(options || defaults.message || '').trim();
  const paragraphs = text
    .split(/\n\s*\n|\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  const firstLine = paragraphs[0] || defaults.title || 'Please Confirm';
  const canUseFirstLineAsTitle =
    firstLine.length <= 90 && /[?!:]$/.test(firstLine);

  if (canUseFirstLineAsTitle) {
    return {
      ...defaults,
      title: firstLine.replace(/[?!:]$/, '').trim(),
      message:
        paragraphs.slice(1).join('\n\n') ||
        defaults.message ||
        firstLine,
    };
  }

  return {
    ...defaults,
    message: text || defaults.message,
  };
}

export function ConfirmModal({
  open,
  mode = 'confirm',
  title = 'Please Confirm',
  message = 'Are you sure you want to continue?',
  details = [],
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'primary',
  busy = false,
  defaultValue = '',
  inputLabel = 'Value',
  inputPlaceholder = '',
  inputType = 'text',
  onConfirm,
  onCancel,
}) {
  const confirmRef = useRef(null);
  const inputRef = useRef(null);

  const uniqueId = useId();
  const titleId = `${uniqueId}-title`;
  const messageId = `${uniqueId}-message`;
  const inputId = `${uniqueId}-input`;

  const [inputValue, setInputValue] = useState(
    String(defaultValue || '')
  );

  const isAlert = mode === 'alert';
  const isPrompt = mode === 'prompt';

  const effectiveConfirmLabel =
    confirmLabel ||
    (isAlert ? 'Okay' : isPrompt ? 'Continue' : 'Confirm');

  const toneButtonClass =
    TONE_CLASSES[tone] || TONE_CLASSES.primary;

  const toneIconClass =
    TONE_ICON_CLASSES[tone] || TONE_ICON_CLASSES.primary;

  useEffect(() => {
    if (!open) return undefined;

    setInputValue(String(defaultValue || ''));

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || busy) return;

      event.preventDefault();

      if (isAlert) {
        onConfirm?.(true);
      } else {
        onCancel?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    const focusTimer = window.setTimeout(() => {
      if (isPrompt) {
        inputRef.current?.focus();
        inputRef.current?.select();
      } else {
        confirmRef.current?.focus();
      }
    }, 50);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    open,
    busy,
    defaultValue,
    isAlert,
    isPrompt,
    onCancel,
    onConfirm,
  ]);

  if (!open) return null;

  const detailItems = Array.isArray(details)
    ? details.filter(Boolean)
    : [details].filter(Boolean);

  function closeFromBackdrop(event) {
    if (event.target !== event.currentTarget || busy) return;

    if (isAlert) {
      onConfirm?.(true);
    } else {
      onCancel?.();
    }
  }

  function submitDialog(event) {
    event?.preventDefault?.();

    if (busy) return;

    if (isPrompt) {
      onConfirm?.(inputValue);
      return;
    }

    onConfirm?.(true);
  }

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm sm:p-6"
      role="presentation"
      onMouseDown={closeFromBackdrop}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        onMouseDown={(event) => event.stopPropagation()}
        className="my-auto max-h-[88vh] shrink-0 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-dark-700 dark:bg-dark-800"
        style={{
          width: '440px',
          maxWidth: 'calc(100vw - 32px)',
          minWidth: 0,
          flex: '0 0 auto',
        }}
      >
        <div className="max-h-[calc(88vh-76px)] overflow-y-auto">
          <div className="px-6 pb-5 pt-6">
            <div
              className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-black ${toneIconClass}`}
              aria-hidden="true"
            >
              {ICONS[tone] || ICONS.primary}
            </div>

            <h2
              id={titleId}
              className="text-xl font-black leading-tight text-gray-950 dark:text-white"
            >
              {title}
            </h2>

            {message ? (
              <p
                id={messageId}
                className="mt-3 whitespace-pre-line break-words text-sm leading-6 text-gray-600 dark:text-gray-300"
              >
                {message}
              </p>
            ) : null}

            {detailItems.length > 0 ? (
              <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/70">
                <ul className="space-y-2 text-sm leading-5 text-gray-700 dark:text-gray-200">
                  {detailItems.map((item, index) => (
                    <li
                      key={`${index}-${String(item)}`}
                      className="flex items-start gap-2"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-px shrink-0 font-black text-primary-600 dark:text-primary-400"
                      >
                        •
                      </span>

                      <span className="min-w-0 break-words whitespace-pre-line">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {isPrompt ? (
              <div className="mt-5">
                <label
                  htmlFor={inputId}
                  className="mb-2 block text-xs font-black uppercase tracking-wide text-gray-500 dark:text-gray-400"
                >
                  {inputLabel}
                </label>

                <input
                  ref={inputRef}
                  id={inputId}
                  type={inputType}
                  value={inputValue}
                  onChange={(event) =>
                    setInputValue(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      submitDialog(event);
                    }
                  }}
                  placeholder={inputPlaceholder}
                  autoComplete="off"
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-dark-600 dark:bg-dark-900 dark:text-white"
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 border-t border-gray-100 bg-gray-50/80 px-6 py-4 dark:border-dark-700 dark:bg-dark-900/40 sm:grid-cols-2">
          {!isAlert ? (
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-black text-gray-700 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-600 dark:bg-dark-800 dark:text-gray-200 dark:hover:bg-dark-700"
              style={{ width: '100%', minWidth: 0 }}
            >
              {cancelLabel}
            </button>
          ) : null}

          <button
            ref={confirmRef}
            type="button"
            disabled={busy}
            onClick={submitDialog}
            className={`rounded-2xl px-5 py-3 text-sm font-black shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
              isAlert ? 'sm:col-span-2' : ''
            } ${toneButtonClass}`}
            style={{ width: '100%', minWidth: 0 }}
          >
            {busy ? 'Please wait…' : effectiveConfirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function mountDialog(config, resultMode) {
  if (typeof document === 'undefined') {
    if (resultMode === 'prompt') return Promise.resolve(null);
    if (resultMode === 'confirm') return Promise.resolve(false);

    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.dataset.motofixDialog = 'true';
    document.body.appendChild(host);

    const root = createRoot(host);
    let finished = false;

    const finish = (value) => {
      if (finished) return;
      finished = true;

      window.setTimeout(() => {
        root.unmount();
        host.remove();
        resolve(value);
      }, 0);
    };

    root.render(
      <ConfirmModal
        open
        {...config}
        onConfirm={(value) => {
          if (resultMode === 'prompt') {
            finish(String(value ?? ''));
          } else if (resultMode === 'confirm') {
            finish(true);
          } else {
            finish(undefined);
          }
        }}
        onCancel={() => {
          if (resultMode === 'prompt') {
            finish(null);
          } else if (resultMode === 'confirm') {
            finish(false);
          } else {
            finish(undefined);
          }
        }}
      />
    );
  });
}

export function confirmAction(options = {}) {
  const config = normalizeDialogOptions(options, {
    mode: 'confirm',
    title: 'Please Confirm',
    message: 'Are you sure you want to continue?',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    tone: 'primary',
  });

  return mountDialog(
    {
      ...config,
      mode: 'confirm',
    },
    'confirm'
  );
}

export function alertAction(options = {}) {
  const config = normalizeDialogOptions(options, {
    mode: 'alert',
    title: 'Notice',
    message: '',
    confirmLabel: 'Okay',
    tone: 'warning',
  });

  return mountDialog(
    {
      ...config,
      mode: 'alert',
    },
    'alert'
  );
}

export function promptAction(options = {}, defaultValue = '') {
  const config = normalizeDialogOptions(options, {
    mode: 'prompt',
    title: 'Enter Information',
    message: '',
    confirmLabel: 'Continue',
    cancelLabel: 'Cancel',
    tone: 'primary',
    inputLabel: 'Reference / Value',
    inputPlaceholder: 'Enter value',
  });

  return mountDialog(
    {
      ...config,
      mode: 'prompt',
      defaultValue:
        config.defaultValue !== undefined
          ? config.defaultValue
          : defaultValue,
    },
    'prompt'
  );
}