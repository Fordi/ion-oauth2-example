import { IonOAuthClient } from "./common/IonOAuthClient.mjs";

// Fast and dirty - get all the id'd elements as a map
const elements = {};
[...document.querySelectorAll("*[id]")].forEach((e) => elements[e.id] = e);

const ionClient = new IonOAuthClient((await fetch('/config').then(r => r.json())));

// Expose for console fun
globalThis.ionClient = ionClient;

// Do UI stuff.
if (ionClient.loggedIn) {
  elements.signin.setAttribute('disabled', 'disabled');
} else {
  elements.signout.setAttribute('disabled', 'disabled');
  elements.fetchAssets.setAttribute('disabled', 'disabled');
}

elements.signin.addEventListener("click", async () => {
  window.location = "/oauth/request";
});

elements.signout.addEventListener("click", async () => {
  window.location = "/oauth/sign-out";
});

elements.fetchAssets.addEventListener('click', async () => {
  const assets = await ionClient.fetch('/v1/assets?limit=50&page=1&sortBy=DATE_ADDED&sortOrder=DESC');
  elements.assets.innerHTML = JSON.stringify(assets, null, 2);
});
