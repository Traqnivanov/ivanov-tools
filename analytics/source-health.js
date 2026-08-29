const WARNING_ID = 'analyticsSourceWarning';
const statuses = new Map(Object.entries(window.__ivanovAnalyticsSourceStatuses || {}));

function rangeKey(range) {
  return `${range.start.getTime()}:${range.end.getTime()}`;
}

function activeStatuses() {
  if (!window.IvanovPeriods) return [];
  const current = window.IvanovPeriods.rangeFromControls();
  const previous = window.IvanovPeriods.previousRange(current);
  return [rangeKey(current), rangeKey(previous)].map(key => statuses.get(key)).filter(Boolean);
}

function combinedStatus() {
  const active = activeStatuses();
  if (!active.length) return null;
  return {
    firestore: active.every(status => status.firestore),
    d1: active.every(status => status.d1),
    partial: active.some(status => status.partial || status.unavailable),
    unavailable: active.some(status => status.unavailable),
  };
}

function warningText(status) {
  if (!status) return '';
  if (status.unavailable) return '⚠ Analytics източниците са временно недостъпни за част от избрания отчет.';
  if (!status.partial) return '';
  const missing = [];
  if (!status.firestore) missing.push('Firestore history');
  if (!status.d1) missing.push('D1 live data');
  return `⚠ Частични analytics данни · липсва ${missing.join(' + ')}.`;
}

function render() {
  const topbar = document.querySelector('.topbar');
  const existing = document.getElementById(WARNING_ID);
  const text = warningText(combinedStatus());
  if (!text) {
    existing?.remove();
    return;
  }
  const node = existing || document.createElement('span');
  node.id = WARNING_ID;
  node.setAttribute('role', 'status');
  node.textContent = text;
  node.title = 'Таблото продължава с наличния източник, но числата за текущия или сравнявания период може да са непълни. „Обнови“ проверява отново.';
  node.style.cssText = 'display:inline-flex;align-items:center;gap:6px;max-width:340px;padding:7px 10px;border:1px solid currentColor;border-radius:8px;font-size:12px;font-weight:700;line-height:1.25;white-space:normal;';
  if (!existing && topbar) {
    const spacer = topbar.querySelector('.spacer');
    topbar.insertBefore(node, spacer || null);
  }
}

window.addEventListener('ivanov:analytics-source-status', event => {
  if (event.detail?.rangeKey) statuses.set(event.detail.rangeKey, event.detail);
  render();
});
['periodFilter', 'dateFrom', 'dateTo'].forEach(id => document.querySelector(`#${id}`)?.addEventListener('change', render));
new MutationObserver(render).observe(document.documentElement, { childList: true, subtree: true });
render();
