// Asks the server who is signed in as soon as the page starts, while the app's own code is still downloading. The app picks the
// answer up (see takeEarlySession in src/auth.tsx) instead of asking again once it has loaded. Anything unexpected is left to the app.
(function () {
  try {
    window.__cpSession = fetch('/api/auth/me', { credentials: 'same-origin' }).then(
      function (res) {
        if (res.status === 401) return { session: null };
        if (!res.ok) return null;
        return res.json().then(function (session) {
          return { session: session };
        });
      },
      function () {
        return null;
      },
    );
  } catch (e) {
    window.__cpSession = undefined;
  }
})();
