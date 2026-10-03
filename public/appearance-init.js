/* Follow the system before styles paint, including when app modules load slowly. */
(function () {
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
