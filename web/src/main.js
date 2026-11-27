import './style.css';
import * as api from './backend.js';
import { localDateKey, localDateTime, messageTime, previewKind, splitLinks } from './utils.js';

const $ = id => document.getElementById(id);
const state = {
  user: null, member: null, generation: 0, tab: 'chat', signup: false, pinned: false,
  profiles: new Map(), profileRefresh: 0, chatKey: '', events: [],
  month: new Date(new Date().getFullYear(), new Date().getMonth(), 1), selected: localDateKey(new Date()),
  signed: new Map(), chatTimer: null, requestTimer: null
};
let chatObserver, vaultObserver;
let viewerGeneration = 0;

function status(message = '') { $('status').textContent = message; }
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(text, className, action) {
  const node = element('button', text, className);
  node.type = 'button';
  node.addEventListener('click', () => busy(node, action));
  return node;
}
async function busy(control, operation) {
  if (control.disabled) return;
  control.disabled = true;
  status();
  try { await operation(); } catch (error) { status(error.message || String(error)); }
  finally { control.disabled = false; }
}
function stopTimers() {
  clearTimeout(state.chatTimer);
  clearTimeout(state.requestTimer);
  chatObserver?.disconnect();
  vaultObserver?.disconnect();
}
function reset() {
  state.generation++;
  if ($('file-viewer').open) $('file-viewer').close();
  stopTimers();
  state.user = null;
  state.member = null;
  state.pinned = false;
  state.tab = 'chat';
  state.chatKey = '';
  state.profiles.clear();
  state.profileRefresh = 0;
  state.signed.clear();
  state.events = [];
  $('messages').replaceChildren();
  $('events').replaceChildren();
  $('files').replaceChildren();
  $('requests-list').replaceChildren();
  $('requests').hidden = true;
  $('requests-notice').hidden = true;
  $('pinned').textContent = 'Pinned';
  $('pinned').setAttribute('aria-pressed', 'false');
  $('message-text').value = '';
  $('message-text').style.height = '';
  $('chat-file').value = '';
  $('chat-file-name').textContent = '';
  $('vault-file').value = '';
  $('waiting').hidden = true;
  $('workspace').hidden = true;
  $('sign-out').hidden = true;
  $('auth').hidden = false;
  $('password').value = '';
}
function hidePanels() {
  $('auth').hidden = true;
  $('waiting').hidden = true;
  $('workspace').hidden = true;
}

async function enter(user, retry = false) {
  const generation = ++state.generation;
  stopTimers();
  state.user = user;
  state.member = null;
  hidePanels();
  $('sign-out').hidden = false;
  $('waiting').hidden = false;
  $('waiting-status').textContent = 'Checking your band access...';
  status('Checking band access...');
  const member = await api.membership(user.id);
  if (generation !== state.generation) return;
  if (!member) {
    $('waiting').hidden = false;
    $('waiting-status').textContent = 'Checking your request...';
    const request = await api.requestAccess(user.id, retry);
    if (generation !== state.generation) return;
    if (!request || request.status === 'approved') {
      const updated = await api.membership(user.id);
      if (generation !== state.generation) return;
      if (!updated) throw new Error('Your access request could not be found. Try checking again.');
      return enter(user);
    }
    if (!['pending', 'declined'].includes(request.status)) throw new Error('The access request has an unknown status.');
    $('waiting-status').textContent = request.status === 'pending'
      ? 'Your request is waiting for a band member to approve it. Use Check access after they do.'
      : 'Your request was declined. Contact the band or request access again.';
    $('retry-access').hidden = request.status !== 'declined';
    status();
    return;
  }
  state.member = member;
  state.chatKey = '';
  $('waiting').hidden = true;
  $('workspace').hidden = false;
  status();
  setTab('chat');
  scheduleChat(generation);
  scheduleRequests(generation);
  await Promise.all([loadChat(true), loadRequests()]);
}

function setTab(tab) {
  state.tab = tab;
  for (const id of ['chat', 'calendar', 'vault']) $(id).hidden = id !== tab;
  document.querySelectorAll('[data-tab]').forEach(node => {
    if (node.dataset.tab === tab) node.setAttribute('aria-current', 'page');
    else node.removeAttribute('aria-current');
  });
}

async function loadProfiles() {
  const generation = state.generation;
  const rows = await api.profiles();
  if (generation !== state.generation) return;
  state.profiles = new Map(rows.map(profile => [profile.user_id, profile.display_name]));
  state.profileRefresh = Date.now() + 60000;
}

