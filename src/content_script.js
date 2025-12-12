const APPLY_LABEL = "Aplicar";
const APPLY_DELAY_MS = 200;
const APPLY_JITTER_MS = 0;
const PAGE_DELAY_MS = 2000;
const WAIT_FOR_BUTTONS_MS = 4000;
let automationState = { running: false, abortController: null };

function getApplyButtons() {
	return Array.from(document.querySelectorAll("button")).filter(
		(button) =>
			button.innerText.trim().startsWith(APPLY_LABEL) && !button.disabled,
	);
}

function getNextPageButton() {
	return document.querySelector('a[title="Seguinte"]');
}

function delay(ms, signal) {
	return new Promise((resolve, reject) => {
		const timeoutId = setTimeout(resolve, ms);
		if (signal) {
			signal.addEventListener(
				"abort",
				() => {
					clearTimeout(timeoutId);
					reject(new DOMException("Aborted", "AbortError"));
				},
				{ once: true },
			);
		}
	});
}

async function waitForButtons(signal) {
	// Wait until at least one Aplicar button is present (or timeout).
	const deadline = Date.now() + WAIT_FOR_BUTTONS_MS;
	while (Date.now() < deadline) {
		if (getApplyButtons().length > 0) return;
		await delay(200, signal);
	}
}

async function clickApplyButtons(signal) {
	const buttons = getApplyButtons();
	if (!buttons.length) return;

	await Promise.all(
		buttons.map((button, idx) => {
			return new Promise((resolve, reject) => {
				const jitter = Math.floor(Math.random() * APPLY_JITTER_MS);
				const wait = idx * (APPLY_DELAY_MS + jitter);
				const timeoutId = setTimeout(() => {
					if (signal.aborted) {
						reject(new DOMException("Aborted", "AbortError"));
						return;
					}
					button.scrollIntoView({ block: "center" });
					button.click();
					resolve();
				}, wait);

				signal.addEventListener(
					"abort",
					() => {
						clearTimeout(timeoutId);
						reject(new DOMException("Aborted", "AbortError"));
					},
					{ once: true },
				);
			});
		}),
	);
}

function waitForUrlChange(currentUrl, signal) {
	return new Promise((resolve) => {
		const check = () => {
			if (signal.aborted) return resolve();
			if (window.location.href !== currentUrl) return resolve();
			requestAnimationFrame(check);
		};
		check();
	});
}

async function runAutomation(signal) {
	try {
		while (true) {
			await waitForButtons(signal);
			await clickApplyButtons(signal);

			if (signal.aborted) break;

			const next = getNextPageButton();
			if (!next) {
				console.log("No next page button found. Stopping automation.");
				break;
			}

			const currentUrl = window.location.href;
			await delay(PAGE_DELAY_MS, signal);
			next.click();
			await Promise.race([
				waitForUrlChange(currentUrl, signal),
				delay(12000, signal),
			]);
		}
	} catch (err) {
		if (err.name !== "AbortError") {
			console.error("Automation error:", err);
		}
	} finally {
		if (automationState.abortController?.signal === signal) {
			automationState = { running: false, abortController: null };
		}
	}
}

function startAutomation() {
	if (automationState.running) return;
	const controller = new AbortController();
	automationState = { running: true, abortController: controller };
	runAutomation(controller.signal);
}

function stopAutomation() {
	if (!automationState.running) return;
	automationState.abortController?.abort();
	automationState = { running: false, abortController: null };
}

function initFromStorage() {
	chrome.storage.local.get({ running: false }, ({ running }) => {
		if (running) startAutomation();
	});
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message?.type === "automation-start") {
		startAutomation();
		sendResponse?.({ ok: true });
		return true;
	}
	if (message?.type === "automation-stop") {
		stopAutomation();
		sendResponse?.({ ok: true });
		return true;
	}
	return undefined;
});

chrome.storage.onChanged.addListener((changes, area) => {
	if (area !== "local" || !changes.running) return;
	if (changes.running.newValue) {
		startAutomation();
	} else {
		stopAutomation();
	}
});

initFromStorage();
