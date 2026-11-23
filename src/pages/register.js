import { initializePage } from './common.js';
import { supabase, supabaseConfigurationError } from '../services/supabase.js';
import { renderEmptyState, showToast } from '../components/ui.js';

initializePage('Register', 'Create an Art Shop guest account.');

const pageContent = document.querySelector('#page-content');

function validateRegistration(form) {
  const data = new FormData(form);
  const displayName = String(data.get('displayName') ?? '').trim();
  const email = String(data.get('email') ?? '').trim();
  const password = String(data.get('password') ?? '');
  const confirmPassword = String(data.get('confirmPassword') ?? '');
  const errors = {};

  if (!displayName) errors.displayName = 'Display name is required.';
  else if (displayName.length > 100) errors.displayName = 'Display name must be 100 characters or fewer.';
  if (!email) errors.email = 'Email is required.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    errors.email = 'Enter a valid email address.';
  }
  if (!password) errors.password = 'Password is required.';
  else if (password.length < 8) errors.password = 'Password must be at least 8 characters.';
  if (confirmPassword !== password) {
    errors.confirmPassword = 'Passwords must match.';
  }

  return { displayName, email, password, errors };
}

async function initializeRegistration() {
  if (!supabase) {
    pageContent.innerHTML = renderEmptyState({
      title: 'Registration unavailable',
      message: supabaseConfigurationError,
      icon: 'bi-exclamation-circle',
    });
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.session) {
    window.location.replace('/');
    return;
  }

  pageContent.innerHTML = `
    <section class="auth-layout" aria-labelledby="register-form-heading">
      <form id="register-form" class="auth-card" novalidate>
        <h2 id="register-form-heading" class="h4">Create your account</h2>
        <p class="text-secondary">Create a guest account for ordering and order history.</p>
        <div class="mb-3">
          <label class="form-label" for="register-display-name">Display name</label>
          <input id="register-display-name" name="displayName" class="form-control"
            maxlength="100" autocomplete="name" required>
          <div class="invalid-feedback" data-error-for="displayName"></div>
        </div>
        <div class="mb-3">
          <label class="form-label" for="register-email">Email</label>
          <input id="register-email" name="email" class="form-control"
            type="email" maxlength="254" autocomplete="email" required>
          <div class="invalid-feedback" data-error-for="email"></div>
        </div>
        <div class="mb-3">
          <label class="form-label" for="register-password">Password</label>
          <input id="register-password" name="password" class="form-control"
            type="password" minlength="8" autocomplete="new-password" required>
          <div class="invalid-feedback" data-error-for="password"></div>
        </div>
        <div class="mb-4">
          <label class="form-label" for="register-confirm-password">Confirm password</label>
          <input id="register-confirm-password" name="confirmPassword" class="form-control"
            type="password" minlength="8" autocomplete="new-password" required>
          <div class="invalid-feedback" data-error-for="confirmPassword"></div>
        </div>
        <button id="register-submit" class="btn btn-primary w-100" type="submit">Create account</button>
        <p class="auth-switch mb-0">Already have an account? <a href="/login/">Log in</a></p>
      </form>
    </section>
  `;

  const form = document.querySelector('#register-form');
  const submitButton = document.querySelector('#register-submit');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const result = validateRegistration(form);

    ['displayName', 'email', 'password', 'confirmPassword'].forEach((fieldName) => {
      const field = form.elements[fieldName];
      const error = form.querySelector(`[data-error-for="${fieldName}"]`);
      field.classList.toggle('is-invalid', Boolean(result.errors[fieldName]));
      field.setAttribute('aria-invalid', result.errors[fieldName] ? 'true' : 'false');
      error.textContent = result.errors[fieldName] ?? '';
    });

    if (Object.keys(result.errors).length > 0) {
      showToast('Review the highlighted registration fields.', { type: 'error' });
      form.querySelector('.is-invalid')?.focus();
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Creating account…';

    const { data, error } = await supabase.auth.signUp({
      email: result.email,
      password: result.password,
      options: {
        data: { display_name: result.displayName },
        emailRedirectTo: `${window.location.origin}/login/`,
      },
    });

    if (error) {
      showToast(error.message || 'Registration failed.', { type: 'error' });
      submitButton.disabled = false;
      submitButton.textContent = 'Create account';
      return;
    }

    if (data?.session) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ display_name: result.displayName })
        .eq('id', data.user.id);
      if (profileError) {
        showToast('Account created, but the display name could not be saved.', { type: 'error' });
      } else {
        showToast('Account created successfully.', { type: 'success' });
      }
      window.location.assign('/');
      return;
    }

    showToast('Registration received. Check your email to confirm your account.', { type: 'success', duration: 8000 });
    submitButton.disabled = false;
    submitButton.textContent = 'Create account';
  });
}

initializeRegistration();