function scheduleChat(generation, delay = 15000) {
  state.chatTimer = setTimeout(async () => {
    if (generation !== state.generation) return;
    let next = 15000;
    if (document.visibilityState === 'visible' && state.tab === 'chat') {
      try {
        await loadChat();
        if ($('status').textContent.startsWith('Chat refresh failed:')) status();
      } catch (error) {
        next = Math.min(delay * 2, 300000);
        status(`Chat refresh failed: ${error.message}. Retrying automatically.`);
      }
    }
    if (generation === state.generation) scheduleChat(generation, next);
  }, delay);
}
function scheduleRequests(generation, delay = 60000) {
  state.requestTimer = setTimeout(async () => {
    if (generation !== state.generation) return;
    let next = 60000;
    if (document.visibilityState === 'visible') {
      try {
        await loadRequests();
        if ($('status').textContent.startsWith('Access request check failed:')) status();
      } catch (error) {
        next = Math.min(delay * 2, 300000);
        status(`Access request check failed: ${error.message}. Retrying automatically.`);
      }
    }
    if (generation === state.generation) scheduleRequests(generation, next);
  }, delay);
}
function makeObserver() {
  if (!('IntersectionObserver' in window)) return null;
  return new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target._loadVisible?.();
      entry.target._loadVisible = null;
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '200px' });
}
function whenVisible(node, observer, load) {
  if (!observer) { load(); return; }
  node._loadVisible = load;
  observer.observe(node);
}
function storedUrl(bucket, path, download = false) {
  const key = `${bucket}:${path}:${download}`;
  const cached = state.signed.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = api.signedUrl(bucket, path, download).catch(error => {
    state.signed.delete(key);
    throw error;
  });
  state.signed.set(key, { promise, expires: Date.now() + 45 * 60 * 1000 });
  return promise;
}

async function loadChat(force = false) {
  if (!state.member) return;
  const generation = state.generation;
  if (Date.now() >= state.profileRefresh) await loadProfiles();
  if (generation !== state.generation) return;
  const rows = await api.messages(state.member.band_id);
  if (generation !== state.generation) return;
  const key = JSON.stringify([rows, [...state.profiles], state.pinned]);
  if (!force && key === state.chatKey) return;
  state.chatKey = key;
  const container = $('messages');
  const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
  chatObserver?.disconnect();
  chatObserver = makeObserver();
  container.replaceChildren();
  const shown = state.pinned ? rows.filter(row => row.is_pinned) : rows;
  if (!shown.length) container.append(element('p', state.pinned ? 'No pinned messages.' : 'No messages yet.', 'muted'));
  for (const row of shown) container.append(renderMessage(row, generation));
  if (nearBottom || force) container.scrollTop = container.scrollHeight;
}

function renderMessage(row, generation) {
  const own = row.sender_id === state.user.id;
  const card = element('article', undefined, `message${own ? ' own' : ''}`);
  const head = element('div', undefined, 'message-head');
  head.append(element('strong', state.profiles.get(row.sender_id) || row.sender_email || 'Band member'));
  head.append(element('span', messageTime(row.created_at)));
  if (row.is_pinned) head.append(element('span', 'Pinned'));
  card.append(head);
  const body = element('p', undefined, 'message-body');
  for (const part of splitLinks(row.body || '')) {
    if (!part.url) body.append(document.createTextNode(part.text));
    else {
      const link = element('a', part.text);
      link.href = part.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      body.append(link);
    }
  }
  card.append(body);
  if (row.image_path) {
    const attachment = element('div', 'Loading attachment...', 'muted');
    card.append(attachment);
    whenVisible(attachment, chatObserver, () => storedUrl('chat-photos', row.image_path).then(url => {
      if (generation !== state.generation || !attachment.isConnected) return;
      const kind = row.attachment_kind || 'photo';
      if (kind === 'photo') {
        const link = element('a');
        link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        const image = element('img'); image.src = url; image.alt = row.attachment_name || 'Chat photo'; image.loading = 'lazy';
        link.append(image); attachment.replaceChildren(link);
      } else if (kind === 'audio' || kind === 'video') {
        const media = element(kind); media.controls = true; media.preload = 'none'; media.src = url;
        attachment.replaceChildren(media);
      } else {
        const link = element('a', row.attachment_name || 'Open attachment');
        link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        attachment.replaceChildren(link);
      }
      const download = element('a', 'Download');
      download.target = '_blank'; download.rel = 'noopener noreferrer';
      storedUrl('chat-photos', row.image_path, row.attachment_name || 'attachment').then(link => {
        if (generation === state.generation && attachment.isConnected) { download.href = link; attachment.append(download); }
      }).catch(error => { if (attachment.isConnected) attachment.append(element('p', `Download unavailable: ${error.message}`, 'muted')); });
    }).catch(error => { if (attachment.isConnected) attachment.textContent = `Attachment unavailable: ${error.message}`; }));
  }
  const actions = element('div', undefined, 'actions');
  actions.append(button(row.is_pinned ? 'Unpin' : 'Pin', 'pin', async () => {
    await api.pinMessage(row.id, !row.is_pinned); await loadChat(true);
  }));
  if (own) actions.append(button('Delete', 'danger', async () => {
    if (!confirm('Delete this message and its attachment?')) return;
    await api.deleteMessage(row, state.user.id, state.member.band_id); await loadChat(true);
  }));
  card.append(actions);
  return card;
}

