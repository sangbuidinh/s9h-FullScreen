const CONFIG_EVENT_NAME = "__TAB_FS_CONFIG__";
const CONFIG_ATTR_NAME = "data-extension-tab-fullscreen-enabled";

let currentEnabled = true;

function broadcastConfig(enabled) {
  currentEnabled = enabled !== false;

  const root = document.documentElement;
  if (root) {
    root.setAttribute(CONFIG_ATTR_NAME, currentEnabled ? "1" : "0");
  }

  window.dispatchEvent(
    new CustomEvent(CONFIG_EVENT_NAME, {
      detail: { enabled: currentEnabled }
    })
  );
}

function loadAndBroadcastConfig() {
  chrome.storage.local.get(["tabFullscreenEnabled"], (result) => {
    broadcastConfig(result.tabFullscreenEnabled !== false);
  });
}

loadAndBroadcastConfig();

document.addEventListener("readystatechange", () => {
  if (document.readyState !== "loading") {
    broadcastConfig(currentEnabled);
  }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local" && changes.tabFullscreenEnabled) {
    broadcastConfig(changes.tabFullscreenEnabled.newValue !== false);
  }
});
