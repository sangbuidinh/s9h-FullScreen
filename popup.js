document.addEventListener('DOMContentLoaded', () => {
    const toggleSwitch = document.getElementById('toggleSwitch');

    // Load the current state (default to true)
    chrome.storage.local.get(['tabFullscreenEnabled'], (result) => {
        toggleSwitch.checked = result.tabFullscreenEnabled !== false;
    });

    // Listen for changes and update storage
    toggleSwitch.addEventListener('change', () => {
        chrome.storage.local.set({
            tabFullscreenEnabled: toggleSwitch.checked
        });
    });
});
