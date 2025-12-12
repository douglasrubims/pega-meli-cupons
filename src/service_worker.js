const COUPON_HOST_PATTERN = /:\/\/([^.]+\.)?mercadolivre\.com\.br\/cupons\//i;

function isCouponUrl(url) {
	return typeof url === "string" && COUPON_HOST_PATTERN.test(url);
}

async function setRunning(running) {
	await chrome.storage.local.set({ running });
}

async function sendCommandToActiveTab(command) {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	if (!tab?.id) return { ok: false, reason: "no-active-tab" };
	if (!isCouponUrl(tab.url || ""))
		return { ok: false, reason: "not-on-coupons-page" };

	try {
		await chrome.tabs.sendMessage(tab.id, { type: command });
		return { ok: true };
	} catch (err) {
		console.warn("Failed to send command to tab", err);
		return { ok: false, reason: "no-content-script" };
	}
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message?.source !== "popup") return;

	if (message.type === "popup-start") {
		(async () => {
			await setRunning(true);
			const result = await sendCommandToActiveTab("automation-start");
			sendResponse(result);
		})();
		return true;
	}

	if (message.type === "popup-stop") {
		(async () => {
			await setRunning(false);
			const result = await sendCommandToActiveTab("automation-stop");
			sendResponse(result);
		})();
		return true;
	}
});

// When a tab finishes loading and running is true, try to re-trigger automation on coupon pages.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
	if (changeInfo.status !== "complete") return;
	if (!isCouponUrl(tab.url || "")) return;

	const { running = false } = await chrome.storage.local.get("running");
	if (!running) return;

	try {
		await chrome.tabs.sendMessage(tabId, { type: "automation-start" });
	} catch (err) {
		// Content script might not be injected (other pages), ignore.
	}
});