async function loadRequests() {
  if (!state.member) return;
  const generation = state.generation;
  const rows = await api.requests(state.member.band_id);
  if (generation !== state.generation) return;
  $('requests-notice').hidden = rows.length === 0;
  $('requests-message').textContent = rows.length === 1 ? 'A band access request is waiting.' : `${rows.length} band access requests are waiting.`;
  const list = $('requests-list');
  list.replaceChildren();
  if (!rows.length) list.append(element('p', 'No pending requests.', 'muted'));
  for (const row of rows) {
    const card = element('article', undefined, 'request');
    card.append(element('strong', row.display_name), element('p', `${row.email} (not verified)`, 'muted'));
    const actions = element('div', undefined, 'actions');
    actions.append(button('Approve', '', async () => {
      if (!confirm(`Names and emails are not verified. Have you confirmed ${row.display_name} is your bandmate?`)) return;
      await api.reviewRequest(row.user_id, true); await loadRequests(); status('Account approved.');
    }));
    actions.append(button('Decline', 'danger', async () => {
      if (!confirm(`Decline the request from ${row.display_name}?`)) return;
      await api.reviewRequest(row.user_id, false); await loadRequests(); status('Request declined.');
    }));
    card.append(actions); list.append(card);
  }
}

async function loadCalendar() {
  const generation = state.generation;
  const rows = await api.events(state.member.band_id);
  if (generation !== state.generation) return;
  state.events = rows;
  renderCalendar();
}
function renderCalendar() {
  const month = state.month;
  $('month-title').textContent = month.toLocaleDateString([], { month: 'long', year: 'numeric' });
  const grid = $('calendar-grid');
  grid.replaceChildren();
  const offset = (month.getDay() + 6) % 7;
  for (let i = 0; i < offset; i++) grid.append(element('span'));
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const eventDays = new Set(state.events.map(row => localDateKey(new Date(row.starts_at))));
  for (let day = 1; day <= count; day++) {
    const date = new Date(month.getFullYear(), month.getMonth(), day);
    const key = localDateKey(date);
    const cell = element('button', String(day));
    cell.type = 'button';
    if (key === localDateKey(new Date())) cell.classList.add('today');
    if (key === state.selected) cell.classList.add('selected');
    if (eventDays.has(key)) cell.classList.add('has-event');
    cell.setAttribute('aria-label', `${date.toLocaleDateString([], { dateStyle: 'full' })}${eventDays.has(key) ? ', has events' : ''}${key === localDateKey(new Date()) ? ', today' : ''}`);
    cell.addEventListener('click', () => { state.selected = key; renderCalendar(); });
    grid.append(cell);
  }
  $('selected-date').textContent = new Date(`${state.selected}T12:00:00`).toLocaleDateString([], { dateStyle: 'full' });
  $('event-date').value = state.selected;
  const list = $('events');
  list.replaceChildren();
  const rows = state.events.filter(row => localDateKey(new Date(row.starts_at)) === state.selected);
  if (!rows.length) list.append(element('p', 'No events on this day.', 'muted'));
  for (const row of rows) {
    const card = element('article', undefined, 'event');
    card.append(element('strong', row.title), element('p', `${new Date(row.starts_at).toLocaleTimeString([], { timeStyle: 'short' })}${row.location ? ` · ${row.location}` : ''}`, 'muted'));
    list.append(card);
  }
}

