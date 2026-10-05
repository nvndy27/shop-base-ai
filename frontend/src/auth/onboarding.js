const intentKey = 'shopbase-signup-intent';

// Onboarding preference only. This never grants a role or shop permission.
export function saveSignupIntent(mode, accountType, storage) {
  try { (storage ?? window.sessionStorage).setItem(intentKey, mode === 'signup' && accountType === 'seller' ? 'seller' : 'buyer'); }
  catch { /* Registration remains usable when optional preference storage is blocked. */ }
}

export function accountDestination(storage) {
  try { return (storage ?? window.sessionStorage).getItem(intentKey) === 'seller' ? '/profile#shop' : '/profile'; }
  catch { return '/profile'; }
}
