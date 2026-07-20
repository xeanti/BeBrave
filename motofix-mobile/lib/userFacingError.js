function parseMaybeJson(value) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  if (
    (!trimmed.startsWith('{') || !trimmed.endsWith('}')) &&
    (!trimmed.startsWith('[') || !trimmed.endsWith(']'))
  ) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function collectMessages(value, depth = 0, seen = new Set()) {
  if (depth > 4 || value == null) return [];
  if (typeof value === 'string') {
    const parsed = parseMaybeJson(value);
    return parsed ? collectMessages(parsed, depth + 1, seen) : [value];
  }

  if (typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);

  const preferredKeys = [
    'userMessage',
    'message',
    'error_description',
    'error',
    'details',
    'reason',
    'body',
    'context',
  ];

  const messages = [];

  for (const key of preferredKeys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      messages.push(...collectMessages(value[key], depth + 1, seen));
    }
  }

  return messages;
}

function cleanTechnicalText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[nrt]/g, ' ')
    .replace(/[{}[]"]/g, ' ')
    .replace(/(?:status|statusCode|code|hint|details|error)s*:s*/gi, '')
    .replace(/s+/g, ' ')
    .trim();
}

export function getUserFacingError(
  error,
  fallback = 'Unable to complete this request. Please try again.'
) {
  const collected = collectMessages(error);
  const joined = cleanTechnicalText(collected.join(' '));
  const lower = joined.toLowerCase();

  if (
    lower.includes('network request failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('network error') ||
    lower.includes('offline') ||
    lower.includes('internet')
  ) {
    return 'Unable to connect. Check your internet connection, then try again.';
  }

  if (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('gateway timeout')
  ) {
    return 'The AI preview took too long. Please try again in a moment.';
  }

  if (
    lower.includes('jwt') ||
    lower.includes('unauthorized') ||
    lower.includes('not authenticated') ||
    lower.includes('session')
  ) {
    return 'Your session has expired. Sign in again, then retry the AI preview.';
  }

  if (
    lower.includes('forbidden') ||
    lower.includes('permission denied') ||
    lower.includes('not allowed')
  ) {
    return 'This preview request is not permitted. Review your photo and selections, then try again.';
  }

  if (
    lower.includes('payload too large') ||
    lower.includes('request entity too large') ||
    lower.includes('image too large') ||
    lower.includes('413')
  ) {
    return 'The motorcycle photo is too large. Choose a smaller image and try again.';
  }

  if (
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('429')
  ) {
    return 'Too many preview requests were submitted. Please wait a moment and try again.';
  }

  if (
    lower.includes('moderation') ||
    lower.includes('safety') ||
    lower.includes('content policy') ||
    lower.includes('blocked')
  ) {
    return 'The selected photo or customization could not be processed. Use a clear motorcycle photo and try different parts.';
  }

  if (
    lower.includes('upload') ||
    lower.includes('storage') ||
    lower.includes('bucket')
  ) {
    return 'The motorcycle photo could not be uploaded. Choose the photo again and retry.';
  }

  if (
    lower.includes('edge function') ||
    lower.includes('function returned') ||
    lower.includes('internal server') ||
    lower.includes('service unavailable') ||
    lower.includes('bad gateway') ||
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('503')
  ) {
    return 'The AI preview service is temporarily unavailable. Please try again shortly.';
  }

  const looksTechnical =
    !joined ||
    joined.length > 220 ||
    /(?:stack|postgres|supabase|syntaxerror|typeerror|referenceerror|html|<!doctype)/i.test(
      joined
    );

  if (looksTechnical) return fallback;

  return joined;
}