async function loadFiles() {
  const generation = state.generation;
  const category = $('vault-category').value;
  const rows = await api.files(state.member.band_id, category);
  if (generation !== state.generation || category !== $('vault-category').value) return;
  const list = $('files');
  vaultObserver?.disconnect();
  vaultObserver = makeObserver();
  list.replaceChildren();
  if (!rows.length) list.append(element('p', 'No files in this category.', 'muted'));
  for (const row of rows) {
    const card = element('article', undefined, 'file-card');
    if (category === 'photos') {
      const image = element('img'); image.alt = row.file_name; image.loading = 'lazy'; card.append(image);
    }
    card.append(element('strong', row.file_name));
    const actions = element('div', undefined, 'actions');
    const open = button('Open', 'quiet', () => openVaultFile(row));
    const download = element('a', 'Download');
    download.setAttribute('download', row.file_name);
    download.setAttribute('aria-disabled', 'true');
    actions.append(open, download);
    if (['owner', 'manager'].includes(state.member.role)) actions.append(button('Delete', 'danger', async () => {
      if (!confirm(`Delete ${row.file_name} from the Vault?`)) return;
      await api.deleteFile(row); await loadFiles(); status('File deleted.');
    }));
    card.append(actions); list.append(card);
    whenVisible(card, vaultObserver, () => Promise.all([storedUrl('band-files', row.storage_path), storedUrl('band-files', row.storage_path, row.file_name)]).then(([url, downloadUrl]) => {
      if (generation !== state.generation || !card.isConnected) return;
      const image = card.querySelector('img');
      if (image) image.src = url;
      download.href = downloadUrl;
      download.removeAttribute('aria-disabled');
    }).catch(error => { if (card.isConnected) card.append(element('p', `File links unavailable: ${error.message}`, 'muted')); }));
  }
}

