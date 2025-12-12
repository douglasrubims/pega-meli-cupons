const APPLY_LABEL = "Aplicar";
const APPLY_DELAY_MS = 200;
const APPLY_JITTER_MS = 0;
const PAGE_DELAY_MS = 800;
const WAIT_FOR_BUTTONS_MS = 4000;
let automationState = { running: false, abortController: null };

function isVisible(element) {
	const style = getComputedStyle(element);

	const rect = element.getBoundingClientRect();

	return (
		style.display !== "none" &&
		style.visibility !== "hidden" &&
		rect.width > 0 &&
		rect.height > 0
	);
}

function getApplyButtons() {
	return Array.from(document.querySelectorAll("button")).filter(
		(button) =>
			button.innerText.trim().startsWith(APPLY_LABEL) &&
			!button.disabled &&
			isVisible(button),
	);
}

function getNextPageButton() {
	const btn = document.querySelector('a[title="Seguinte"]');

	if (!btn) return null;

	const className = btn.className || "";

	const isDisabled = className.includes("andes-pagination__button--disabled");

	return isDisabled ? null : btn;
}

function delay(ms, signal) {
	return new Promise((resolve, reject) => {
		const timeoutId = setTimeout(resolve, ms);

		if (signal)
			signal.addEventListener(
				"abort",
				() => {
					clearTimeout(timeoutId);
					reject(new DOMException("Aborted", "AbortError"));
				},
				{ once: true },
			);
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
	while (true) {
		const button = getApplyButtons()[0];

		if (!button) break;

		if (signal.aborted) throw new DOMException("Aborted", "AbortError");

		// Scroll then click sequentially, mirroring the original console script behavior.
		button.scrollIntoView({ block: "center" });

		await delay(30, signal); // small settle time after scroll

		button.click();

		const jitter = Math.floor(Math.random() * APPLY_JITTER_MS);

		await delay(APPLY_DELAY_MS + jitter, signal);
	}
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
		if (err.name !== "AbortError") console.error("Automation error:", err);
	} finally {
		if (automationState.abortController?.signal === signal)
			automationState = { running: false, abortController: null };
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

chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
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

	if (changes.running.newValue) startAutomation();
	else stopAutomation();
});

initFromStorage();
