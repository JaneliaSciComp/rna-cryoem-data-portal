// Fathom custom events. The script is loaded in index.html; each new event
// name appears in the Fathom dashboard the first time it fires.
declare global {
  interface Window {
    fathom?: { trackEvent: (name: string) => void };
  }
}

// No-op when the script is blocked by an ad blocker or not loaded yet.
export function trackEvent(name: string) {
  window.fathom?.trackEvent(name);
}