async function openVaultFile(file) {
  const viewer = $('file-viewer');
  const generation = state.generation;
  const currentViewer = ++viewerGeneration;
  $('viewer-title').textContent = file.file_name;
  $('viewer-content').replaceChildren();
  $('viewer-status').textContent = 'Opening file...';
  $('viewer-download').removeAttribute('href');
  $('viewer-download').setAttribute('download', file.file_name);
  if (!viewer.open) viewer.showModal();
  try {
    const [url, downloadUrl] = await Promise.all([
      storedUrl('band-files', file.storage_path),
      storedUrl('band-files', file.storage_path, file.file_name)
    ]);
    if (!viewer.open || currentViewer !== viewerGeneration || generation !== state.generation) return;
    $('viewer-download').href = downloadUrl;
    const kind = previewKind(file.file_name);
    if (!kind) {
      $('viewer-status').textContent = 'This file type cannot be previewed in the browser. Download it to open it.';
      return;
    }
    if (kind === 'text') {
      const response = await fetch(url);
      if (!response.ok || !response.body) throw new Error('The text file could not be loaded.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = '', size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2 * 1024 * 1024) {
          await reader.cancel();
          throw new Error('This text file is too large to preview. Download it to open it.');
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      if (!viewer.open || currentViewer !== viewerGeneration || generation !== state.generation) return;
      $('viewer-content').append(element('pre', text));
    } else if (kind === 'pdf') {
      const frame = element('iframe');
      frame.title = file.file_name;
      frame.setAttribute('sandbox', '');
      frame.src = url;
      $('viewer-content').append(frame);
    } else {
      const media = element(kind === 'image' ? 'img' : kind);
      if (kind === 'image') media.alt = file.file_name;
      else { media.controls = true; media.preload = 'metadata'; }
      media.addEventListener('error', () => {
        if (currentViewer === viewerGeneration && viewer.open)
          $('viewer-status').textContent = 'This device could not open the file. Try downloading it.';
      });
      media.src = url;
      $('viewer-content').append(media);
    }
    $('viewer-status').textContent = kind === 'pdf' ? 'If your browser cannot display this PDF, use Download file.' : '';
  } catch (error) {
    if (viewer.open && currentViewer === viewerGeneration && generation === state.generation)
      $('viewer-status').textContent = error.message || String(error);
  }
}

$('close-viewer').addEventListener('click', () => $('file-viewer').close());
$('file-viewer').addEventListener('close', () => {
  viewerGeneration++;
  $('viewer-content').replaceChildren();
  $('viewer-download').removeAttribute('href');
});

$('auth-toggle').addEventListener('click', () => {
  state.signup = !state.signup;
  $('auth-heading').textContent = state.signup ? 'Create account' : 'Sign in';
  $('auth-submit').textContent = state.signup ? 'Create account' : 'Sign in';
  $('auth-toggle').textContent = state.signup ? 'Already have an account? Sign in' : 'Create an account';
  $('name-label').hidden = !state.signup;
  $('display-name').required = state.signup;
  $('password').autocomplete = state.signup ? 'new-password' : 'current-password';
  status();
});
$('auth-form').addEventListener('submit', event => {
  event.preventDefault();
  busy($('auth-submit'), async () => {
    const email = $('email').value.trim(), password = $('password').value, name = $('display-name').value.trim();
    if (state.signup && !name) throw new Error('Enter the name your bandmates will see.');
    const result = state.signup ? await api.auth.signUp(email, password, name) : await api.auth.signIn(email, password);
    $('password').value = '';
    if (!result.session || !result.user) {
      status('Account created. If email confirmation is enabled, confirm your email before signing in.');
      return;
    }
    await enter(result.user);
  });
});
$('sign-out').addEventListener('click', () => busy($('sign-out'), async () => { await api.auth.signOut(); reset(); status(); }));
$('check-access').addEventListener('click', () => busy($('check-access'), () => enter(state.user)));
$('retry-access').addEventListener('click', () => busy($('retry-access'), () => enter(state.user, true)));
$('show-requests').addEventListener('click', () => busy($('show-requests'), async () => { await loadRequests(); $('requests').hidden = false; }));
$('close-requests').addEventListener('click', () => { $('requests').hidden = true; });
document.querySelectorAll('[data-tab]').forEach(node => node.addEventListener('click', () => busy(node, async () => {
  setTab(node.dataset.tab);
  if (state.tab === 'calendar') await loadCalendar();
  else if (state.tab === 'vault') await loadFiles();
  else await loadChat();
})));
$('pinned').addEventListener('click', () => busy($('pinned'), async () => {
  state.pinned = !state.pinned;
  $('pinned').setAttribute('aria-pressed', String(state.pinned));
  $('pinned').textContent = state.pinned ? 'Show all' : 'Pinned';
  await loadChat(true);
}));
$('chat-file').addEventListener('change', () => { $('chat-file-name').textContent = $('chat-file').files[0]?.name || ''; });
$('message-text').addEventListener('input', () => {
  const field = $('message-text');
  field.style.height = 'auto';
  field.style.height = `${Math.min(field.scrollHeight + 2, 120)}px`;
});
$('message-form').addEventListener('submit', event => {
  event.preventDefault();
  busy(event.submitter || $('message-form').querySelector('[type=submit]'), async () => {
    await api.sendMessage(state.user, state.member.band_id, $('message-text').value, $('chat-file').files[0]);
    $('message-text').value = ''; $('message-text').style.height = '';
    $('chat-file').value = ''; $('chat-file-name').textContent = '';
    await loadChat(true);
  });
});
for (const [id, delta] of [['previous-month', -1], ['next-month', 1]]) $(id).addEventListener('click', () => {
  state.month = new Date(state.month.getFullYear(), state.month.getMonth() + delta, 1);
  state.selected = localDateKey(state.month);
  renderCalendar();
});
$('event-form').addEventListener('submit', event => {
  event.preventDefault();
  busy(event.submitter || $('event-form').querySelector('[type=submit]'), async () => {
    const title = $('event-title').value.trim();
    if (!title) throw new Error('Enter an event name.');
    const start = localDateTime($('event-date').value, $('event-time').value);
    await api.addEvent(state.member.band_id, title, start, $('event-location').value);
    state.selected = localDateKey(start); state.month = new Date(start.getFullYear(), start.getMonth(), 1);
    $('event-title').value = ''; $('event-location').value = '';
    await loadCalendar(); status('Event added.');
  });
});
$('vault-category').addEventListener('change', () => busy($('vault-category'), loadFiles));
$('vault-form').addEventListener('submit', event => {
  event.preventDefault();
  busy(event.submitter || $('vault-form').querySelector('[type=submit]'), async () => {
    await api.uploadFile(state.user, state.member.band_id, $('vault-category').value, $('vault-file').files[0]);
    $('vault-file').value = ''; await loadFiles(); status('File uploaded.');
  });
});

reset();
api.auth.session().then(session => {
  if (session?.user) return enter(session.user);
}).catch(error => { status(`Could not load your account: ${error.message}`); });
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(error => status(`Could not enable the install shortcut: ${error.message}`));
}
