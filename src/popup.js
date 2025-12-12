const toggleButton = document.getElementById("toggle");
const statusEl = document.getElementById("status");

function setUiState(running) {
	toggleButton.textContent = running ? "Parar" : "Iniciar";

	statusEl.textContent = running
		? "Aplicando cupons e avançando páginas..."
		: "Clique em Iniciar em uma página de cupons.";
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
			"Não foi possível comunicar com a extensão. Recarregue e tente novamente.";

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
