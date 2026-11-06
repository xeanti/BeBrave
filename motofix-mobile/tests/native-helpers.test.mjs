import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function loadWithMocks(relativePath, mocks) {
  const filename = new URL(relativePath, import.meta.url);
  const context = vm.createContext({ console, setTimeout, clearTimeout });
  const source = new vm.SourceTextModule(await readFile(filename, 'utf8'), { context, identifier: filename.href });
  await source.link((specifier) => {
    assert.ok(Object.hasOwn(mocks, specifier), `Unexpected import: ${specifier}`);
    const values = mocks[specifier];
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  });
  await source.evaluate();
  return source.namespace;
}

function secureStore(data = new Map()) {
  return {
    getItemAsync: async (key) => data.get(key) ?? null,
    setItemAsync: async (key, value) => { data.set(key, value); },
    deleteItemAsync: async (key) => { data.delete(key); },
  };
}

async function loadClient(platform, store) {
  return loadWithMocks('../lib/supabase.js', {
    '@supabase/supabase-js': { createClient: (_url, _key, options) => options },
    'expo-secure-store': store,
    'react-native': { Platform: { OS: platform } },
  });
}

test('native auth storage survives a new client instance and removes only on explicit request', async () => {
  const store = secureStore();
  const first = (await loadClient('android', store)).supabase.auth;
  const saved = JSON.stringify({ access_token: 'saved', refresh_token: 'refresh', user: { id: 'test-user' } });
  await first.storage.setItem('test-session', saved);
  const reopened = (await loadClient('android', store)).supabase.auth;
  assert.equal(await reopened.storage.getItem('test-session'), saved);
  assert.equal(reopened.persistSession, true);
  assert.equal(reopened.autoRefreshToken, true);
  await reopened.storage.removeItem('test-session');
  assert.equal(await reopened.storage.getItem('test-session'), null);
});

test('web client uses Supabase browser storage rather than unsupported native SecureStore', async () => {
  const web = (await loadClient('web', secureStore())).supabase.auth;
  assert.equal(Object.hasOwn(web, 'storage'), false);
  assert.equal(web.persistSession, true);
});

const order = {
  id: '12345678-abcd', receipt_number: 'MFX-TEST', total_amount: 200,
  status: 'completed', payment_status: 'paid', created_at: '2026-10-20T10:00:00Z',
  order_items: [{ quantity: 2, unit_price: 100, subtotal: 200, parts: { name: '<script>part</script>', category: 'Parts' } }],
};

async function receiptFixture({ grantFolder = true, sharing = true, copyError = false } = {}) {
  const calls = [];
  const module = await loadWithMocks('../lib/receiptPdf.js', {
    'react-native': { Platform: { OS: 'android' } },
    'expo-print': { printToFileAsync: async ({ html }) => { calls.push(['print', html]); return { uri: 'file:///cache/receipt.pdf' }; } },
    'expo-sharing': {
      isAvailableAsync: async () => sharing,
      shareAsync: async (uri) => calls.push(['share', uri]),
    },
    'expo-file-system/legacy': {
      documentDirectory: 'file:///documents/', EncodingType: { Base64: 'base64' },
      copyAsync: async ({ to }) => { if (copyError) throw new Error('Copy failed'); calls.push(['copy', to]); },
      readAsStringAsync: async (uri) => { calls.push(['read', uri]); return 'PDF_BASE64'; },
      writeAsStringAsync: async (uri, body) => calls.push(['write', uri, body]),
      StorageAccessFramework: {
        requestDirectoryPermissionsAsync: async () => ({ granted: grantFolder, directoryUri: 'content://downloads' }),
        createFileAsync: async (_dir, name, mime) => { calls.push(['create', name, mime]); return 'content://downloads/receipt.pdf'; },
      },
    },
  });
  return { module, calls };
}

test('Android receipt saves PDF bytes through the SDK 54 legacy filesystem API', async () => {
  const { module, calls } = await receiptFixture();
  const result = await module.saveReceiptPdf({ order });
  assert.equal(result.savedToDownloads, true);
  assert.equal(result.uri, 'content://downloads/receipt.pdf');
  assert.ok(calls.some((call) => call[0] === 'write' && call[2] === 'PDF_BASE64'));
  const html = calls.find((call) => call[0] === 'print')[1];
  assert.ok(html.includes('&lt;script&gt;part&lt;/script&gt;'));
  assert.equal(html.includes('<script>part</script>'), false);
});

test('declining the download folder falls back to the native share dialog', async () => {
  const { module, calls } = await receiptFixture({ grantFolder: false });
  const result = await module.saveReceiptPdf({ order });
  assert.equal(result.savedToDownloads, false);
  assert.ok(calls.some((call) => call[0] === 'share'));
  assert.equal(calls.some((call) => call[0] === 'write'), false);
});

test('receipt copy failure still allows sharing the generated PDF', async () => {
  const { module, calls } = await receiptFixture({ copyError: true });
  const result = await module.shareReceiptPdf({ order });
  assert.equal(result.shared, true);
  assert.ok(calls.some((call) => call[0] === 'share' && call[1] === 'file:///cache/receipt.pdf'));
});

test('unsupported sharing returns a clear result instead of claiming success', async () => {
  const { module } = await receiptFixture({ sharing: false });
  const result = await module.shareReceiptPdf({ order });
  assert.equal(result.shared, false);
});
