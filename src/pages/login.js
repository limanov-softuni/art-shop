import { initializePage } from './common.js';
import { supabase, supabaseConfigurationError } from '../services/supabase.js';
import { renderEmptyState, showToast } from '../components/ui.js';

initializePage('Log in', 'Access your Art Shop account.');

const pageContent = document.querySelector('#page-content');

function safeReturnUrl() {
  const raw = new URLSearchParams(window.location.search).get('return');
  if (!raw) return '/';
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return '/';
    if (url.pathname === '/login/' || url.pathname === '/register/') return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

function validateLogin(form) {
  const data = new FormData(form);
  const email = String(data.get('email') ?? '').trim();
  const password = String(data.get('password') ?? '');
  const errors = {};

  if (!email) errors.email = 'Email is required.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    errors.email = 'Enter a valid email address.';
  }
  if (!password) errors.password = 'Password is required.';

  return { email, password, errors };
}

async function initializeLogin() {
  if (!supabase) {
    pageContent.innerHTML = renderEmptyState({
      title: 'Login unavailable',
      message: supabaseConfigurationError,
      icon: 'bi-exclamation-circle',
    });
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.session) {
    window.location.replace(safeReturnUrl());
    return;
  }

  pageContent.innerHTML = `
    <section class="auth-layout" aria-labelledby="login-form-heading">
      <form id="login-form" class="auth-card" novalidate>
        <h2 id="login-form-heading" class="h4">Welcome back</h2>
        <p class="text-secondary">Sign in with your Art Shop account.</p>
        <div class="mb-3">
          <label class="form-label" for="login-email">Email</label>
          <input id="login-email" name="email" class="form-control"
            type="email" autocomplete="email" maxlength="254" required>
          <div class="invalid-feedback" data-error-for="email"></div>
        </div>
        <div class="mb-4">
          <label class="form-label" for="login-password">Password</label>
          <input id="login-password" name="password" class="form-control"
            type="password" autocomplete="current-password" required>
          <div class="invalid-feedback" data-error-for="password"></div>
        </div>
        <button id="login-submit" class="btn btn-primary w-100" type="submit">Log in</button>
        <p class="auth-switch mb-0">No account? <a href="/register/">Create an account</a></p>
      </form>
    </section>
  `;

  const form = document.querySelector('#login-form');
  const submitButton = document.querySelector('#login-submit');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const result = validateLogin(form);

    ['email', 'password'].forEach((fieldName) => {
      const field = form.elements[fieldName];
      const error = form.querySelector(`[data-error-for="${fieldName}"]`);
      field.classList.toggle('is-invalid', Boolean(result.errors[fieldName]));
      field.setAttribute('aria-invalid', result.errors[fieldName] ? 'true' : 'false');
      error.textContent = result.errors[fieldName] ?? '';
    });

    if (Object.keys(result.errors).length > 0) {
      showToast('Review the highlighted login fields.', { type: 'error' });
      form.querySelector('.is-invalid')?.focus();
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Logging in…';

    const { error } = await supabase.auth.signInWithPassword({
      email: result.email,
      password: result.password,
    });

    if (error) {
      showToast(error.message || 'Login failed. Check your email and password.', { type: 'error' });
      submitButton.disabled = false;
      submitButton.textContent = 'Log in';
      return;
    }

    showToast('Logged in successfully.', { type: 'success' });
    window.location.assign(safeReturnUrl());
  });
}

initializeLogin();
