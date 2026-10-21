import { fillPage } from './fill.js';

const $ = (id) => document.getElementById(id);
const status = (msg) => { $('status').textContent = msg; };

const { profile } = await chrome.storage.local.get('profile');
if (profile) $('profile').value = JSON.stringify(profile, null, 1);
else { $('setup').open = true; $('fill').disabled = true; status('Paste your profile first.'); }

$('save').onclick = async () => {
  try {
    const data = JSON.parse($('profile').value);
    if (typeof data !== 'object' || Array.isArray(data)) throw new Error();
    await chrome.storage.local.set({ profile: data });
    $('fill').disabled = false;
    status(`Saved ${Object.keys(data).length} fields.`);
  } catch {
    status('That isn\'t the profile JSON. Copy it again from the app.');
  }
};

$('fill').onclick = async () => {
  const { profile: p } = await chrome.storage.local.get('profile');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    // allFrames: Greenhouse and many career sites embed the form in an iframe
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: fillPage, args: [p] });
    const filled = results.flatMap((r) => r.result?.filled ?? []);
    status(filled.length ? `Filled ${filled.length}: ${[...new Set(filled)].join(', ')}. Review, then submit.` : 'No matching empty fields found on this page.');
  } catch (e) {
    status(`Can't fill this page (${e.message}).`);
  }
};
