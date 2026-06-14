const APPLY_LABEL = "Aplicar";
const APPLY_DELAY_MS = 200;
const APPLY_JITTER_MS = 0;
const PAGE_DELAY_MS = 800;
const WAIT_FOR_PAGE_MS = 6000;
const API_TIMEOUT_MS = 5000;
let automationState = { running: false, abortController: null };

const OVERLAY_ID = "__ml_coupons_status";
const OVERLAY_RUNNING = "Rodando: aplicando cupons...";
const OVERLAY_STOPPED = "Parado";
const OVERLAY_WAITING = "Procurando cupons...";
const OVERLAY_DONE = "Tudo pronto: não há mais páginas";
const OVERLAY_NEXT = "Indo para a próxima página...";

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

function ensureOverlay() {
	let overlay = document.getElementById(OVERLAY_ID);

	if (!overlay) {
		overlay = document.createElement("div");
		overlay.id = OVERLAY_ID;
		Object.assign(overlay.style, {
			position: "fixed",
			top: "12px",
			right: "12px",
			zIndex: "999999",
			background: "#0b6efd",
			color: "#fff",
			padding: "8px 12px",
			borderRadius: "6px",
			boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
			fontFamily: "Arial, sans-serif",
			fontSize: "12px",
		});
		document.body.appendChild(overlay);
	}

	return overlay;
}

function setOverlay(text, color) {
	const overlay = ensureOverlay();
	overlay.textContent = text;
	if (color) overlay.style.background = color;
}

async function setRunningFlag(value) {
	try {
		await chrome.storage.local.set({ running: value });
	} catch {}
}

function getApiBasePath() {
	return window.__CUSTOM_STATE__?.basePath || "/cupons/api";
}

function getPageCoupons() {
	const coupons =
		window._n?.ctx?.r?.appProps?.pageProps?.filteredCouponsData?.coupons;
	return Array.isArray(coupons) ? coupons : [];
}

function getCsrfToken() {
	return (
		document.querySelector('meta[name="csrf-token"]')?.content ||
		window._n?.ctx?.r?.csrfToken ||
		""
	);
}

function isCheckButton(button) {
	const label = button.innerText.trim();
	const aria = (button.getAttribute("aria-label") || "").trim();

	return label.startsWith("Conferir") || aria.startsWith("Conferir");
}

function isCouponAppliedInDom(coupon) {
	const titleText = coupon.title?.text;
	if (!titleText) return false;

	for (const card of document.querySelectorAll(".coupon-card")) {
		const titleEl = card.querySelector(".title");
		const cardTitle =
			titleEl?.getAttribute("title") || titleEl?.textContent?.trim();

		if (cardTitle !== titleText) continue;

		if (card.querySelector(".andes-badge--green")) return true;

		const button = card.querySelector("button");
		if (button && isCheckButton(button)) return true;

		return false;
	}

	return false;
}

function getInactiveCoupons() {
	return getPageCoupons().filter((coupon) => {
		if (coupon.status?.id !== "INACTIVE") return false;
		if (coupon.action?.type !== "button") return false;
		if (!(coupon.code || coupon.inputCode)) return false;
		if (isCouponAppliedInDom(coupon)) return false;

		return true;
	});
}

function buildActivateUrl(campaignId, code) {
	const params = new URLSearchParams({
		coupon_activate_code: code,
		campaign_id: String(campaignId),
		origin: "filter",
	});

	const scope = window.__CUSTOM_STATE__?.scopeParam;
	const middle = window.__CUSTOM_STATE__?.middleVersionParam;
	if (scope) params.set("scope", scope);
	if (middle) params.set("middle", middle);

	const hasV2 =
		window._n?.ctx?.r?.appProps?.pageProps?.hasCouponsLandingRedesignV2;
	if (hasV2) params.set("wallet_experiment_on", "true");

	return `${getApiBasePath()}/activate?${params.toString()}`;
}

async function activateCouponViaApi(coupon, signal) {
	const code = coupon.code || coupon.inputCode;
	const url = buildActivateUrl(coupon.campaignId, code);
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

	if (signal) {
		signal.addEventListener("abort", () => controller.abort(), { once: true });
	}

	try {
		const csrfToken = getCsrfToken();
		const headers = { "Content-Type": "application/json" };

		if (csrfToken) headers["x-csrf-token"] = csrfToken;

		const response = await fetch(url, {
			method: "POST",
			headers,
			body: "{}",
			credentials: "include",
			signal: controller.signal,
		});

		return response.ok;
	} catch {
		return false;
	} finally {
		clearTimeout(timeoutId);
	}
}

function isApplyButton(button) {
	const label = button.innerText.trim();
	const aria = (button.getAttribute("aria-label") || "").trim();

	if (label.startsWith("Conferir") || aria.startsWith("Conferir")) return false;

	return label.startsWith(APPLY_LABEL) || aria.startsWith(APPLY_LABEL);
}

function getApplyButtons() {
	return Array.from(document.querySelectorAll(".coupon-card button")).filter(
		(button) => isApplyButton(button) && !button.disabled && isVisible(button),
	);
}

