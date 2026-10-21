// Injected into the active tab by popup.js (chrome.scripting serializes this
// one function, so everything it uses lives inside it). Fills empty fields
// from the profile, highlights them, and never submits anything.
export function fillPage(profile) {
  const RULES = [
    // [profile key, autocomplete values, label/name pattern]
    ['first_name', ['given-name'], /\bfirst[\s_-]?name|given[\s_-]?name|\bfname\b/i],
    ['last_name', ['family-name'], /\blast[\s_-]?name|surname|family[\s_-]?name|\blname\b/i],
    ['full_name', ['name'], /^\s*(full[\s_-]?)?name\s*\*?\s*$|full[\s_-]?name|your name|candidate name/i],
    ['email', ['email'], /e-?mail/i],
    ['phone', ['tel', 'tel-national'], /phone|mobile|contact number|whatsapp/i],
    ['linkedin', [], /linked\s?in/i],
    ['github', [], /git\s?hub/i],
    ['portfolio', ['url'], /portfolio|personal (web)?site|website|blog/i],
    ['location', ['address-level2'], /current location|^\s*location|\bcity\b|where are you (based|located)/i],
    ['college', [], /college|university|school|institut/i],
    ['degree', [], /\bdegree\b|qualification/i],
    ['graduation_year', [], /graduat|passing year|year of passing|batch/i],
    ['cgpa', [], /\bc?gpa\b|cgpa|percentage|grade/i],
    ['current_company', ['organization'], /current (company|employer)|company name|employer/i],
    ['current_title', ['organization-title'], /current (title|role|designation)/i],
    ['expected_ctc', [], /expected (ctc|salary|compensation)|salary expectation/i],
  ];

  const describe = (el) => {
    const parts = [el.getAttribute('aria-label'), el.placeholder, el.name, el.id];
    for (const l of el.labels || []) parts.push(l.textContent);
    const by = el.getAttribute('aria-labelledby');
    if (by) by.split(/\s+/).forEach((id) => parts.push(document.getElementById(id)?.textContent));
    // Lever/Ashby/Workday put the question in a wrapper, not a <label for>
    // (only a wrapper holding this one field, or we'd read a neighbour's label)
    const wrap = el.closest('li, .application-question, .field, [data-automation-id], fieldset, div');
    const q = wrap?.querySelector('label, legend, .application-label, [class*="label"]');
    if (q && !q.contains(el) && wrap.querySelectorAll('input, textarea, select').length === 1) parts.push(q.textContent);
    return parts.filter(Boolean).join(' | ').replace(/\s+/g, ' ');
  };

  const keyFor = (el) => {
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
    if (el.type === 'email') return 'email';
    if (el.type === 'tel') return 'phone';
    const text = describe(el);
    for (const [key, acs, re] of RULES) if (acs.includes(ac) || re.test(text)) return key;
    return null;
  };

  // React/Vue keep their own copy of the value: set it through the native
  // setter, then fire the events their onChange listens for.
  const setValue = (el, value) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  };

  const filled = [];
  const fields = document.querySelectorAll(
    'input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]), textarea, select'
  );
  for (const el of fields) {
    if (el.disabled || el.readOnly || (el.value && el.tagName !== 'SELECT')) continue;
    const key = keyFor(el);
    const value = key && profile[key];
    if (!value) continue;
    if (el.tagName === 'SELECT') {
      const opt = [...el.options].find((o) => o.text.toLowerCase().includes(String(value).toLowerCase()));
      if (!opt || el.value === opt.value) continue;
      setValue(el, opt.value);
    } else {
      setValue(el, String(value));
    }
    el.style.outline = '2px solid #34d399';
    el.style.outlineOffset = '1px';
    filled.push(key);
  }
  return { filled, total: fields.length };
}
