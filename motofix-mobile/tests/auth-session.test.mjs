import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createAuthSessionController, getMobileHomeRoute, manageSessionRefresh } from '../lib/authSession.js';

const sessionFor = (id = 'customer-1', token = 'original') => ({ user: { id }, access_token: token });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
async function until(check) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await delay(2);
  }
  assert.fail('Timed out waiting for state');
}

function fixture({ session = null, role = 'customer', getSession, profile } = {}) {
  let listener;
  let insideAuthCallback = false;
  let profileCalls = 0;
  let unsubscribeCalls = 0;
  let currentState;
  const client = {
    auth: {
      getSession: getSession || (async () => ({ data: { session }, error: null })),
      onAuthStateChange(callback) {
        listener = callback;
        return { data: { subscription: { unsubscribe() { unsubscribeCalls += 1; listener = null; } } } };
      },
    },
    from(table) {
      assert.equal(insideAuthCallback, false, 'Database call must run after the auth lock is released');
      assert.equal(table, 'profiles');
      profileCalls += 1;
      const query = {
        select() { return query; },
        eq(_column, id) { query.id = id; return query; },
        maybeSingle() { return profile ? profile(query.id) : Promise.resolve({ data: { role }, error: null }); },
      };
      return query;
    },
  };
  const controller = createAuthSessionController(client, (state) => { currentState = state; });
  return {
    controller,
    get state() { return currentState; },
    get profileCalls() { return profileCalls; },
    get unsubscribeCalls() { return unsubscribeCalls; },
    emit(event, nextSession) {
      insideAuthCallback = true;
      try {
        const returned = listener?.(event, nextSession);
        assert.equal(returned, undefined, 'Auth callback must be synchronous');
      } finally { insideAuthCallback = false; }
    },
  };
}

test('a fresh install shows login without requesting a profile', async (t) => {
  const f = fixture(); t.after(() => f.controller.stop());
  await f.controller.start();
  assert.equal(f.state.session, null);
  assert.equal(f.state.loading, false);
  assert.equal(f.profileCalls, 0);
});

test('restores a saved session after closing and starting a new app instance', async (t) => {
  const saved = sessionFor();
  const first = fixture({ session: saved });
  await first.controller.start(); await until(() => first.state?.role === 'customer');
  first.controller.stop();
  const reopened = fixture({ session: saved }); t.after(() => reopened.controller.stop());
  await reopened.controller.start(); await until(() => reopened.state?.role === 'customer');
  assert.equal(reopened.state.session, saved);
  assert.equal(getMobileHomeRoute(reopened.state.role), 'Main');
});

test('sign in returns immediately without running profile work under the auth lock', async (t) => {
  const f = fixture(); t.after(() => f.controller.stop());
  await f.controller.start();
  f.emit('SIGNED_IN', sessionFor());
  assert.equal(f.profileCalls, 0);
  await until(() => f.state.role === 'customer');
  assert.equal(f.state.loading, false);
});

test('a mechanic is routed using the normalized database role', async (t) => {
  const f = fixture({ session: sessionFor('mechanic-1'), role: ' Mechanic ' });
  t.after(() => f.controller.stop());
  await f.controller.start(); await until(() => !f.state.loading);
  assert.equal(getMobileHomeRoute(f.state.role), 'MechanicMain');
});

test('web-only and missing roles never receive a mobile home route', () => {
  for (const role of ['admin', 'super_admin', 'super-admin', 'superadmin', 'staff', 'cashier', 'unknown', null, '']) {
    assert.equal(getMobileHomeRoute(role), null);
  }
  assert.equal(getMobileHomeRoute(' User '), 'Main');
});

test('token refresh updates the session without reloading the role or navigation', async (t) => {
  const f = fixture({ session: sessionFor() }); t.after(() => f.controller.stop());
  await f.controller.start(); await until(() => f.state.role === 'customer');
  const calls = f.profileCalls;
  f.emit('TOKEN_REFRESHED', sessionFor('customer-1', 'refreshed'));
  f.emit('SIGNED_IN', sessionFor('customer-1', 'refreshed-again'));
  assert.equal(f.state.session.access_token, 'refreshed-again');
  assert.equal(f.state.loading, false);
  assert.equal(f.state.role, 'customer');
  await delay(5); assert.equal(f.profileCalls, calls);
});

