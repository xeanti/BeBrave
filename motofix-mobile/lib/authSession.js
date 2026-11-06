export const INITIAL_AUTH_STATE = {
  session: null,
  role: null,
  loading: true,
  error: null,
};

export function normalizeMobileRole(role) {
  return String(role || '').trim().toLowerCase();
}

export function getMobileHomeRoute(role) {
  const normalized = normalizeMobileRole(role);
  if (normalized === 'customer' || normalized === 'user') return 'Main';
  if (normalized === 'mechanic') return 'MechanicMain';
  return null;
}

// Auth callbacks must return immediately. Supabase holds its auth lock while
// notifying subscribers, so even a database query inside one can deadlock login.
export function createAuthSessionController(client, onChange) {
  let state = { ...INITIAL_AUTH_STATE };
  let active = false;
  let subscription;
  let timer;
  let generation = 0;
  let authRevision = 0;

  function update(patch) {
    if (!active) return;
    state = { ...state, ...patch };
    onChange(state);
  }

  function loadRole(session) {
    clearTimeout(timer);
    const request = ++generation;
    update({ session, role: null, loading: true, error: null });

    timer = setTimeout(async () => {
      try {
        const { data, error } = await client
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .maybeSingle();

        if (error) throw error;
        if (!data?.role) throw new Error('No account role was found. Please contact MotoFix support.');
        if (active && request === generation) {
          update({ role: normalizeMobileRole(data.role), loading: false });
        }
      } catch (error) {
        // A temporary connection/profile failure must not destroy a valid session.
        if (active && request === generation) {
          update({ loading: false, error: error?.message || 'Unable to load your account. Please retry.' });
        }
      }
    }, 0);
  }

  function acceptSession(session) {
    if (!active) return;
    authRevision += 1;
    if (!session?.user?.id) {
      generation += 1;
      clearTimeout(timer);
      update({ session: null, role: null, loading: false, error: null });
      return;
    }

    if (state.session?.user?.id === session.user.id) {
      // Token refresh must not reset navigation, reload the cart, or request
      // notification permission again. Retry failed profile loads explicitly.
      update({ session });
      return;
    }

    loadRole(session);
  }

  async function restoreSession() {
    const revision = authRevision;
    update({ loading: true, error: null });
    try {
      const { data, error } = await client.auth.getSession();
      if (!active || revision !== authRevision) return;
      if (error) throw error;
      acceptSession(data?.session);
    } catch (error) {
      if (active && revision === authRevision) {
        update({ loading: false, error: error?.message || 'Unable to restore your session. Please retry.' });
      }
    }
  }

  return {
    start() {
      active = true;
      ({ data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
        acceptSession(session);
      }));
      return restoreSession();
    },
    retry() {
      if (state.session?.user?.id) {
        loadRole(state.session);
        return;
      }
      return restoreSession();
    },
    stop() {
      active = false;
      generation += 1;
      clearTimeout(timer);
      subscription?.unsubscribe();
    },
  };
}

export function manageSessionRefresh(auth, appState) {
  function handleState(state) {
    const operation = state === 'active' ? auth.startAutoRefresh() : auth.stopAutoRefresh();
    Promise.resolve(operation).catch((error) => {
      console.log('Session refresh error:', error?.message);
    });
  }

  handleState(appState.currentState);
  const listener = appState.addEventListener('change', handleState);
  return () => {
    listener.remove();
    auth.stopAutoRefresh();
  };
}
