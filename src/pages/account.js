import { initializePage } from './common.js';
import { supabase, supabaseConfigurationError } from '../services/supabase.js';
import {
  escapeText,
  openConfirmation,
  renderEmptyState,
  renderSkeletonCards,
  showToast,
} from '../components/ui.js';

initializePage('Account', 'Manage your profile and account settings.');

const pageContent = document.querySelector('#page-content');
let activeRequest = 0;

function validateProfile(form) {
  const data = new FormData(form);
  const displayName = String(data.get('displayName') ?? '').trim();
  const phone = String(data.get('phone') ?? '').trim();
  const errors = {};

  if (!displayName) {
    errors.displayName = 'Display name is required.';
  } else if (displayName.length > 100) {
    errors.displayName = 'Display name must be 100 characters or fewer.';
  }

  if (phone && (phone.length < 3 || phone.length > 30)) {
    errors.phone = 'Phone number must be 3 to 30 characters.';
  }

  return { displayName, phone: phone || null, errors };
}

async function loadAccount() {
  const requestId = ++activeRequest;
  pageContent.innerHTML = renderSkeletonCards(1);

  if (!supabase) {
    pageContent.innerHTML = renderEmptyState({
      title: 'Account unavailable',
      message: supabaseConfigurationError,
      icon: 'bi-exclamation-circle',
    });
    return;
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (requestId !== activeRequest) return;

  if (sessionError || !sessionData?.session) {
    const loginParams = new URLSearchParams();
    loginParams.set('return', '/account/');
    window.location.replace(`/login/?${loginParams.toString()}`);
    return;
  }

  const user = sessionData.session.user;
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('display_name,phone,updated_at')
    .eq('id', user.id)
    .maybeSingle();

  if (requestId !== activeRequest) return;

  if (profileError) {
    pageContent.innerHTML = renderEmptyState({
      title: 'Profile unavailable',
      message: 'We could not load your account profile.',
      icon: 'bi-wifi-off',
    });
    showToast('Could not load account profile.', { type: 'error' });
    return;
  }

  if (!profile) {
    pageContent.innerHTML = renderEmptyState({
      title: 'Profile not found',
      message: 'No profile record is available for this account.',
      icon: 'bi-person-x',
    });
    return;
  }

  const displayName = profile.display_name || user.user_metadata?.display_name || '';
  const updatedAt = profile.updated_at
    ? new Date(profile.updated_at).toLocaleString()
    : 'Not updated';

  pageContent.innerHTML = `
    <div class="account-layout">
      <section class="account-summary-card" aria-labelledby="account-summary-heading">
        <span class="account-avatar" aria-hidden="true">
          <i class="bi bi-person"></i>
        </span>
        <div>
          <p class="eyebrow mb-2">Signed-in account</p>
          <h2 id="account-summary-heading" class="h4 mb-1">${escapeText(displayName || 'Guest account')}</h2>
          <p class="text-secondary mb-0">${escapeText(user.email || 'Email unavailable')}</p>
        </div>
      </section>

      <section class="account-form-card" aria-labelledby="account-profile-heading">
        <div class="account-section-heading">
          <div>
            <p class="eyebrow mb-2">Profile</p>
            <h2 id="account-profile-heading" class="h4 mb-0">Personal details</h2>
          </div>
          <small class="text-secondary">Last updated: ${escapeText(updatedAt)}</small>
        </div>

        <form id="account-profile-form" novalidate>
          <div class="mb-3">
            <label class="form-label" for="account-display-name">Display name</label>
            <input id="account-display-name" name="displayName" class="form-control"
              maxlength="100" autocomplete="name" value="${escapeText(displayName)}" required>
            <div class="invalid-feedback" data-error-for="displayName"></div>
          </div>

          <div class="mb-3">
            <label class="form-label" for="account-phone">Phone <span class="text-secondary">(optional)</span></label>
            <input id="account-phone" name="phone" class="form-control"
              maxlength="30" autocomplete="tel" value="${escapeText(profile.phone || '')}">
            <div class="invalid-feedback" data-error-for="phone"></div>
          </div>

          <div class="account-email-field">
            <span class="form-label d-block">Email</span>
            <span class="text-secondary">${escapeText(user.email || 'Email unavailable')}</span>
          </div>

          <div class="account-actions">
            <button id="save-account" class="btn btn-primary" type="submit">Save profile</button>
            <button id="sign-out-account" class="btn btn-ghost" type="button">Sign out</button>
          </div>
        </form>
      </section>
    </div>
  `;

  const form = document.querySelector('#account-profile-form');
  const saveButton = document.querySelector('#save-account');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const result = validateProfile(form);

    ['displayName', 'phone'].forEach((fieldName) => {
      const field = form.elements[fieldName];
      const error = form.querySelector(`[data-error-for="${fieldName}"]`);
      field.classList.toggle('is-invalid', Boolean(result.errors[fieldName]));
      field.setAttribute('aria-invalid', result.errors[fieldName] ? 'true' : 'false');
      if (error) error.textContent = result.errors[fieldName] ?? '';
    });

    if (Object.keys(result.errors).length > 0) {
      showToast('Review the highlighted account fields.', { type: 'error' });
      form.querySelector('.is-invalid')?.focus();
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = 'Saving…';

    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: result.displayName,
        phone: result.phone,
      })
      .eq('id', user.id);

    if (error) {
      showToast(error.message || 'Profile could not be updated.', { type: 'error' });
      saveButton.disabled = false;
      saveButton.textContent = 'Save profile';
      return;
    }

    showToast('Profile updated successfully.', { type: 'success' });
    await loadAccount();
  });

  document.querySelector('#sign-out-account').addEventListener('click', async () => {
    const confirmed = await openConfirmation({
      title: 'Sign out?',
      message: 'You will need to sign in again to access your account and orders.',
      confirmLabel: 'Sign out',
      cancelLabel: 'Stay signed in',
      destructive: false,
    });
    if (!confirmed) return;

    const { error } = await supabase.auth.signOut();
    if (error) {
      showToast(error.message || 'Sign out failed.', { type: 'error' });
      return;
    }
    window.location.assign('/');
  });
}

window.addEventListener('popstate', loadAccount);
loadAccount();
