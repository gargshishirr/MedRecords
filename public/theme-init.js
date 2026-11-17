// Runs before the app starts.
(function () {
  // Clickjacking guard: a <meta> CSP cannot set frame-ancestors, so refuse to show inside a frame.
  if (window.top !== window.self) {
    document.documentElement.style.display = 'none';
    try {
      window.top.location.replace(window.location.href);
    } catch {
      // Cross-origin frame that blocks the jump: the page simply stays hidden.
    }
    return;
  }
  // Apply the saved theme before the first paint to avoid a flash.
  try {
    var pref = localStorage.getItem('medrecords:theme') || 'system';
    var dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch {
    // Storage blocked: keep the default theme.
  }
})();
