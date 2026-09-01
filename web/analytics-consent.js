(() => {
  "use strict";

  const MEASUREMENT_ID = "G-1885X58SGB";
  const CONSENT_COOKIE = "capx_analytics_consent";
  const COOKIE_MAX_AGE_SECONDS = 31_536_000;
  const hostname = window.location.hostname;

  if (hostname !== "capx.ai" && !hostname.endsWith(".capx.ai")) return;

  function readConsent() {
    const prefix = `${CONSENT_COOKIE}=`;
    const value = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length);
    return value === "granted" || value === "denied" ? value : null;
  }

  function writeConsent(value) {
    document.cookie = `${CONSENT_COOKIE}=${value}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Domain=.capx.ai; Path=/; SameSite=Lax; Secure`;
  }

  function removeGoogleAnalyticsCookies() {
    for (const cookie of document.cookie.split(";")) {
      const name = cookie.split("=")[0]?.trim();
      if (name !== "_ga" && !name?.startsWith("_ga_")) continue;
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
      document.cookie = `${name}=; Max-Age=0; Domain=.capx.ai; Path=/; SameSite=Lax; Secure`;
    }
  }

  function configureGoogleAnalytics() {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() {
      window.dataLayer.push(arguments);
    };

    if (window.__capxGoogleAnalyticsConfigured) return;

    window.gtag("consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    window.gtag("consent", "update", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    window.gtag("js", new Date());
    window.gtag("config", MEASUREMENT_ID, {
      send_page_view: false,
      cookie_domain: "capx.ai",
      cookie_expires: COOKIE_MAX_AGE_SECONDS,
      cookie_flags: "SameSite=Lax;Secure",
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    window.__capxGoogleAnalyticsConfigured = true;
  }

  function trackPageView() {
    window.gtag?.("event", "page_view", {
      page_location: `${window.location.origin}${window.location.pathname}`,
      page_path: window.location.pathname,
      page_title: document.title,
    });
  }

  function loadGoogleAnalytics() {
    configureGoogleAnalytics();
    const existing = document.querySelector("script[data-capx-google-analytics]");
    if (existing?.dataset.loaded === "true") {
      trackPageView();
      return;
    }

    const script = existing || document.createElement("script");
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      trackPageView();
    }, { once: true });

    if (!existing) {
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
      script.dataset.capxGoogleAnalytics = "true";
      document.head.appendChild(script);
    }
  }

  function createButton(label, className, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  function showConsentDialog() {
    if (document.querySelector(".capx-analytics-consent")) return;

    const dialog = document.createElement("aside");
    dialog.className = "capx-analytics-consent";
    dialog.setAttribute("aria-labelledby", "capx-analytics-consent-title");

    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.id = "capx-analytics-consent-title";
    title.textContent = "Analytics cookies";
    const text = document.createElement("p");
    text.append("Help us understand how people move between Capx, Launchpad, and Terminal. Google Analytics loads only if you allow it, and we do not send wallet addresses. ");
    const privacy = document.createElement("a");
    privacy.href = "https://capx.ai/privacy#google-analytics";
    privacy.textContent = "Privacy notice";
    text.appendChild(privacy);
    copy.append(title, text);

    const actions = document.createElement("div");
    actions.className = "capx-analytics-consent-actions";
    actions.append(
      createButton("No thanks", "", () => {
        dialog.remove();
        writeConsent("denied");
        window.gtag?.("consent", "update", { analytics_storage: "denied" });
        removeGoogleAnalyticsCookies();
      }),
      createButton("Allow analytics", "allow", () => {
        dialog.remove();
        writeConsent("granted");
        loadGoogleAnalytics();
      }),
    );

    dialog.append(copy, actions);
    document.body.appendChild(dialog);
  }

  const consent = readConsent();
  if (consent === "granted") loadGoogleAnalytics();
  if (consent === null) showConsentDialog();
})();
