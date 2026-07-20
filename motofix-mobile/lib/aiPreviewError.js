function extractErrorText(value, depth = 0, seen = new Set()) {
  if (depth > 4 || value == null) return '';

  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || seen.has(value)) return '';

  seen.add(value);

  const keys = [
    'userMessage',
    'message',
    'error_description',
    'error',
    'details',
    'reason',
    'body',
    'context',
  ];

  return keys
    .filter((key) => Object.prototype.hasOwnProperty.call(value, key))
    .map((key) => extractErrorText(value[key], depth + 1, seen))
    .filter(Boolean)
    .join(' ');
}

function normalizeErrorText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[{}[\]"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function getAiPreviewErrorMessage(
  error,
  fallback = 'Unable to generate the AI preview right now. Please try again.'
) {
  const text = normalizeErrorText(extractErrorText(error));

  if (
    text.includes('cannot be previewed visually') ||
    text.includes('non-previewable') ||
    text.includes('consumable')
  ) {
    return 'One or more selected products cannot be shown in AI Preview. Remove non-previewable consumables and try again.';
  }

  if (
    text.includes('select a valid motorcycle photo') ||
    text.includes('select a motorcycle photo first')
  ) {
    return 'Please select a clear motorcycle photo first.';
  }

  if (text.includes('did not return an image')) {
    return 'The AI preview could not be completed. Please try again.';
  }

  if (
    text.includes('network request failed') ||
    text.includes('failed to fetch') ||
    text.includes('network error') ||
    text.includes('offline') ||
    text.includes('internet')
  ) {
    return 'Unable to connect. Check your internet connection, then try again.';
  }

  if (
    text.includes('timeout') ||
    text.includes('timed out') ||
    text.includes('gateway timeout')
  ) {
    return 'The AI preview took too long. Please try again in a moment.';
  }

  if (
    text.includes('jwt') ||
    text.includes('unauthorized') ||
    text.includes('not authenticated') ||
    text.includes('session expired')
  ) {
    return 'Your session has expired. Sign in again, then retry the AI preview.';
  }

  if (
    text.includes('payload too large') ||
    text.includes('request entity too large') ||
    text.includes('image too large') ||
    text.includes('413')
  ) {
    return 'The motorcycle photo is too large. Choose a smaller image and try again.';
  }

  if (
    text.includes('rate limit') ||
    text.includes('too many requests') ||
    text.includes('429')
  ) {
    return 'Too many preview requests were submitted. Please wait a moment and try again.';
  }

  if (
    text.includes('moderation') ||
    text.includes('safety') ||
    text.includes('content policy') ||
    text.includes('blocked')
  ) {
    return 'The selected photo or customization could not be processed. Use a clear motorcycle photo and try different parts.';
  }

  if (
    text.includes('upload') ||
    text.includes('storage') ||
    text.includes('bucket')
  ) {
    return 'The motorcycle photo could not be uploaded. Choose the photo again and retry.';
  }

  if (
    text.includes('edge function') ||
    text.includes('function returned') ||
    text.includes('internal server') ||
    text.includes('service unavailable') ||
    text.includes('bad gateway') ||
    text.includes('500') ||
    text.includes('502') ||
    text.includes('503')
  ) {
    return 'The AI preview service is temporarily unavailable. Please try again shortly.';
  }

  // Never expose an unclassified backend, JSON, HTML, stack, or provider error.
  return fallback;
}
