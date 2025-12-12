const toggleButton = document.getElementById("toggle");
const statusEl = document.getElementById("status");

function setUiState(running) {
	toggleButton.textContent = running ? "Stop" : "Start";
	statusEl.textContent = running
		? "Running: will click Aplicar and paginate until the end."
		: "Stopped: click Start on a coupons page.";
}

async function readRunningFlag() {
	const { running = false } = await chrome.storage.local.get("running");
	setUiState(running);
	return running;
}

async function sendToggleCommand(nextState) {
	try {
		await chrome.runtime.sendMessage({
			source: "popup",
			type: nextState ? "popup-start" : "popup-stop",
		});
		setUiState(nextState);
	} catch (err) {
		statusEl.textContent =
			"Could not reach the service worker. Is the extension reloaded?";
		console.error(err);
	}
}

toggleButton.addEventListener("click", async () => {
	toggleButton.disabled = true;
	const running = await readRunningFlag();
	await sendToggleCommand(!running);
	toggleButton.disabled = false;
});

readRunningFlag();
