// Get the API endpoint from the server
const { ionApi } = await fetch('/config').then(r => r.json());

// Fast and dirty - get all the id'd elements as a map
const elements = {};
[...document.querySelectorAll("*[id]")].forEach((e) => elements[e.id] = e);

// Get the access token off the cookie.
const access_token = decodeURIComponent(
  (document.cookie
    .split(";")
    .find((c) => c.trim().startsWith('cs_access_token=')) ?? ''
  )
  .split('=').slice(1).join('=')
);

// So we're not passing the access token around for simple signed-in checks
const loggedIn = !!access_token;

// Like fetch, but for the Ion server, and with JSON / error handling knowledge
async function fetchIon(uri, init) {
  if (!loggedIn) {
    throw new Error("Not logged in");
  }
  const url = new URL(uri, ionApi);
  const request = new Request(url, {
    ...init,
    headers: {
      ...init?.headers,
      authorization: `Bearer ${access_token}`
    },
  });
  const response = await fetch(request);
  if (!response.ok) {
    let content = await response.text();
    let extras = {
      name: `HttpError ${response.status}${response.statusText ? ` (${response.statusText})` : ''}`,
      status: response.status,
      statusText: response.statusText,
      url,
      method: request.method
    };
    try {
      const payload = JSON.parse(content);
      if (payload?.message) {
        const { message, ...rest } = payload;
        extras = { ...rest, ...extras };
        content = message;
      }
    } catch { /***/ }
    const err = new Error(content);
    throw Object.assign(err, extras);
  }
  if (response.status === 204) {
    return undefined;
  }
  return await response.json();
}

// Expose for console fun
globalThis.fetchIon = fetchIon;

// Do UI stuff.
if (loggedIn) {
  elements.signin.setAttribute('disabled', 'disabled');
} else {
  elements.signout.setAttribute('disabled', 'disabled');
  elements.fetchAssets.setAttribute('disabled', 'disabled');
}

elements.signin.addEventListener("click", async () => {
  window.location = "http://localhost:8080/oauth/request";
});

elements.signout.addEventListener("click", async () => {
  document.cookie = `cs_access_token=; path=/; expires=01 Jan 1970 00:00:00 UTC`;
  window.location.reload();
});

elements.fetchAssets.addEventListener('click', async () => {
  const assets = await fetchIon('/v1/assets?limit=50&page=1&sortBy=DATE_ADDED&sortOrder=DESC');
  elements.assets.innerHTML = JSON.stringify(assets, null, 2);
});
