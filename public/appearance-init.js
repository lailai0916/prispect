/* Follow the system before styles paint, including when app modules load slowly. */
(function () {
  // Remove recovery credentials before application modules and analytics start.
  if (typeof location !== 'undefined' && location.pathname === '/login') {
    var recoveryUrl = new URL(location.href);
    var resetToken =
      new URLSearchParams(recoveryUrl.hash.slice(1)).get('reset-token') ||
      recoveryUrl.searchParams.get('token');
    if (resetToken) {
      window.prispectRecoveryToken = resetToken;
      recoveryUrl.searchParams.delete('token');
      recoveryUrl.searchParams.set('reset', '1');
      recoveryUrl.hash = '';
      history.replaceState(history.state, '', recoveryUrl.pathname + recoveryUrl.search);
    }
  }
  var locale = 'zh-Hans';
  try {
    if (localStorage.getItem('cashlens-locale') === 'en') locale = 'en';
  } catch (_) {}
  var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var resolved = systemDark ? 'dark' : 'light';
  document.documentElement.dataset.theme = resolved;
  document.documentElement.lang = locale;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#151518' : '#ffffff');
})();
