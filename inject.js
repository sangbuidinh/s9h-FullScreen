(function () {
  const PATCH_FLAG = "__TAB_FS_PATCHED__";
  if (window[PATCH_FLAG]) {
    return;
  }

  try {
    Object.defineProperty(window, PATCH_FLAG, {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false
    });
  } catch (_error) {
    window[PATCH_FLAG] = true;
  }

  const CONFIG_EVENT_NAME = "__TAB_FS_CONFIG__";
  const CONFIG_ATTR_NAME = "data-extension-tab-fullscreen-enabled";
  const MESSAGE_MARKER = "__tabFs";
  const MESSAGE_VERSION = 1;

  const ATTR_FULLSCREEN = "data-extension-tab-fullscreen";
  const ATTR_ACTIVE = "data-extension-tab-fullscreen-active";
  const ATTR_ANCESTOR = "data-extension-tab-fullscreen-ancestor";
  const ATTR_SIBLING_HIDDEN = "data-extension-tab-fullscreen-sibling-hidden";

  const REQUEST_METHODS = [
    "requestFullscreen",
    "webkitRequestFullscreen",
    "webkitRequestFullScreen",
    "mozRequestFullScreen",
    "msRequestFullscreen"
  ];
  const EXIT_METHODS = [
    "exitFullscreen",
    "webkitExitFullscreen",
    "webkitCancelFullScreen",
    "mozCancelFullScreen",
    "msExitFullscreen"
  ];
  const FULLSCREEN_ELEMENT_PROPS = [
    "fullscreenElement",
    "webkitFullscreenElement",
    "mozFullScreenElement",
    "msFullscreenElement"
  ];
  const FULLSCREEN_ENABLED_PROPS = [
    "fullscreenEnabled",
    "webkitFullscreenEnabled",
    "mozFullScreenEnabled",
    "msFullscreenEnabled"
  ];
  const FULLSCREEN_BOOL_PROPS = [
    "fullscreen",
    "webkitIsFullScreen",
    "mozFullScreen"
  ];
  const FULLSCREEN_CHANGE_EVENTS = [
    "fullscreenchange",
    "webkitfullscreenchange",
    "mozfullscreenchange",
    "MSFullscreenChange"
  ];
  const TARGET_INLINE_RULES = [
    ["position", "fixed"],
    ["inset", "0"],
    ["top", "0"],
    ["left", "0"],
    ["right", "0"],
    ["bottom", "0"],
    ["width", "100vw"],
    ["height", "100vh"],
    ["max-width", "100vw"],
    ["max-height", "100vh"],
    ["margin", "0"],
    ["padding", "0"],
    ["z-index", "2147483647"],
    ["background", "#000"],
    ["box-sizing", "border-box"],
    ["border", "0"],
    ["border-radius", "0"],
    ["transform", "none"],
    ["filter", "none"],
    ["contain", "none"],
    ["clip-path", "none"]
  ];
  const VIDEO_INLINE_RULES = [
    ["display", "block"],
    ["object-fit", "contain"]
  ];
  const FRAME_INLINE_RULES = [["display", "block"]];
  const ROOT_INLINE_RULES = [
    ["overflow", "hidden"],
    ["overscroll-behavior", "none"]
  ];
  const ANCESTOR_INLINE_RULES = [
    ["transform", "none"],
    ["filter", "none"],
    ["perspective", "none"],
    ["contain", "none"],
    ["will-change", "auto"],
    ["clip-path", "none"],
    ["mask", "none"],
    ["-webkit-mask", "none"],
    ["backdrop-filter", "none"],
    ["overflow", "visible"]
  ];
  const HIDDEN_SIBLING_INLINE_RULES = [
    ["visibility", "hidden"],
    ["pointer-events", "none"]
  ];

  let enabled = readInitialEnabled();

  const state = {
    activeElement: null,
    activeSource: null, // "local" | "child"
    activeChildWindow: null,
    activeParentRelay: false,
    activeRequestId: null,
    overriddenAncestors: [],
    hiddenSiblings: [],
    styleRestorations: [],
    isRestoring: false,
    isHiddenExitSuppressed: false,
    mutationObserver: null
  };

  const originals = {
    elementMethods: Object.create(null),
    documentMethods: Object.create(null),
    descriptors: Object.create(null)
  };

  function readInitialEnabled() {
    const root = document.documentElement;
    const attr = root && root.getAttribute(CONFIG_ATTR_NAME);
    if (attr === "0") return false;
    if (attr === "1") return true;
    return true;
  }

  function resolvedPromise() {
    return Promise.resolve();
  }

  function queueTask(fn) {
    if (typeof queueMicrotask === "function") {
      queueMicrotask(fn);
      return;
    }
    setTimeout(fn, 0);
  }

  function getRectArea(rect) {
    if (!rect) return 0;
    const width = Math.max(0, Number(rect.width) || 0);
    const height = Math.max(0, Number(rect.height) || 0);
    return width * height;
  }

  function getRectIntersectionArea(a, b) {
    if (!a || !b) return 0;

    const left = Math.max(a.left, b.left);
    const right = Math.min(a.right, b.right);
    const top = Math.max(a.top, b.top);
    const bottom = Math.min(a.bottom, b.bottom);
    const width = right - left;
    const height = bottom - top;

    if (width <= 0 || height <= 0) return 0;
    return width * height;
  }

  function getElementRect(element) {
    if (!element || typeof element.getBoundingClientRect !== "function") {
      return null;
    }

    try {
      return element.getBoundingClientRect();
    } catch (_error) {
      return null;
    }
  }

  function isElementVisibleForFullscreen(element) {
    if (!element || !element.isConnected) {
      return false;
    }

    const rect = getElementRect(element);
    if (!rect || rect.width < 2 || rect.height < 2) {
      return false;
    }

    if (typeof getComputedStyle !== "function") {
      return true;
    }

    let style;
    try {
      style = getComputedStyle(element);
    } catch (_error) {
      return true;
    }

    if (!style) return true;
    if (style.display === "none") return false;
    if (style.visibility === "hidden") return false;

    const opacity = parseFloat(style.opacity || "1");
    if (Number.isFinite(opacity) && opacity <= 0) {
      return false;
    }

    return true;
  }

  function isLikelyMediaElement(element) {
    if (!element || !(element instanceof Element)) return false;
    const tag = (element.tagName || "").toLowerCase();
    return tag === "video" || tag === "iframe" || tag === "canvas";
  }

  function findPrimaryMediaDescendant(root) {
    if (!root || typeof root.querySelectorAll !== "function") {
      return null;
    }

    const mediaNodes = root.querySelectorAll("video, iframe, canvas");
    if (!mediaNodes || mediaNodes.length === 0) {
      return null;
    }

    let best = null;
    let secondBestArea = 0;
    let totalArea = 0;

    for (let i = 0; i < mediaNodes.length; i += 1) {
      const node = mediaNodes[i];
      if (!isElementVisibleForFullscreen(node)) continue;

      const rect = getElementRect(node);
      const area = getRectArea(rect);
      if (area < 160 * 90) continue;

      totalArea += area;
      if (!best || area > best.area) {
        if (best && best.area > secondBestArea) {
          secondBestArea = best.area;
        }
        best = { element: node, rect, area };
      } else if (area > secondBestArea) {
        secondBestArea = area;
      }
    }

    if (!best) {
      return null;
    }

    const bestShare = totalArea > 0 ? best.area / totalArea : 1;
    if (secondBestArea > 0 && best.area / secondBestArea < 1.2 && bestShare < 0.55) {
      return null;
    }

    return best;
  }

  function chooseTightMediaContainer(requestedElement, mediaElement, mediaRect) {
    if (!requestedElement || !mediaElement || mediaElement === requestedElement) {
      return mediaElement || requestedElement;
    }

    const baseRect = mediaRect || getElementRect(mediaElement);
    const baseArea = getRectArea(baseRect);
    if (!baseRect || baseArea <= 0) {
      return mediaElement;
    }

    let candidate = mediaElement;
    let current = mediaElement.parentElement;

    while (current && current !== requestedElement) {
      if (!isElementVisibleForFullscreen(current)) {
        break;
      }

      const rect = getElementRect(current);
      const area = getRectArea(rect);
      if (!rect || area <= 0) {
        break;
      }

      const overlapWithMedia = getRectIntersectionArea(rect, baseRect) / baseArea;
      if (overlapWithMedia < 0.98) {
        break;
      }

      const widthRatio = rect.width / baseRect.width;
      const heightRatio = rect.height / baseRect.height;
      const areaRatio = area / baseArea;

      if (widthRatio > 1.12 || heightRatio > 1.28 || areaRatio > 1.45) {
        break;
      }

      candidate = current;
      current = current.parentElement;
    }

    return candidate;
  }

  function resolvePreferredFullscreenTarget(requestedElement) {
    if (!requestedElement || !(requestedElement instanceof Element)) {
      return requestedElement;
    }

    if (isLikelyMediaElement(requestedElement)) {
      return requestedElement;
    }

    if (typeof requestedElement.querySelectorAll !== "function") {
      return requestedElement;
    }

    const mediaInfo = findPrimaryMediaDescendant(requestedElement);
    if (!mediaInfo || !mediaInfo.element) {
      return requestedElement;
    }

    const requestedRect = getElementRect(requestedElement);
    const mediaRect = mediaInfo.rect || getElementRect(mediaInfo.element);
    const requestedArea = getRectArea(requestedRect);
    const mediaArea = getRectArea(mediaRect);

    if (!requestedRect || !mediaRect || requestedArea <= 0 || mediaArea <= 0) {
      return requestedElement;
    }

    const widthRatio = requestedRect.width / mediaRect.width;
    const heightRatio = requestedRect.height / mediaRect.height;
    const areaRatio = requestedArea / mediaArea;
    const mediaCoverage = getRectIntersectionArea(requestedRect, mediaRect) / mediaArea;

    const oversizedContainer =
      widthRatio > 1.12 || heightRatio > 1.2 || areaRatio > 1.35;

    if (!oversizedContainer || mediaCoverage < 0.95) {
      return requestedElement;
    }

    const betterTarget = chooseTightMediaContainer(
      requestedElement,
      mediaInfo.element,
      mediaRect
    );

    return betterTarget || requestedElement;
  }

  function createRequestId() {
    return (
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 10)
    );
  }

  function isTopFrame() {
    return window.parent === window;
  }

  function hasPseudoFullscreen() {
    return !!state.activeElement;
  }

  function captureDescriptor(prop) {
    originals.descriptors[prop] = {
      proto: Object.getOwnPropertyDescriptor(Document.prototype, prop) || null,
      instance: Object.getOwnPropertyDescriptor(document, prop) || null
    };
  }

  function getOriginalPropertyValue(prop, thisArg) {
    const entry = originals.descriptors[prop];
    if (!entry) return undefined;

    const target = thisArg instanceof Document ? thisArg : document;
    const candidates = [entry.instance, entry.proto];
    for (let i = 0; i < candidates.length; i += 1) {
      const descriptor = candidates[i];
      if (!descriptor) continue;

      if (typeof descriptor.get === "function") {
        try {
          return descriptor.get.call(target);
        } catch (_error) {
          // Ignore and continue fallback chain.
        }
      } else if ("value" in descriptor) {
        return descriptor.value;
      }
    }

    return undefined;
  }

  function defineGetter(target, prop, getter, fallbackDescriptor) {
    try {
      Object.defineProperty(target, prop, {
        configurable: true,
        enumerable: fallbackDescriptor ? !!fallbackDescriptor.enumerable : true,
        get: getter
      });
      return true;
    } catch (_error) {
      return false;
    }
  }

  function dispatchFullscreenChange(target) {
    queueTask(() => {
      const shouldDispatchOnTarget =
        !!target && target !== document && typeof target.dispatchEvent === "function";
      const needsDocumentFallback =
        !shouldDispatchOnTarget || !target || !target.isConnected;

      for (let i = 0; i < FULLSCREEN_CHANGE_EVENTS.length; i += 1) {
        const type = FULLSCREEN_CHANGE_EVENTS[i];
        if (shouldDispatchOnTarget) {
          try {
            target.dispatchEvent(
              new Event(type, { bubbles: true, cancelable: false, composed: true })
            );
          } catch (_error) {
            // Ignore dispatch failures on stale nodes.
          }
        }

        if (needsDocumentFallback) {
          try {
            document.dispatchEvent(
              new Event(type, { bubbles: true, cancelable: false, composed: true })
            );
          } catch (_error) {
            // Ignore.
          }
        }
      }
    });
  }

  function setDocumentActiveFlag(active) {
    const root = document.documentElement;
    if (root) {
      if (active) {
        root.setAttribute(ATTR_ACTIVE, "true");
      } else {
        root.removeAttribute(ATTR_ACTIVE);
      }
    }

    if (document.body) {
      if (active) {
        document.body.setAttribute(ATTR_ACTIVE, "true");
      } else {
        document.body.removeAttribute(ATTR_ACTIVE);
      }
    }
  }

  function snapshotInlineStyle(element, prop) {
    if (!element || !element.style) return;

    state.styleRestorations.push({
      element,
      prop,
      value: element.style.getPropertyValue(prop),
      priority: element.style.getPropertyPriority(prop),
      hadInline:
        element.style.getPropertyValue(prop) !== "" ||
        element.style.getPropertyPriority(prop) !== ""
    });
  }

  function setInlineStyleImportant(element, prop, value) {
    if (!element || !element.style) return;
    snapshotInlineStyle(element, prop);

    try {
      element.style.setProperty(prop, value, "important");
    } catch (_error) {
      // Ignore unsupported style properties in older engines.
    }
  }

  function applyInlineRules(element, rules) {
    if (!element || !rules || rules.length === 0) return;
    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i];
      if (!rule || rule.length < 2) continue;
      setInlineStyleImportant(element, rule[0], rule[1]);
    }
  }

  function restoreInlineStyles() {
    for (let i = state.styleRestorations.length - 1; i >= 0; i -= 1) {
      const snapshot = state.styleRestorations[i];
      const element = snapshot && snapshot.element;
      if (!element || !element.style) continue;

      try {
        if (snapshot.hadInline) {
          element.style.setProperty(
            snapshot.prop,
            snapshot.value,
            snapshot.priority || ""
          );
        } else {
          element.style.removeProperty(snapshot.prop);
        }
      } catch (_error) {
        // Ignore stale nodes.
      }
    }

    state.styleRestorations = [];
  }

  function clearAncestors() {
    for (let i = 0; i < state.overriddenAncestors.length; i += 1) {
      const el = state.overriddenAncestors[i];
      if (!el || !el.removeAttribute) continue;
      try {
        el.removeAttribute(ATTR_ANCESTOR);
      } catch (_error) {
        // Ignore detached/stale nodes.
      }
    }
    state.overriddenAncestors = [];
  }

  function clearHiddenSiblings() {
    for (let i = 0; i < state.hiddenSiblings.length; i += 1) {
      const el = state.hiddenSiblings[i];
      if (!el || !el.removeAttribute) continue;
      try {
        el.removeAttribute(ATTR_SIBLING_HIDDEN);
      } catch (_error) {
        // Ignore detached/stale nodes.
      }
    }
    state.hiddenSiblings = [];
  }

  function markAncestorsFor(element) {
    clearAncestors();
    if (!element || !element.parentElement) return;

    let parent = element.parentElement;
    while (parent && parent !== document.documentElement) {
      try {
        parent.setAttribute(ATTR_ANCESTOR, "true");
        state.overriddenAncestors.push(parent);
      } catch (_error) {
        // Ignore unexpected DOM errors.
      }
      parent = parent.parentElement;
    }
  }

  function hideSiblingBranchesFor(element) {
    clearHiddenSiblings();
    if (!element || !element.parentElement) return;

    const shouldKeepImmediateSiblings =
      isLikelyMediaElement(element) && element.parentElement !== document.body;
    let skipImmediateSiblings = shouldKeepImmediateSiblings;
    let current = element;

    while (
      current &&
      current.parentElement &&
      current.parentElement !== document.documentElement
    ) {
      const parent = current.parentElement;
      if (!skipImmediateSiblings && parent.children && parent.children.length > 1) {
        const siblings = parent.children;
        for (let i = 0; i < siblings.length; i += 1) {
          const sibling = siblings[i];
          if (!sibling || sibling === current) continue;

          try {
            sibling.setAttribute(ATTR_SIBLING_HIDDEN, "true");
            state.hiddenSiblings.push(sibling);
            applyInlineRules(sibling, HIDDEN_SIBLING_INLINE_RULES);
          } catch (_error) {
            // Ignore styling issues on transient nodes.
          }
        }
      }

      skipImmediateSiblings = false;
      current = parent;
    }
  }

  function applyInlineFullscreenOverrides(element) {
    if (!element) return;

    applyInlineRules(element, TARGET_INLINE_RULES);

    const tag = (element.tagName || "").toLowerCase();
    if (tag === "video") {
      applyInlineRules(element, VIDEO_INLINE_RULES);
    } else if (tag === "iframe" || tag === "frame") {
      applyInlineRules(element, FRAME_INLINE_RULES);
    }

    if (document.documentElement) {
      applyInlineRules(document.documentElement, ROOT_INLINE_RULES);
    }
    if (document.body) {
      applyInlineRules(document.body, ROOT_INLINE_RULES);
    }

    for (let i = 0; i < state.overriddenAncestors.length; i += 1) {
      applyInlineRules(state.overriddenAncestors[i], ANCESTOR_INLINE_RULES);
    }
  }

  function applyVisualFullscreen(element) {
    if (!element || !element.setAttribute) return;
    restoreInlineStyles();
    clearHiddenSiblings();
    element.setAttribute(ATTR_FULLSCREEN, "true");
    markAncestorsFor(element);
    hideSiblingBranchesFor(element);
    applyInlineFullscreenOverrides(element);
    setDocumentActiveFlag(true);
  }

  function clearVisualFullscreen(element) {
    restoreInlineStyles();
    clearHiddenSiblings();

    if (element && element.removeAttribute) {
      try {
        element.removeAttribute(ATTR_FULLSCREEN);
      } catch (_error) {
        // Ignore.
      }
    }
    clearAncestors();
    setDocumentActiveFlag(false);
  }

  function reassertFullscreenState() {
    if (!state.activeElement || state.isRestoring) {
      return;
    }

    if (!state.activeElement.isConnected) {
      void teardownActiveSession({
        reason: "dom-remove",
        forceChild: state.activeSource === "child"
      });
      return;
    }

    state.isRestoring = true;
    try {
      applyVisualFullscreen(state.activeElement);
      state.isHiddenExitSuppressed = false;
    } finally {
      state.isRestoring = false;
    }
  }

  function buildMessage(type, extra) {
    return Object.assign(
      {
        [MESSAGE_MARKER]: true,
        v: MESSAGE_VERSION,
        type
      },
      extra || {}
    );
  }

  function postToParent(type, extra) {
    if (isTopFrame()) return false;
    try {
      window.parent.postMessage(buildMessage(type, extra), "*");
      return true;
    } catch (_error) {
      return false;
    }
  }

  function postToChild(childWindow, type, extra) {
    if (!childWindow || typeof childWindow.postMessage !== "function") {
      return false;
    }
    try {
      childWindow.postMessage(buildMessage(type, extra), "*");
      return true;
    } catch (_error) {
      return false;
    }
  }

  function findDirectFrameElementForWindow(childWindow) {
    if (!childWindow) return null;
    const frameElements = document.querySelectorAll("iframe, frame");
    for (let i = 0; i < frameElements.length; i += 1) {
      const frameElement = frameElements[i];
      try {
        if (frameElement.contentWindow === childWindow) {
          return frameElement;
        }
      } catch (_error) {
        // Cross-origin access to contentWindow equality is allowed, but be defensive.
      }
    }
    return null;
  }

  function activateSession(options) {
    const element = options.element;
    if (!element || typeof element.setAttribute !== "function") {
      return false;
    }

    state.activeElement = element;
    state.activeSource = options.source;
    state.activeChildWindow = options.childWindow || null;
    state.activeParentRelay = false;
    state.activeRequestId = options.requestId || createRequestId();
    state.isHiddenExitSuppressed = false;

    applyVisualFullscreen(element);

    if (options.dispatchEvent !== false) {
      dispatchFullscreenChange(element);
    }

    return true;
  }

  function teardownActiveSession(options) {
    if (!state.activeElement) {
      return resolvedPromise();
    }

    const opts = options || {};
    const reason = opts.reason || "api";
    const oldElement = state.activeElement;
    const oldSource = state.activeSource;
    const oldChildWindow = state.activeChildWindow;
    const oldRequestId = state.activeRequestId;
    const shouldNotifyParent =
      opts.notifyParent !== false && state.activeParentRelay && !isTopFrame();
    const shouldForceChild =
      !!opts.forceChild && oldSource === "child" && !!oldChildWindow;
    const shouldDispatch = opts.dispatchEvent !== false;

    state.activeElement = null;
    state.activeSource = null;
    state.activeChildWindow = null;
    state.activeParentRelay = false;
    state.activeRequestId = null;
    state.isHiddenExitSuppressed = false;

    clearVisualFullscreen(oldElement);

    if (shouldForceChild) {
      postToChild(oldChildWindow, "FORCE_EXIT", {
        requestId: oldRequestId,
        reason
      });
    }

    if (shouldNotifyParent) {
      postToParent("CHILD_EXIT", {
        requestId: oldRequestId,
        reason
      });
    }

    if (shouldDispatch) {
      dispatchFullscreenChange(oldElement);
    }

    return resolvedPromise();
  }

  function enterLocalPseudoFullscreen(element) {
    if (!element || typeof element.setAttribute !== "function") {
      return resolvedPromise();
    }

    if (state.activeSource === "local" && state.activeElement === element) {
      reassertFullscreenState();
      return resolvedPromise();
    }

    if (hasPseudoFullscreen()) {
      void teardownActiveSession({
        reason: "replace",
        forceChild: state.activeSource === "child"
      });
    }

    const requestId = createRequestId();
    activateSession({
      element,
      source: "local",
      requestId
    });

    if (!isTopFrame()) {
      state.activeParentRelay = postToParent("CHILD_ENTER", {
        requestId,
        reason: "api"
      });
    }

    return resolvedPromise();
  }

  function enterChildRelaySession(frameElement, childWindow, requestId, reason) {
    if (!frameElement) return;

    const normalizedRequestId = requestId || createRequestId();
    const sameSession =
      state.activeSource === "child" &&
      state.activeChildWindow === childWindow &&
      state.activeElement === frameElement &&
      (!state.activeRequestId ||
        !normalizedRequestId ||
        state.activeRequestId === normalizedRequestId);

    if (sameSession) {
      reassertFullscreenState();
      if (!state.activeParentRelay && !isTopFrame()) {
        state.activeParentRelay = postToParent("CHILD_ENTER", {
          requestId: state.activeRequestId || normalizedRequestId,
          reason: reason || "api"
        });
      }
      return;
    }

    if (hasPseudoFullscreen()) {
      const replacingDifferentChild =
        state.activeSource === "child" && state.activeChildWindow !== childWindow;

      void teardownActiveSession({
        reason: "replace",
        forceChild: replacingDifferentChild
      });
    }

    activateSession({
      element: frameElement,
      source: "child",
      childWindow,
      requestId: normalizedRequestId
    });

    if (!isTopFrame()) {
      state.activeParentRelay = postToParent("CHILD_ENTER", {
        requestId: normalizedRequestId,
        reason: reason || "api"
      });
    }
  }

  function handleRequestFullscreenCall(original, context, args) {
    if (!enabled) {
      return original.apply(context, args);
    }

    if (!(context instanceof Element)) {
      return original.apply(context, args);
    }

    const preferredTarget = resolvePreferredFullscreenTarget(context);
    return enterLocalPseudoFullscreen(preferredTarget || context);
  }

  function handleExitFullscreenCall(original, context, args) {
    if (!(context instanceof Document) || context !== document) {
      if (typeof original === "function") {
        return original.apply(context, args);
      }
      return resolvedPromise();
    }

    if (hasPseudoFullscreen()) {
      if (document.hidden) {
        state.isHiddenExitSuppressed = true;
        return resolvedPromise();
      }

      return teardownActiveSession({
        reason: "api",
        forceChild: state.activeSource === "child"
      });
    }

    if (typeof original === "function") {
      return original.apply(context, args);
    }

    return resolvedPromise();
  }

  function patchMethods() {
    const requestPrototypeTargets = [Element.prototype];
    if (typeof HTMLElement !== "undefined" && HTMLElement.prototype) {
      requestPrototypeTargets.push(HTMLElement.prototype);
    }
    if (typeof HTMLVideoElement !== "undefined" && HTMLVideoElement.prototype) {
      requestPrototypeTargets.push(HTMLVideoElement.prototype);
    }

    for (let i = 0; i < REQUEST_METHODS.length; i += 1) {
      const methodName = REQUEST_METHODS[i];
      for (let p = 0; p < requestPrototypeTargets.length; p += 1) {
        const proto = requestPrototypeTargets[p];
        if (!proto) continue;
        if (
          proto !== Element.prototype &&
          !Object.prototype.hasOwnProperty.call(proto, methodName)
        ) {
          continue;
        }

        const original = proto[methodName];
        if (typeof original !== "function") continue;

        const storageKey =
          (proto.constructor && proto.constructor.name
            ? proto.constructor.name
            : "Proto") + "." + methodName;
        if (!originals.elementMethods[storageKey]) {
          originals.elementMethods[storageKey] = original;
        }

        const patched = function (...args) {
          return handleRequestFullscreenCall(original, this, args);
        };

        try {
          Object.defineProperty(proto, methodName, {
            configurable: true,
            writable: true,
            value: patched
          });
        } catch (_error) {
          try {
            proto[methodName] = patched;
          } catch (_error2) {
            // Ignore if patching fails on this browser.
          }
        }
      }
    }

    for (let i = 0; i < EXIT_METHODS.length; i += 1) {
      const methodName = EXIT_METHODS[i];
      const original = Document.prototype[methodName];
      if (typeof original !== "function") continue;

      originals.documentMethods[methodName] = original;

      const patched = function (...args) {
        return handleExitFullscreenCall(original, this, args);
      };

      try {
        Object.defineProperty(Document.prototype, methodName, {
          configurable: true,
          writable: true,
          value: patched
        });
      } catch (_error) {
        try {
          Document.prototype[methodName] = patched;
        } catch (_error2) {
          // Ignore if patching fails on this browser.
        }
      }
    }
  }

  function patchProperties() {
    const allProps = FULLSCREEN_ELEMENT_PROPS
      .concat(FULLSCREEN_ENABLED_PROPS)
      .concat(FULLSCREEN_BOOL_PROPS);

    for (let i = 0; i < allProps.length; i += 1) {
      captureDescriptor(allProps[i]);
    }

    for (let i = 0; i < FULLSCREEN_ELEMENT_PROPS.length; i += 1) {
      const prop = FULLSCREEN_ELEMENT_PROPS[i];
      const stored = originals.descriptors[prop];

      const getter = function () {
        if (state.activeElement) {
          return state.activeElement;
        }
        const nativeValue = getOriginalPropertyValue(prop, this);
        return nativeValue === undefined ? null : nativeValue;
      };

      defineGetter(Document.prototype, prop, getter, stored && stored.proto);
      defineGetter(document, prop, getter, stored && stored.instance);
    }

    for (let i = 0; i < FULLSCREEN_ENABLED_PROPS.length; i += 1) {
      const prop = FULLSCREEN_ENABLED_PROPS[i];
      const stored = originals.descriptors[prop];

      const getter = function () {
        if (enabled || state.activeElement) {
          return true;
        }
        const nativeValue = getOriginalPropertyValue(prop, this);
        if (typeof nativeValue === "boolean") {
          return nativeValue;
        }
        return true;
      };

      defineGetter(Document.prototype, prop, getter, stored && stored.proto);
      defineGetter(document, prop, getter, stored && stored.instance);
    }

    for (let i = 0; i < FULLSCREEN_BOOL_PROPS.length; i += 1) {
      const prop = FULLSCREEN_BOOL_PROPS[i];
      const stored = originals.descriptors[prop];

      const getter = function () {
        if (state.activeElement) {
          return true;
        }
        const nativeValue = getOriginalPropertyValue(prop, this);
        if (typeof nativeValue === "boolean") {
          return nativeValue;
        }
        return false;
      };

      defineGetter(Document.prototype, prop, getter, stored && stored.proto);
      defineGetter(document, prop, getter, stored && stored.instance);
    }
  }

  function onConfigEvent(event) {
    const detail = event && event.detail;
    if (!detail || typeof detail.enabled !== "boolean") {
      return;
    }
    enabled = detail.enabled;
  }

  function isRelayMessage(data) {
    return (
      data &&
      typeof data === "object" &&
      data[MESSAGE_MARKER] === true &&
      data.v === MESSAGE_VERSION &&
      typeof data.type === "string"
    );
  }

  function handleChildEnterMessage(event, data) {
    if (!enabled && !hasPseudoFullscreen()) {
      return;
    }

    const childWindow = event.source;
    if (!childWindow || childWindow === window) {
      return;
    }

    const frameElement = findDirectFrameElementForWindow(childWindow);
    if (!frameElement) {
      return;
    }

    enterChildRelaySession(
      frameElement,
      childWindow,
      typeof data.requestId === "string" ? data.requestId : null,
      data.reason
    );
  }

  function handleChildExitMessage(event, data) {
    if (!hasPseudoFullscreen() || state.activeSource !== "child") {
      return;
    }

    if (state.activeChildWindow !== event.source) {
      return;
    }

    if (
      typeof data.requestId === "string" &&
      typeof state.activeRequestId === "string" &&
      data.requestId !== state.activeRequestId
    ) {
      return;
    }

    void teardownActiveSession({
      reason: data.reason || "api",
      forceChild: false
    });
  }

  function handleForceExitMessage(event, data) {
    if (event.source !== window.parent) {
      return;
    }

    if (!hasPseudoFullscreen()) {
      return;
    }

    if (
      typeof data.requestId === "string" &&
      typeof state.activeRequestId === "string" &&
      data.requestId !== state.activeRequestId
    ) {
      return;
    }

    void teardownActiveSession({
      reason: data.reason || "api",
      forceChild: true
    });
  }

  function onMessage(event) {
    if (!isRelayMessage(event.data)) {
      return;
    }

    const data = event.data;
    switch (data.type) {
      case "CHILD_ENTER":
        handleChildEnterMessage(event, data);
        break;
      case "CHILD_EXIT":
        handleChildExitMessage(event, data);
        break;
      case "FORCE_EXIT":
        handleForceExitMessage(event, data);
        break;
      default:
        break;
    }
  }

  function onEscapeKey(event) {
    if (event.key !== "Escape" || !hasPseudoFullscreen()) {
      return;
    }

    void teardownActiveSession({
      reason: "esc",
      forceChild: state.activeSource === "child"
    });
  }

  function onVisibilityChange() {
    if (document.hidden) {
      return;
    }
    reassertFullscreenState();
  }

  function onLifecycleRestore() {
    reassertFullscreenState();
  }

  function maybeInitMutationObserver() {
    if (state.mutationObserver || typeof MutationObserver !== "function") {
      return;
    }

    const root = document.documentElement;
    if (!root) {
      return;
    }

    state.mutationObserver = new MutationObserver(() => {
      if (!hasPseudoFullscreen()) {
        return;
      }

      if (!state.activeElement || !state.activeElement.isConnected) {
        void teardownActiveSession({
          reason: "dom-remove",
          forceChild: state.activeSource === "child"
        });
        return;
      }

      const rootActive = document.documentElement
        ? document.documentElement.getAttribute(ATTR_ACTIVE) === "true"
        : false;
      const bodyActive = document.body
        ? document.body.getAttribute(ATTR_ACTIVE) === "true"
        : true;
      const targetActive =
        state.activeElement.getAttribute &&
        state.activeElement.getAttribute(ATTR_FULLSCREEN) === "true";

      if (!rootActive || !bodyActive || !targetActive) {
        reassertFullscreenState();
      }
    });

    state.mutationObserver.observe(root, {
      childList: true,
      subtree: true
    });
  }

  function installListeners() {
    window.addEventListener(CONFIG_EVENT_NAME, onConfigEvent);
    window.addEventListener("message", onMessage);
    document.addEventListener("keydown", onEscapeKey, true);
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("readystatechange", onLifecycleRestore);
    window.addEventListener("pageshow", onLifecycleRestore);
    window.addEventListener("focus", onLifecycleRestore);

    maybeInitMutationObserver();
    if (!state.mutationObserver) {
      document.addEventListener("DOMContentLoaded", maybeInitMutationObserver, {
        once: true
      });
    }
  }

  patchMethods();
  patchProperties();
  installListeners();
})();