test('a temporary profile error preserves the session and supports retry', async (t) => {
  let online = false;
  const saved = sessionFor();
  const f = fixture({ session: saved, profile: async () => online
    ? { data: { role: 'customer' }, error: null }
    : { data: null, error: { message: 'Network request failed' } } });
  t.after(() => f.controller.stop());
  await f.controller.start(); await until(() => !!f.state.error);
  assert.equal(f.state.session, saved); assert.equal(f.state.loading, false);
  online = true; f.controller.retry(); await until(() => f.state.role === 'customer');
  assert.equal(f.state.error, null);
});

test('a missing profile stays blocked and does not default to customer', async (t) => {
  const f = fixture({ session: sessionFor(), profile: async () => ({ data: null, error: null }) });
  t.after(() => f.controller.stop());
  await f.controller.start(); await until(() => !!f.state.error);
  assert.equal(f.state.role, null); assert.ok(f.state.session);
});

test('a session restore failure can be retried without deleting stored credentials', async (t) => {
  let online = false;
  const f = fixture({ getSession: async () => online
    ? { data: { session: sessionFor() }, error: null }
    : { data: null, error: { message: 'Connection interrupted' } } });
  t.after(() => f.controller.stop());
  await f.controller.start(); assert.equal(f.state.error, 'Connection interrupted');
  online = true; await f.controller.retry(); await until(() => f.state.role === 'customer');
});

test('sign out clears session and ignores an old in-flight profile response', async (t) => {
  const pending = deferred();
  const f = fixture({ session: sessionFor(), profile: () => pending.promise });
  t.after(() => f.controller.stop());
  await f.controller.start(); await until(() => f.profileCalls === 1);
  f.emit('SIGNED_OUT', null);
  pending.resolve({ data: { role: 'customer' }, error: null }); await delay(5);
  assert.equal(f.state.session, null); assert.equal(f.state.role, null); assert.equal(f.state.loading, false);
});

test('account switching cannot apply the previous account profile', async (t) => {
  const pending = deferred();
  const f = fixture({ session: sessionFor('old-user'), profile: (id) => id === 'old-user'
    ? pending.promise : Promise.resolve({ data: { role: 'mechanic' }, error: null }) });
  t.after(() => f.controller.stop());
  await f.controller.start(); await until(() => f.profileCalls === 1);
  f.emit('SIGNED_IN', sessionFor('new-user'));
  await until(() => f.state.role === 'mechanic');
  pending.resolve({ data: { role: 'customer' }, error: null }); await delay(5);
  assert.equal(f.state.session.user.id, 'new-user'); assert.equal(f.state.role, 'mechanic');
});

test('late initial session lookup cannot overwrite a newer sign in', async (t) => {
  const pending = deferred();
  const f = fixture({ getSession: () => pending.promise }); t.after(() => f.controller.stop());
  const starting = f.controller.start();
  f.emit('SIGNED_IN', sessionFor('new-user'));
  pending.resolve({ data: { session: null }, error: null }); await starting;
  await until(() => f.state.role === 'customer');
  assert.equal(f.state.session.user.id, 'new-user');
});

test('unmount unsubscribes and prevents pending work from updating state', async () => {
  const f = fixture({ session: sessionFor() });
  await f.controller.start(); const state = f.state;
  f.controller.stop(); await delay(5);
  assert.equal(f.unsubscribeCalls, 1); assert.equal(f.profileCalls, 0); assert.equal(f.state, state);
});

test('foreground resumes automatic token refresh, background pauses, cleanup removes listener', () => {
  const calls = []; let onChange;
  const cleanup = manageSessionRefresh({ startAutoRefresh: () => calls.push('start'), stopAutoRefresh: () => calls.push('stop') }, {
    currentState: 'active',
    addEventListener(event, fn) { assert.equal(event, 'change'); onChange = fn; return { remove: () => calls.push('remove') }; },
  });
  onChange('background'); onChange('active'); cleanup();
  assert.deepEqual(calls, ['start', 'stop', 'start', 'remove', 'stop']);
});
