import { IonOAuthClient } from "./common/IonOAuthClient.mjs";

const config = await fetch("./ionConfig.json").then(r => r.json());

const ionClient = new IonOAuthClient(config);
// Retrieve any metadata that was stashed with the signIn call, and use it.
const { redirect } = await ionClient.init();
if (redirect) {
  history.replaceState({}, null, redirect);
}

// Expose for console fun.
globalThis.ionClient = ionClient;

// Fast and dirty - get all the id'd elements as a map
const elements = {};
[...document.querySelectorAll("*[id]")].forEach((e) => elements[e.id] = e);

// Do UI stuff.
if (ionClient.loggedIn) {
  elements.signin.setAttribute('disabled', 'disabled');
} else {
  elements.signout.setAttribute('disabled', 'disabled');
  elements.fetchAssets.setAttribute('disabled', 'disabled');
}

elements.signin.addEventListener("click", async () => {
  // Other metadata can be added to the flow here at the signIn call as well.
  await ionClient.signIn({ redirect: window.location.toString() });
});

elements.signout.addEventListener("click", async () => {
  await ionClient.signOut();
});

elements.fetchAssets.addEventListener('click', async () => {
  const assets = await ionClient.fetch('/v1/assets?limit=50&page=1&sortBy=DATE_ADDED&sortOrder=DESC');
  elements.assets.innerHTML = JSON.stringify(assets, null, 2);
});