function getNextPageButton() {
	const selectors = [
		'a[title="Próximo"]',
		'a[title="Seguinte"]',
		'a[data-andes-pagination-control="next"]',
	];

	for (const selector of selectors) {
		const btn = document.querySelector(selector);
		if (!btn) continue;

		const li = btn.closest("li");
		const isDisabled =
			btn.className.includes("andes-pagination__button--disabled") ||
			(li?.className || "").includes("andes-pagination__button--disabled") ||
			btn.getAttribute("aria-disabled") === "true";

		if (!isDisabled) return btn;
	}

	return null;
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

async function waitForPageReady(signal) {
	const deadline = Date.now() + WAIT_FOR_PAGE_MS;

	while (Date.now() < deadline) {
		setOverlay(OVERLAY_WAITING, "#6c757d");

		if (
			getInactiveCoupons().length > 0 ||
			getApplyButtons().length > 0 ||
			document.querySelectorAll(".coupon-card").length > 0
		) {
			return;
		}

		await delay(200, signal);
	}
}

async function applyCouponsViaApi(signal) {
	const coupons = getInactiveCoupons();

	for (const coupon of coupons) {
		if (signal.aborted) throw new DOMException("Aborted", "AbortError");

		setOverlay(OVERLAY_RUNNING, "#0b6efd");

		const ok = await activateCouponViaApi(coupon, signal);
		if (!ok) {
			const button = getApplyButtons().find((btn) => {
				const aria = btn.getAttribute("aria-label") || "";
				return aria.includes(coupon.title?.text || "");
			});

			if (button) {
				button.scrollIntoView({ block: "center" });
				await delay(30, signal);
				button.click();
			}
		}

		const jitter = Math.floor(Math.random() * APPLY_JITTER_MS);
		await delay(APPLY_DELAY_MS + jitter, signal);
	}
}

async function clickApplyButtons(signal) {
	while (true) {
		const button = getApplyButtons()[0];
		if (!button) break;

		if (signal.aborted) throw new DOMException("Aborted", "AbortError");

		button.scrollIntoView({ block: "center" });
		await delay(30, signal);
		button.click();

		const jitter = Math.floor(Math.random() * APPLY_JITTER_MS);
		await delay(APPLY_DELAY_MS + jitter, signal);
	}
}

function pageSnapshot() {
	return {
		url: window.location.href,
		couponCount: document.querySelectorAll(".coupon-card").length,
		inactiveIds: getInactiveCoupons()
			.map((c) => c.campaignId)
			.join(","),
	};
}

async function waitForPageChange(before, signal) {
	const deadline = Date.now() + 12000;

	while (Date.now() < deadline) {
		if (signal.aborted) return;

		const after = pageSnapshot();
		if (
			after.url !== before.url ||
			after.couponCount !== before.couponCount ||
			after.inactiveIds !== before.inactiveIds
		) {
			return;
		}

		await delay(200, signal);
	}
}

async function runAutomation(signal) {
	try {
		while (true) {
			await waitForPageReady(signal);

			const buttons = getApplyButtons();
			const inactive = getInactiveCoupons();

			if (buttons.length > 0) {
				setOverlay(OVERLAY_RUNNING, "#0b6efd");
				await clickApplyButtons(signal);
			} else if (inactive.length > 0) {
				setOverlay(OVERLAY_RUNNING, "#0b6efd");
				await applyCouponsViaApi(signal);
			}

			if (signal.aborted) break;

			const next = getNextPageButton();
			if (!next) {
				setOverlay(OVERLAY_DONE, "#198754");
				automationState = { running: false, abortController: null };
				await setRunningFlag(false);
				break;
			}

			const before = pageSnapshot();
			setOverlay(OVERLAY_NEXT, "#0b6efd");
			await delay(PAGE_DELAY_MS, signal);
			next.click();
			await waitForPageChange(before, signal);
		}
	} catch (err) {
		if (err.name !== "AbortError") console.error("Automation error:", err);
	} finally {
		if (automationState.abortController?.signal === signal) {
			automationState = { running: false, abortController: null };
		}
		await setRunningFlag(false);
	}
}

function startAutomation() {
	if (automationState.running) return;

	const controller = new AbortController();
	automationState = { running: true, abortController: controller };
	setOverlay(OVERLAY_RUNNING, "#0b6efd");
	runAutomation(controller.signal);
}

function stopAutomation() {
	if (!automationState.running) return;

	automationState.abortController?.abort();
	automationState = { running: false, abortController: null };
	setOverlay(OVERLAY_STOPPED, "#6c757d");
}

function initFromStorage() {
	chrome.storage.local.get({ running: false }, ({ running }) => {
		if (running) {
			startAutomation();
			return;
		}

		setOverlay(OVERLAY_STOPPED, "#6c757d");
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

	if (changes.running.newValue) {
		startAutomation();
		return;
	}

	if (automationState.running) stopAutomation();
});

initFromStorage();
