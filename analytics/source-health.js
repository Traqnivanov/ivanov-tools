const WARNING_ID = 'analyticsSourceWarning';

function warningText(status) {
  if (!status) return '';
  if (status.unavailable) return '⚠ Analytics източниците са временно недостъпни.';
  if (!status.partial) return '';
  const missing = [];
  if (!status.firestore) missing.push('Firestore history');
  if (!status.d1) missing.push('D1 live data');
  return `⚠ Частични analytics данни · липсва ${missing.join(' + ')}.`;
}

function render(status = window.__ivanovAnalyticsSourceStatus) {
  const topbar = document.querySelector('.topbar');
  const existing = document.getElementById(WARNING_ID);
  const text = warningText(status);
  if (!text) {
    existing?.remove();
    return;
  }
  const node = existing || document.createElement('span');
  node.id = WARNING_ID;
  node.setAttribute('role', 'status');
  node.textContent = text;
  node.title = 'Таблото продължава с наличния източник, но числата за избрания период може да са непълни. „Обнови“ проверява отново.';
  node.style.cssText = 'display:inline-flex;align-items:center;gap:6px;max-width:340px;padding:7px 10px;border:1px solid currentColor;border-radius:8px;font-size:12px;font-weight:700;line-height:1.25;white-space:normal;';
  if (!existing && topbar) {
    const spacer = topbar.querySelector('.spacer');
    topbar.insertBefore(node, spacer || null);
  }
}

window.addEventListener('ivanov:analytics-source-status', event => render(event.detail));
new MutationObserver(() => render()).observe(document.documentElement, { childList: true, subtree: true });
render();
