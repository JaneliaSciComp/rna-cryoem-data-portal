// The id_token cookie expired: edge_auth sent the API call to the login page. Send the whole
// page there instead, so the user comes back here after signing in.
export function redirectToLogin(): void {
  const next = window.location.pathname + window.location.search;
  window.location.assign(`/login.html?next=${encodeURIComponent(next)}`);
}
