/* Apply saved appearance before styles paint, including when app modules load slowly. */
(function () {
  var preference = 'system';
  var locale = 'zh-Hans';
  try {
    var saved = localStorage.getItem('cashlens-theme');
    if (saved === 'light' || saved === 'dark') preference = saved;
    if (localStorage.getItem('cashlens-locale') === 'en') locale = 'en';
  } catch (_) {}
  var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var resolved = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.lang = locale;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#151518' : '#ffffff');
})();
