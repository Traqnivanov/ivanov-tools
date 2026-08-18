import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const OWNER_UID = 'bXTElQJfQ6dm5YvLFuJ1pEGr2Zy2';
const firebaseConfig = {
  apiKey: 'AIzaSyDpgJazYtTHvU-fWuWlAQnbYTLOGcfnkhA',
  authDomain: 'ivanov-tools.firebaseapp.com',
  projectId: 'ivanov-tools',
  storageBucket: 'ivanov-tools.firebasestorage.app',
  messagingSenderId: '212062400948',
  appId: '1:212062400948:web:e52380c5096e8dba68c2e1'
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
let resolveAuthReady;
window.ivanovToolsAuthReady = new Promise(resolve => { resolveAuthReady = resolve; });

const style = document.createElement('style');
style.textContent = `
  html.ir-auth-pending body > *:not(#irAuthGate) { visibility: hidden !important; }
  #irAuthGate { position: fixed; inset: 0; z-index: 2147483647; visibility: visible !important;
    display: grid; place-items: center; padding: 20px; background: #0a0f1a;
    color: #f8fafc; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  #irAuthGate[hidden] { display: none !important; }
  .ir-auth-card { width: min(100%, 390px); padding: 30px 24px; border: 1px solid #324155;
    border-radius: 18px; background: #121a27; box-shadow: 0 24px 70px rgba(0,0,0,.45); }
  .ir-auth-mark { color: #d9a441; font-size: 13px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
  .ir-auth-card h1 { margin: 10px 0 6px; color: #fff; font-size: 25px; }
  .ir-auth-card p { margin: 0 0 20px; color: #a9b5c5; line-height: 1.45; }
  .ir-auth-card label { display: block; margin: 13px 0 6px; color: #dbe4ee; font-size: 13px; font-weight: 700; }
  .ir-auth-card input { box-sizing: border-box; width: 100%; padding: 13px 14px; border: 1px solid #3a4a60;
    border-radius: 10px; outline: none; background: #0c131e; color: #fff; font: inherit; }
  .ir-auth-card input:focus { border-color: #d9a441; box-shadow: 0 0 0 3px rgba(217,164,65,.14); }
  .ir-auth-submit { width: 100%; margin-top: 18px; padding: 13px; border: 0; border-radius: 10px;
    background: #d9a441; color: #15110a; font: inherit; font-weight: 850; cursor: pointer; }
  .ir-auth-submit:disabled { opacity: .65; cursor: wait; }
  .ir-auth-error { min-height: 20px; margin-top: 12px !important; color: #fca5a5 !important; font-size: 13px; }
  .ir-auth-wait { text-align: center; color: #cbd5e1; }
  #irAuthLogout { position: fixed; right: 12px; bottom: 12px; z-index: 2147483000; padding: 8px 11px;
    border: 1px solid rgba(255,255,255,.2); border-radius: 9px; background: rgba(15,23,42,.9);
    color: #e2e8f0; font: 600 12px system-ui, sans-serif; cursor: pointer; backdrop-filter: blur(8px); }
`;
document.head.appendChild(style);

const gate = document.createElement('div');
gate.id = 'irAuthGate';
gate.innerHTML = '<div class="ir-auth-wait">Проверка на защитения достъп…</div>';
document.body.prepend(gate);

function errorText(error) {
  const code = error?.code || '';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Грешен имейл или парола.';
  }
  if (code === 'auth/too-many-requests') return 'Твърде много опити. Изчакай малко и опитай отново.';
  if (code === 'auth/network-request-failed') return 'Няма връзка с интернет.';
  return 'Входът не успя. Опитай отново.';
}

function renderLogin(message = '') {
  document.documentElement.classList.remove('ir-auth-pending');
  gate.hidden = false;
  gate.innerHTML = `
    <form class="ir-auth-card" id="irAuthForm">
      <div class="ir-auth-mark">Ivanov Remonti</div>
      <h1>Защитен вход</h1>
      <p>Влез с твоя Firebase профил, за да отвориш инструментите.</p>
      <label for="irAuthEmail">Имейл</label>
      <input id="irAuthEmail" type="email" autocomplete="username" required>
      <label for="irAuthPassword">Парола</label>
      <input id="irAuthPassword" type="password" autocomplete="current-password" required>
      <button class="ir-auth-submit" type="submit">Вход</button>
      <p class="ir-auth-error" id="irAuthError" role="alert">${message}</p>
    </form>`;

  const form = document.getElementById('irAuthForm');
  const email = document.getElementById('irAuthEmail');
  const password = document.getElementById('irAuthPassword');
  const submit = form.querySelector('button');
  const error = document.getElementById('irAuthError');
  email.focus();

  form.addEventListener('submit', async event => {
    event.preventDefault();
    submit.disabled = true;
    error.textContent = '';
    try {
      const credential = await signInWithEmailAndPassword(auth, email.value.trim(), password.value);
      if (credential.user.uid !== OWNER_UID) {
        await signOut(auth);
        error.textContent = 'Този профил няма достъп.';
        submit.disabled = false;
      }
    } catch (loginError) {
      error.textContent = errorText(loginError);
      submit.disabled = false;
      password.select();
    }
  });
}

function revealApplication(user) {
  window.ivanovToolsUser = user;
  if (resolveAuthReady) {
    resolveAuthReady(user);
    resolveAuthReady = null;
  }
  gate.hidden = true;
  document.documentElement.classList.remove('ir-auth-pending');

  const legacyLogin = document.getElementById('loginScreen');
  if (legacyLogin) legacyLogin.style.display = 'none';
  const mainApp = document.getElementById('mainApp');
  if (mainApp) mainApp.classList.add('visible');
  const appContainer = document.getElementById('appContainer');
  if (appContainer) appContainer.style.display = 'flex';
  const bottomNav = document.getElementById('bottomNav');
  if (bottomNav && window.innerWidth <= 768) bottomNav.style.display = 'flex';

  if (!document.getElementById('irAuthLogout')) {
    const logout = document.createElement('button');
    logout.id = 'irAuthLogout';
    logout.type = 'button';
    logout.textContent = 'Изход';
    logout.addEventListener('click', async () => {
      await signOut(auth);
      location.reload();
    });
    document.body.appendChild(logout);
  }

  window.dispatchEvent(new CustomEvent('ivanov-auth-ready', { detail: { user } }));
}

window.ivanovToolsAuth = auth;

setPersistence(auth, browserLocalPersistence)
  .catch(() => {})
  .finally(() => {
    onAuthStateChanged(auth, async user => {
      if (user?.uid === OWNER_UID) {
        revealApplication(user);
        return;
      }
      if (user) await signOut(auth);
      window.ivanovToolsUser = null;
      renderLogin(user ? 'Този профил няма достъп.' : '');
    });
  });
