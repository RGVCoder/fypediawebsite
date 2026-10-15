import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(path.resolve(import.meta.dirname, '../dist/app.js'), 'utf8');

function appContext(config = { useMockData: true }) {
  const storage = new Map();
  const app = { innerHTML: '' };
  const modal = { innerHTML: '' };
  const toast = { textContent: '', classList: { add() {}, remove() {} } };
  const context = vm.createContext({
    window: { FYPEDIA_CONFIG: config, location: { pathname: '/', origin: 'http://localhost:4173' } },
    location: { pathname: '/', search: '', hash: '' },
    document: {
      body: { dataset: {} },
      querySelector: () => ({ content: '' }),
      querySelectorAll: () => [],
      getElementById: id => ({ app, 'modal-root': modal, toast })[id],
      addEventListener() {}
    },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    URLSearchParams, URL, Headers, crypto, structuredClone, setTimeout, clearTimeout, console
  });
  vm.runInContext(source, context);
  return { context, app, storage };
}

test('custom topic rejects links and duplicate names without changing the library', () => {
  const { context } = appContext();
  vm.runInContext('state.profile = { favoriteTopics: ["Black holes"], displayName: "Learner", localPreview: true }; addTopicTitle("https://example.com"); addTopicTitle("black holes");', context);
  assert.equal(vm.runInContext('state.profile.favoriteTopics.length', context), 1);
  vm.runInContext('addTopicTitle("Astronomy")', context);
  assert.equal(vm.runInContext('state.profile.favoriteTopics[1]', context), 'Astronomy');
});

test('a knowledge check cannot be answered twice and skipping advances the clip', async () => {
  const { context } = appContext();
  vm.runInContext(`state.profile = { favoriteTopics: ["Black holes"], displayName: "Learner", localPreview: true };
    state.session = { topicId: "black-holes", videos: [{demo:true,id:"one"},{demo:true,id:"two"}], index:0, answers:[], questionOpen:true, completedRecorded:false, startedAt:Date.now() };
    state.screen = "session";`, context);
  await vm.runInContext('handleAction("answer", { dataset: { answer: "0" } })', context);
  await vm.runInContext('handleAction("answer", { dataset: { answer: "1" } })', context);
  assert.equal(vm.runInContext('state.session.answers[0].selected', context), 0);
  await vm.runInContext('handleAction("skip-question", { dataset: {} })', context);
  assert.equal(vm.runInContext('state.session.index', context), 1);
  assert.equal(vm.runInContext('state.session.answers.filter(Boolean).length', context), 1);
});

test('featured search requests retain the native topic-specific filters', () => {
  const { context } = appContext();
  const request = vm.runInContext('topicSearchRequest(TOPICS.find(topic => topic.id === "personal-finance"))', context);
  assert.equal(request.queries[0], 'personal finance basics for beginners #shorts');
  assert.ok(request.excludedKeywords.includes('get rich quick'));
  assert.ok(request.preferredChannels.includes('NerdWallet'));
});

test('web authentication offers Google but no Apple entry point', () => {
  const { context } = appContext();
  const html = vm.runInContext('renderAuth()', context);
  assert.match(html, /Continue with Google/);
  assert.doesNotMatch(html, /Sign in with Apple|Continue with Apple/);
  assert.doesNotMatch(html, /Explore locally|continue-local/);
});

test('a saved local preview cannot bypass live authentication', () => {
  const { context, storage } = appContext({ useMockData: false });
  storage.set('fypedia-web-state', JSON.stringify({ profile: { id: 'old-preview', localPreview: true, onboardingCompleted: true } }));
  assert.equal(vm.runInContext('loadState().screen', context), 'loading');
});

test('learning statistics are restored only for the matching account id', () => {
  const { context, storage } = appContext();
  storage.set('fypedia-web-account-user-a', JSON.stringify({ stats: { dailyMinutes: 7, totalMinutes: 21, completedSessions: 2, topicStats: {} } }));
  vm.runInContext('restoreAccountData("user-b")', context);
  assert.equal(vm.runInContext('state.stats.completedSessions', context), 0);
  vm.runInContext('restoreAccountData("user-a")', context);
  assert.equal(vm.runInContext('state.stats.completedSessions', context), 2);
});
