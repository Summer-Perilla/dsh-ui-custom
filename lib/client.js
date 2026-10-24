window.__ModuleLoader__.load({
  id: "dsh-ui-custom",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const inject = ["layout"];

    const STORAGE_KEY = "dsh.ui-custom.v1";
    const ATTR = "data-dse";
    const ATTR_EDITING = "data-dse-editing";
    const ATTR_UI = "data-dse-ui";
    const STYLE_ID = "dsh-ui-custom-style";

    const SIDEBAR_MIN = 200;
    const SIDEBAR_MAX = 760;
    const RAIL_MIN = 40;
    const RAIL_MAX = 96;
    const CENTER_MIN_MIN = 320;
    const CENTER_MIN_MAX = 900;
    const MIN_SIZE = 8;
    const MAX_SIZE = 4000;
    const UNDO_LIMIT = 50;
    const BOX_LIMIT = 24;

    const HASH_CLASS = /^(?=[A-Za-z0-9]*[A-Z])[A-Za-z0-9]{3,10}[_-][A-Za-z][A-Za-z0-9_-]*$/;

    const STATE_WORD = /(active|selected|current|checked|open|opened|closed|hover|focus|disabled|hidden|collapsed|expanded|dragging|animating|loading|pressed|visible|empty|highlight)/i;

    const defaults = () => ({
      sidebarWidth: null,
      railWidth: 56,
      centerMin: 400,
      sameKind: true,
      scaleFont: true,
      cascade: true,
      snap: { on: true, grid: 3, guides: true },
      panel: { left: null, top: null, width: null, height: null, min: false },
      entry: { left: 10, bottom: 10 },
      overrides: [],
    });

    let state = defaults();
    let editing = false;
    let selection = new Set();
    let primary = null;

    const assigned = new WeakMap();
    let seq = 0;
    let lastCols = "";
    let undoStack = [];
    let redoStack = [];

    function normalize(parsed) {
      const next = defaults();
      if (!parsed || typeof parsed !== "object") return next;
      if (typeof parsed.sidebarWidth === "number") next.sidebarWidth = parsed.sidebarWidth;
      if (typeof parsed.railWidth === "number") next.railWidth = parsed.railWidth;
      if (typeof parsed.centerMin === "number") next.centerMin = parsed.centerMin;
      if (typeof parsed.sameKind === "boolean") next.sameKind = parsed.sameKind;
      if (typeof parsed.scaleFont === "boolean") next.scaleFont = parsed.scaleFont;
      if (typeof parsed.cascade === "boolean") next.cascade = parsed.cascade;
      if (parsed.snap && typeof parsed.snap === "object") {
        if (typeof parsed.snap.on === "boolean") next.snap.on = parsed.snap.on;
        if (typeof parsed.snap.guides === "boolean") next.snap.guides = parsed.snap.guides;
        if (typeof parsed.snap.grid === "number" && parsed.snap.grid >= 0) {
          next.snap.grid = Math.min(64, Math.round(parsed.snap.grid));
        }
      }
      if (parsed.panel && typeof parsed.panel === "object") {
        for (const k of ["left", "top", "width", "height"]) {
          const v = parsed.panel[k];
          if (typeof v === "number" && Number.isFinite(v)) next.panel[k] = v;
        }
        if (typeof parsed.panel.min === "boolean") next.panel.min = parsed.panel.min;
      }
      if (parsed.entry && typeof parsed.entry === "object") {
        for (const k of ["left", "bottom"]) {
          const v = parsed.entry[k];
          if (typeof v === "number" && Number.isFinite(v)) next.entry[k] = v;
        }
      }
      if (Array.isArray(parsed.overrides)) {
        next.overrides = parsed.overrides
          .filter((o) => o && typeof o.selector === "string" && o.selector)
          .map((o) => ({
            id: Number(o.id) || 0,
            selector: o.selector,
            label: typeof o.label === "string" ? o.label : o.selector,
            width: typeof o.width === "number" ? o.width : null,
            height: typeof o.height === "number" ? o.height : null,
            hidden: o.hidden === true,
            offsetX: typeof o.offsetX === "number" && Number.isFinite(o.offsetX) ? o.offsetX : null,
            offsetY: typeof o.offsetY === "number" && Number.isFinite(o.offsetY) ? o.offsetY : null,
            fontSize: typeof o.fontSize === "number" && Number.isFinite(o.fontSize) ? o.fontSize : null,
            z: typeof o.z === "number" && Number.isFinite(o.z) ? o.z : 30,
            flow: o.flow !== false,
            needPos: o.needPos !== false,
            touched: o.touched !== false,
            count: typeof o.count === "number" && o.count > 0 ? o.count : 1,
          }));

        const seen = new Set();
        next.overrides = next.overrides.filter((o) => {
          if (seen.has(o.selector)) return false;
          seen.add(o.selector);
          return true;
        });
      }
      return next;
    }

    function reseq() {
      seq = state.overrides.reduce((m, o) => Math.max(m, Number(o.id) || 0), 0);
      for (const o of state.overrides) if (!o.id) o.id = ++seq;
      const ids = new Set(state.overrides.map((o) => o.id));
      for (const id of [...selection]) if (!ids.has(id)) selection.delete(id);
      if (primary != null && !ids.has(primary)) primary = selection.size ? [...selection][0] : null;
      if (primary == null && selection.size) primary = [...selection][0];
    }

    function loadState() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) state = normalize(JSON.parse(raw));
      } catch {

      }
      reseq();
    }

    let saveTimer = 0;
    function saveState() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = 0;
        flushSave();
      }, 150);
    }

    function flushSave() {
      clearTimeout(saveTimer);
      saveTimer = 0;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {

      }
    }

    function snapshot() {
      return JSON.stringify({
        sidebarWidth: state.sidebarWidth,
        railWidth: state.railWidth,
        centerMin: state.centerMin,
        sameKind: state.sameKind,
        scaleFont: state.scaleFont,
        overrides: state.overrides,
      });
    }

    function beginEdit() {
      return snapshot();
    }

    function commitEdit(before) {
      if (before === snapshot()) return false;
      undoStack.push(before);
      if (undoStack.length > UNDO_LIMIT) undoStack.shift();
      redoStack.length = 0;
      saveState();
      return true;
    }

    function restoreSnapshot(text) {
      const panel = state.panel;
      state = normalize(JSON.parse(text));
      state.panel = panel;
      reseq();
      lastCols = "";
      saveState();
      applyCss();
      syncFrame();
      renderPanel();
      positionSelection();
    }

    function undo() {
      if (!undoStack.length) return;
      redoStack.push(snapshot());
      restoreSnapshot(undoStack.pop());
    }

    function redo() {
      if (!redoStack.length) return;
      undoStack.push(snapshot());
      restoreSnapshot(redoStack.pop());
    }

    let styleEl = null;

    function ensureStyle() {
      if (styleEl && styleEl.isConnected) return styleEl;
      const found = document.getElementById(STYLE_ID);
      if (found) {
        styleEl = found;
        return styleEl;
      }
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ID;
      document.head.append(styleEl);
      return styleEl;
    }

    function buildCss() {
      const out = [];

      out.push(`@media (min-width: 1025px) {
  html[${ATTR}] [data-slot="root"] > [class*=_frame] {
    grid-template-columns:
      var(--dse-sidebar-width, 280px)
      minmax(var(--dse-center-min, 400px), 1fr)
      var(--dse-rightbar-width, 0px) !important;
  }
}`);

      for (const o of state.overrides) {
        if (!o.touched) continue;
        const decl = [];
        if (o.hidden) decl.push("display: none !important;");
        if (typeof o.width === "number") {

          decl.push(`width: ${o.width}px !important;`, "min-width: 0 !important;");
        }
        if (typeof o.height === "number") {
          decl.push(`height: ${o.height}px !important;`, "min-height: 0 !important;");
        }
        if (typeof o.fontSize === "number") decl.push(`font-size: ${o.fontSize}px !important;`);

        const moved = typeof o.offsetX === "number" || typeof o.offsetY === "number";
        if (moved) {

          if (o.flow) {

            decl.push("position: absolute !important;");
            decl.push("left: auto !important; top: auto !important;");
            decl.push("right: auto !important; bottom: auto !important;");
          } else if (o.needPos) {

            decl.push("position: relative !important;");
          }
          decl.push(`z-index: ${typeof o.z === "number" ? o.z : 30} !important;`);
          decl.push(`translate: ${o.offsetX ?? 0}px ${o.offsetY ?? 0}px !important;`);
        }
        if (!decl.length) continue;
        out.push(`${o.selector} { ${decl.join(" ")} }`);
      }

      return out.join("\n\n");
    }

    function applyCss() {
      const el = ensureStyle();
      const css = buildCss();
      if (el.textContent !== css) el.textContent = css;
    }

    let frameCache = null;

    function findFrame() {
      if (frameCache && frameCache.isConnected) return frameCache;
      frameCache =
        document.querySelector('[data-slot="root"] > [class*=_frame]') ||
        document.querySelector("[class*=_frame]");
      return frameCache;
    }

    function syncFrame() {
      const root = document.documentElement;
      const frame = findFrame();
      if (!frame) {
        root.removeAttribute(ATTR);
        return;
      }

      const raw = frame.style.gridTemplateColumns || "";
      const first = raw.match(/^\s*([\d.]+)px/);
      const third = raw.match(/minmax\(\s*0px\s*,\s*(-?[\d.]+)px\s*\)/);
      const nativeSidebar = first ? parseFloat(first[1]) : 280;
      const rightbar = third ? Math.max(0, parseFloat(third[1])) : 0;
      const collapsed = frame.hasAttribute("data-sidebar-collapsed");

      const effectiveSidebar = collapsed
        ? nativeSidebar > 0
          ? state.railWidth
          : nativeSidebar
        : state.sidebarWidth == null
          ? nativeSidebar
          : state.sidebarWidth;

      const want = `${effectiveSidebar}|${state.centerMin}|${rightbar}`;
      if (want !== lastCols) {
        lastCols = want;
        root.style.setProperty("--dse-sidebar-width", `${effectiveSidebar}px`);
        root.style.setProperty("--dse-center-min", `${state.centerMin}px`);
        root.style.setProperty("--dse-rightbar-width", `${rightbar}px`);
      }
      if (!root.hasAttribute(ATTR)) root.setAttribute(ATTR, "");

      positionGrip();
    }

    function stableSuffix(cls) {
      const i = cls.lastIndexOf("_");
      return i > 0 ? cls.slice(i + 1) : cls;
    }

    function attrEscape(value) {
      return value.replace(/["\\]/g, "\\$&");
    }

    function elementCount(sel) {
      try {
        return document.querySelectorAll(sel).length;
      } catch {
        return 0;
      }
    }

    function unique(sel) {
      return elementCount(sel) === 1;
    }

    function classPart(el) {
      let part = el.tagName.toLowerCase();
      const seen = new Set();
      for (const c of el.classList) {
        const s = stableSuffix(c);
        if (!s || seen.has(s)) continue;
        seen.add(s);
        part += `[class*="_${attrEscape(s)}"]`;
      }
      return part;
    }

    function nthOf(el) {
      const parent = el.parentElement;
      if (!parent) return "";
      let nth = 1;
      let count = 0;
      for (const sib of parent.children) {
        if (sib.tagName === el.tagName) {
          count += 1;
          if (sib === el) nth = count;
        }
      }
      return count > 1 ? `:nth-of-type(${nth})` : "";
    }

    function selectorFor(el) {
      const slot = el.getAttribute("data-slot");
      if (slot) {
        const sel = `[data-slot="${attrEscape(slot)}"]`;
        if (unique(sel)) return sel;
      }

      const parts = [];
      let cur = el;
      while (cur && cur !== document.body && cur !== document.documentElement && parts.length < 12) {
        const part = classPart(cur) + nthOf(cur);
        parts.unshift(part);
        const sel = parts.join(" > ");
        if (unique(sel)) return sel;
        if (!cur.parentElement) break;
        cur = cur.parentElement;
      }
      return parts.join(" > ");
    }

    function signatureOf(el) {
      const cls = [];
      for (const c of el.classList) cls.push(c);
      cls.sort();
      return `${el.tagName.toLowerCase()}|${cls.join(" ")}`;
    }

    function allSameSignature(sel, el) {
      let nodes;
      try {
        nodes = [...document.querySelectorAll(sel)];
      } catch {
        return false;
      }
      if (!nodes.length) return false;
      const sig = signatureOf(el);
      for (const n of nodes) if (signatureOf(n) !== sig) return false;
      return true;
    }

    function cmpKey(a, b) {
      for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
      }
      return 0;
    }

    function kindSelectorFor(el) {
      const tag = el.tagName.toLowerCase();
      const cands = [];

      const slot = el.getAttribute("data-slot");
      if (slot) cands.push({ selector: `[data-slot="${attrEscape(slot)}"]`, token: slot, isSlot: true });

      for (const c of el.classList) {
        if (!HASH_CLASS.test(c)) continue;
        cands.push({ selector: `${tag}[class~="${attrEscape(c)}"]`, token: c, isSlot: false });
      }
      if (!cands.length) return null;

      let best = null;
      for (const c of cands) {
        const n = elementCount(c.selector);
        if (!n) continue;

        const key = [n, c.isSlot ? 1 : 0, STATE_WORD.test(c.token) ? 0 : 1, -c.token.length];
        if (!best || cmpKey(key, best.key) > 0) best = { key, selector: c.selector, count: n };
      }
      if (best) return { selector: best.selector, count: best.count };

      if (!el.classList.length) return null;
      const own = classPart(el);
      const ownCount = elementCount(own);
      if (ownCount > 1 && allSameSignature(own, el)) return { selector: own, count: ownCount };

      const parts = [own];
      let cur = el.parentElement;
      while (cur && cur !== document.body && cur !== document.documentElement && parts.length < 10) {
        parts.unshift(classPart(cur) + nthOf(cur));
        const sel = parts.join(" > ");
        const n = elementCount(sel);
        if (n > 1 && allSameSignature(sel, el)) return { selector: sel, count: n };
        cur = cur.parentElement;
      }
      return null;
    }

    function labelFor(el) {
      const tag = el.tagName.toLowerCase();
      const slot = el.getAttribute("data-slot");
      if (slot) return `${tag} · ${slot}`;
      const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 18);
      return text ? `${tag} · ${text}` : tag;
    }

    function isOurUi(node) {
      return Boolean(node && node.closest && node.closest(`[${ATTR_UI}]`));
    }

    function adjustableFor(node) {
      let cur = node;
      while (cur && cur !== document.documentElement) {
        if (cur.nodeType === 1 && cur !== document.body && !isOurUi(cur) && cur.firstElementChild) {
          return cur;
        }
        cur = cur.parentElement;
      }
      return null;
    }

    function findOverride(id) {
      return state.overrides.find((o) => o.id === id) || null;
    }

    function selectedOverrides() {
      return [...selection].map(findOverride).filter(Boolean);
    }

    function findOverrideFor(el) {
      let best = null;
      let bestN = Infinity;
      for (const o of state.overrides) {
        let matched = false;
        try {
          matched = el.matches(o.selector);
        } catch {
          matched = false;
        }
        if (!matched) continue;
        const n = elementCount(o.selector);
        if (n < bestN) {
          bestN = n;
          best = o;
        }
      }
      return best;
    }

    function nodeFor(ov) {
      try {
        return document.querySelector(ov.selector);
      } catch {
        return null;
      }
    }

    function descendantSnapshot(containerNode, excludeId) {
      const out = [];
      if (!state.cascade || !containerNode) return out;
      for (const ov of state.overrides) {
        if (ov.id === excludeId || !ov.touched || ov.hidden) continue;
        const node = nodeFor(ov);
        if (!node || node === containerNode || !containerNode.contains(node)) continue;
        out.push({
          ov,
          w: typeof ov.width === "number" ? ov.width : null,
          h: typeof ov.height === "number" ? ov.height : null,
          fs: typeof ov.fontSize === "number" ? ov.fontSize : null,
        });
      }
      return out;
    }

    function applyCascade(snapshot, ratioW, ratioH) {
      if (!snapshot || !snapshot.length) return false;
      const rw = Number.isFinite(ratioW) && ratioW > 0 ? ratioW : 1;
      const rh = Number.isFinite(ratioH) && ratioH > 0 ? ratioH : 1;
      if (Math.abs(rw - 1) < 1e-3 && Math.abs(rh - 1) < 1e-3) return false;
      const rf = state.scaleFont ? Math.sqrt(rw * rh) : 1;
      let any = false;
      for (const item of snapshot) {
        const { ov } = item;
        let hit = false;
        if (item.w !== null) {
          const v = Math.max(MIN_SIZE, Math.round(item.w * rw));
          if (v !== ov.width) {
            ov.width = v;
            hit = true;
          }
        }
        if (item.h !== null) {
          const v = Math.max(MIN_SIZE, Math.round(item.h * rh));
          if (v !== ov.height) {
            ov.height = v;
            hit = true;
          }
        }
        if (item.fs !== null && Math.abs(rf - 1) >= 1e-3) {
          const fs = Math.round(Math.max(6, Math.min(96, item.fs * rf)) * 10) / 10;
          if (fs !== ov.fontSize) {
            ov.fontSize = fs;
            hit = true;
          }
        }
        if (hit) {
          ov.touched = true;
          any = true;
        }
      }
      return any;
    }

    const SNAP_TOL = 6;
    let zTop = 30;

    function getComputedStyleOf(node) {
      try {
        return window.getComputedStyle(node) || {};
      } catch {
        return {};
      }
    }

    function safeQuery(selector) {
      try {
        return document.querySelector(selector);
      } catch {
        return null;
      }
    }

    function collectSnapLines(node) {
      const xs = [];
      const ys = [];
      const push = (r) => {
        if (!r || !r.width || !r.height) return;
        xs.push(r.left, r.left + r.width / 2, r.right);
        ys.push(r.top, r.top + r.height / 2, r.bottom);
      };
      push({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight });
      let p = node.parentElement;
      for (let i = 0; p && p !== document.body && i < 3; i += 1, p = p.parentElement) {
        push(p.getBoundingClientRect());
      }
      const parent = node.parentElement;
      if (parent) {
        for (const kid of [...parent.children].slice(0, 40)) {
          if (kid === node || isOurUi(kid)) continue;
          push(kid.getBoundingClientRect());
        }
      }
      return { xs, ys };
    }

    function nearestSnap(values, lines, tol) {
      let best = null;
      for (const line of lines) {
        for (const v of values) {
          const d = line - v;
          if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, line };
        }
      }
      return best;
    }

    function snapToGrid(v) {
      const g = state.snap.grid;
      if (!state.snap.on || !g) return v;
      return Math.round(v / g) * g;
    }

    let guideX = null;
    let guideY = null;

    function ensureGuides() {
      if (!guideX) {
        guideX = document.createElement("div");
        guideX.className = "dse-guide dse-guide-v";
        guideX.hidden = true;
        guideY = document.createElement("div");
        guideY.className = "dse-guide dse-guide-h";
        guideY.hidden = true;
        document.body.append(guideX, guideY);
      }
      return [guideX, guideY];
    }

    function showGuides(x, y) {
      if (!state.snap.on || !state.snap.guides || (!Number.isFinite(x) && !Number.isFinite(y))) {
        return hideGuides();
      }
      const [gx, gy] = ensureGuides();
      gx.hidden = !Number.isFinite(x);
      gy.hidden = !Number.isFinite(y);
      if (Number.isFinite(x)) setStyle(gx, "left", `${Math.round(x)}px`);
      if (Number.isFinite(y)) setStyle(gy, "top", `${Math.round(y)}px`);
    }

    function hideGuides() {
      if (guideX) guideX.hidden = true;
      if (guideY) guideY.hidden = true;
    }

    function selectElement(node, additive) {
      const target = adjustableFor(node);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const before = beginEdit();

      let ov = null;
      const cachedId = assigned.get(target);
      if (cachedId != null) ov = findOverride(cachedId);
      if (!ov) ov = findOverrideFor(target);

      const kind = state.sameKind ? kindSelectorFor(target) : null;

      if (!ov) {
        let selector = selectorFor(target);
        let count = 1;
        if (kind) {
          selector = kind.selector;
          count = kind.count;
        }

        const same = state.overrides.find((o) => o.selector === selector);
        if (same) {
          ov = same;
          ov.count = Math.max(ov.count, count);
        } else {
          ov = {
            id: ++seq,
            selector,
            label: labelFor(target),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            hidden: false,
            offsetX: null,
            offsetY: null,
            fontSize: null,
            z: 30,
            flow: true,

            needPos: !/^(absolute|fixed)$/.test(getComputedStyleOf(target).position || ""),
            touched: false,
            count,
          };
          state.overrides.push(ov);
        }
      } else if (kind) {

        const oldCount = elementCount(ov.selector);
        const taken = state.overrides.some(
          (o) => o.id !== ov.id && o.selector === kind.selector,
        );
        if (ov.selector !== kind.selector && oldCount < kind.count && !taken) {
          ov.selector = kind.selector;
          ov.count = kind.count;
        } else {
          ov.count = Math.max(ov.count, oldCount);
        }
      }

      assigned.set(target, ov.id);

      if (additive) {
        if (selection.has(ov.id)) selection.delete(ov.id);
        else selection.add(ov.id);
        primary = selection.has(ov.id) ? ov.id : selection.size ? [...selection][0] : null;
      } else {
        selection.clear();
        selection.add(ov.id);
        primary = ov.id;
      }

      commitEdit(before);

      const kept = state.overrides.filter(
        (o) => o.touched || selection.has(o.id) || o.id === ov.id,
      );
      if (kept.length !== state.overrides.length) {
        state.overrides = kept;
        saveState();
      }
      applyCss();
      renderPanel();
      positionSelection();
    }

    function removeOverride(id) {
      const before = beginEdit();
      state.overrides = state.overrides.filter((o) => o.id !== id);
      selection.delete(id);
      if (primary === id) primary = selection.size ? [...selection][0] : null;
      commitEdit(before);
      renderPanel();
      applyCss();
      positionSelection();
    }

    function resetOverride(id) {
      const ov = findOverride(id);
      if (!ov) return;
      const before = beginEdit();
      ov.width = null;
      ov.height = null;
      ov.hidden = false;
      ov.offsetX = null;
      ov.offsetY = null;
      ov.fontSize = null;
      ov.touched = false;
      ov.count = 1;
      commitEdit(before);
      renderPanel();
      applyCss();
      positionSelection();
    }

    function toggleHidden(id) {
      const ov = findOverride(id);
      if (!ov) return;
      const before = beginEdit();
      ov.hidden = !ov.hidden;
      ov.touched = true;
      commitEdit(before);
      renderPanel();
      applyCss();
      positionSelection();
    }

    function resetAll() {
      const before = beginEdit();
      const panel = state.panel;
      state = defaults();
      state.panel = panel;
      selection.clear();
      primary = null;
      lastCols = "";
      commitEdit(before);
      applyCss();
      syncFrame();
      renderPanel();
      positionSelection();
    }

    function resetLayout() {
      const before = beginEdit();
      state.sidebarWidth = null;
      state.railWidth = 56;
      state.centerMin = 400;
      commitEdit(before);
      syncFrame();
      renderPanel();
    }

    function applyBatch(field, value) {
      const before = beginEdit();
      for (const ov of selectedOverrides()) {
        if (field === "width") ov.width = value;
        else if (field === "height") ov.height = value;
        else if (field === "fontSize") ov.fontSize = value || null;
        ov.touched = true;
      }
      commitEdit(before);
      renderPanel();
      applyCss();
      positionSelection();
    }

    let rootEl = null;
    let highlightEl = null;
    let selectionEl = null;
    let plainBoxes = [];
    let gripEl = null;
    let entryEl = null;
    let suppressEntryClick = false;
    let sidebarInput = null;

    let fieldRefs = new Map();
    const entryRefs = {};

    function el(tag, cls, parent) {
      const node = document.createElement(tag);
      if (cls) node.className = cls;
      node.setAttribute(ATTR_UI, "");
      if (parent) parent.append(node);
      return node;
    }

    function mount(node) {
      (document.body || document.documentElement).append(node);
      return node;
    }

    function button(parent, text, cls, title) {
      const b = el("button", cls || "dse-btn", parent);
      b.type = "button";
      b.textContent = text;
      if (title) b.title = title;
      return b;
    }

    function numField(parent, labelText, opts) {
      const wrap = el("label", "dse-field", parent);
      const span = el("span", null, wrap);
      span.textContent = labelText;
      const input = el("input", "dse-input", wrap);
      input.type = "number";
      if (opts.min != null) input.min = String(opts.min);
      if (opts.max != null) input.max = String(opts.max);
      if (opts.step != null) input.step = String(opts.step);
      input.value = String(opts.value);
      input.addEventListener("change", () => {

        const raw = input.value.trim();
        let v = raw === "" ? opts.value : Number(raw);
        if (!Number.isFinite(v)) v = opts.value;
        v = Math.min(opts.max ?? v, Math.max(opts.min ?? v, Math.round(v)));
        input.value = String(v);
        opts.onChange(v);
      });
      return { input, wrap };
    }

    function applyEntryGeometry() {
      if (!entryEl) return;
      entryEl.style.left = `${state.entry.left}px`;
      entryEl.style.bottom = `${state.entry.bottom}px`;
    }

    function startEntryDrag(event) {
      if (!entryEl || event.button !== 0) return;
      const rect = entryEl.getBoundingClientRect();
      const grabX = event.clientX - rect.left;
      const grabY = event.clientY - rect.top;
      let moved = false;
      const move = (e) => {
        if (!moved && Math.abs(e.clientX - event.clientX) + Math.abs(e.clientY - event.clientY) < 4) return;
        moved = true;
        const maxLeft = Math.max(4, window.innerWidth - rect.width - 4);
        const maxTop = Math.max(4, window.innerHeight - rect.height - 4);
        const left = Math.max(4, Math.min(maxLeft, e.clientX - grabX));
        const top = Math.max(4, Math.min(maxTop, e.clientY - grabY));
        state.entry.left = Math.round(left);
        state.entry.bottom = Math.round(window.innerHeight - top - rect.height);
        applyEntryGeometry();
        syncPanelValues();
      };
      const end = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        if (moved) {
          suppressEntryClick = true;
          saveState();
        }
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
    }

    function buildEntryButton() {
      entryEl = el("button", "dse-entry");
      entryEl.type = "button";
      entryEl.title = "UI 尺寸编辑（Ctrl+Shift+E）；按住可拖动";
      entryEl.textContent = "⌗";
      entryEl.addEventListener("pointerdown", startEntryDrag);
      entryEl.addEventListener("click", (e) => {
        e.stopPropagation();
        if (suppressEntryClick) {
          suppressEntryClick = false;
          return;
        }
        setEditing(!editing);
      });
      mount(entryEl);
      applyEntryGeometry();
    }

    function buildPanel() {
      rootEl = el("div", "dse-panel");
      rootEl.addEventListener("pointerdown", (e) => e.stopPropagation());
      rootEl.addEventListener("click", (e) => e.stopPropagation());
      mount(rootEl);
    }

    function buildOverlays() {
      highlightEl = el("div", "dse-highlight");
      highlightEl.hidden = true;
      mount(highlightEl);

      selectionEl = el("div", "dse-selection");
      selectionEl.hidden = true;
      for (const [axis, cls] of [
        ["h", "dse-h-e"],
        ["v", "dse-h-s"],
        ["hv", "dse-h-se"],
      ]) {
        const knob = el("div", `dse-knob ${cls}`, selectionEl);
        knob.addEventListener("pointerdown", (e) => startKnobDrag(e, axis));
      }
      const moveKnob = el("div", "dse-knob dse-h-move", selectionEl);
      moveKnob.title = "按住并拖动，可移动该元素";
      moveKnob.textContent = "✥";
      moveKnob.addEventListener("pointerdown", startMoveDrag);
      mount(selectionEl);

      gripEl = el("div", "dse-grip");
      gripEl.hidden = true;
      gripEl.title = "拖动调整左侧栏宽度";
      gripEl.addEventListener("pointerdown", startGripDrag);
      mount(gripEl);
    }

    function ensurePlainBox(i) {
      while (plainBoxes.length <= i) {
        const box = el("div", "dse-selection dse-selection-plain");
        box.hidden = true;
        mount(box);
        plainBoxes.push(box);
      }
      return plainBoxes[i];
    }

    function hidePlainBoxes(from) {
      for (let i = from; i < plainBoxes.length; i += 1) plainBoxes[i].hidden = true;
    }

    function renderPanel() {
      if (!rootEl) return;
      rootEl.textContent = "";
      sidebarInput = null;
      fieldRefs = new Map();

      const head = el("div", "dse-head", rootEl);
      const grip = el("span", "dse-panel-grip", head);
      grip.textContent = "⠿";
      grip.title = "按住拖动整块浮窗";
      head.addEventListener("pointerdown", startPanelDrag);
      el("span", "dse-title", head).textContent = "尺寸编辑";
      const hint = el("span", "dse-hint", head);
      hint.textContent = "⠿ 拖浮窗 · 右下角缩放 · 点元素选中 · Ctrl 点加选 · Esc 退出";

      const actions = el("span", "dse-head-actions", head);
      const undoBtn = button(actions, "撤销", "dse-btn dse-btn-xs", "Ctrl+Z");
      undoBtn.disabled = !undoStack.length;
      undoBtn.addEventListener("click", undo);
      const redoBtn = button(actions, "重做", "dse-btn dse-btn-xs", "Ctrl+Shift+Z");
      redoBtn.disabled = !redoStack.length;
      redoBtn.addEventListener("click", redo);
      const minBtn = button(
        actions,
        state.panel.min ? "展开" : "收起",
        "dse-btn dse-btn-xs",
        "收成一条放在角落，避免挡视线",
      );
      minBtn.addEventListener("click", () => {
        state.panel.min = !state.panel.min;
        saveState();
        renderPanel();
        applyPanelGeometry();
      });

      const cols = el("div", "dse-section", rootEl);
      el("div", "dse-section-title", cols).textContent = "布局列宽";

      const colRow = el("div", "dse-row dse-row-plain", cols);
      sidebarInput = numField(colRow, "左侧栏", {
        value: state.sidebarWidth ?? 280,
        min: SIDEBAR_MIN,
        max: SIDEBAR_MAX,
        onChange: (v) => {
          const before = beginEdit();
          state.sidebarWidth = v;
          commitEdit(before);
          syncFrame();
        },
      }).input;

      numField(colRow, "收起轨道", {
        value: state.railWidth,
        min: RAIL_MIN,
        max: RAIL_MAX,
        onChange: (v) => {
          const before = beginEdit();
          state.railWidth = v;
          commitEdit(before);
          syncFrame();
        },
      });

      numField(colRow, "中栏最小宽", {
        value: state.centerMin,
        min: CENTER_MIN_MIN,
        max: CENTER_MIN_MAX,
        onChange: (v) => {
          const before = beginEdit();
          state.centerMin = v;
          commitEdit(before);
          syncFrame();
        },
      });

      const resetLayoutBtn = button(colRow, "恢复原生", "dse-btn dse-btn-ghost dse-btn-xs", "侧栏回到原生列宽，其余回默认");
      resetLayoutBtn.addEventListener("click", resetLayout);

      const entrySec = el("div", "dse-section", rootEl);
      el("div", "dse-section-title", entrySec).textContent = "编辑入口按钮";
      const entryRow = el("div", "dse-row dse-row-plain", entrySec);
      const entryApply = (key) => (v) => {
        state.entry[key] = v;
        applyEntryGeometry();
        saveState();
        syncPanelValues();
      };
      const entryLeftField = numField(entryRow, "左", {
        value: state.entry.left,
        min: 0,
        max: 4000,
        onChange: entryApply("left"),
      });
      const entryBottomField = numField(entryRow, "下", {
        value: state.entry.bottom,
        min: 0,
        max: 4000,
        onChange: entryApply("bottom"),
      });
      entryRefs.left = entryLeftField.input;
      entryRefs.bottom = entryBottomField.input;
      const entryReset = button(entryRow, "复位", "dse-btn dse-btn-ghost dse-btn-xs", "恢复默认位置（左下角）");
      entryReset.addEventListener("click", () => {
        state.entry = { left: 10, bottom: 10 };
        applyEntryGeometry();
        saveState();
        renderPanel();
      });
      el("div", "dse-hint", entrySec).textContent = "也可以直接按住左下角的 ⌗ 按钮拖动。";

      const kindRow = el("label", "dse-check", cols);
      const kindBox = el("input", null, kindRow);
      kindBox.type = "checkbox";
      kindBox.checked = state.sameKind;
      kindBox.addEventListener("change", () => {
        const before = beginEdit();
        state.sameKind = kindBox.checked;
        commitEdit(before);
      });
      el("span", null, kindRow).textContent = "同种元素一起调";

      const scaleRow = el("label", "dse-check", cols);
      const scaleBox = el("input", null, scaleRow);
      scaleBox.type = "checkbox";
      scaleBox.checked = state.scaleFont;
      scaleBox.addEventListener("change", () => {
        const before = beginEdit();
        state.scaleFont = scaleBox.checked;
        commitEdit(before);
      });
      el("span", null, scaleRow).textContent = "缩放时字号等比变化";

      const cascadeRow = el("label", "dse-check", cols);
      const cascadeBox = el("input", null, cascadeRow);
      cascadeBox.type = "checkbox";
      cascadeBox.checked = state.cascade;
      cascadeBox.addEventListener("change", () => {
        state.cascade = cascadeBox.checked;
        saveState();
      });
      el("span", null, cascadeRow).textContent = "元素缩放时子元素等比变化";

      const snapRow = el("label", "dse-check", cols);
      const snapBox = el("input", null, snapRow);
      snapBox.type = "checkbox";
      snapBox.checked = state.snap.on;
      snapBox.addEventListener("change", () => {
        state.snap.on = snapBox.checked;
        saveState();
        renderPanel();
      });
      el("span", null, snapRow).textContent = "拖动时吸附（网格 + 元素对齐）";

      const gridRow = el("div", "dse-row dse-row-plain", cols);
      numField(gridRow, "网格", {
        value: state.snap.grid,
        min: 0,
        max: 64,
        onChange: (v) => {
          state.snap.grid = v;
          saveState();
        },
      });
      el("span", "dse-hint-inline", gridRow).textContent = "0 表示关闭网格";

      const guideRow = el("label", "dse-check", cols);
      const guideBox = el("input", null, guideRow);
      guideBox.type = "checkbox";
      guideBox.checked = state.snap.guides;
      guideBox.addEventListener("change", () => {
        state.snap.guides = guideBox.checked;
        if (!state.snap.guides) hideGuides();
        saveState();
      });
      el("span", null, guideRow).textContent = "显示对齐参考线";

      const picked = selectedOverrides();
      if (picked.length >= 2) {
        const batch = el("div", "dse-section", rootEl);
        el("div", "dse-section-title", batch).textContent = `批量调整（已选 ${picked.length} 项）`;
        const row = el("div", "dse-row dse-row-plain", batch);
        numField(row, "宽", {
          value: typeof picked[0].width === "number" ? picked[0].width : 0,
          min: MIN_SIZE,
          max: MAX_SIZE,
          onChange: (v) => applyBatch("width", v),
        });
        numField(row, "高", {
          value: typeof picked[0].height === "number" ? picked[0].height : 0,
          min: MIN_SIZE,
          max: MAX_SIZE,
          onChange: (v) => applyBatch("height", v),
        });
        const hideBtn = button(row, "隐藏所选", "dse-btn dse-btn-xs", "把选中的元素全部隐藏");
        hideBtn.addEventListener("click", () => {
          const before = beginEdit();
          const allHidden = picked.every((o) => o.hidden);
          for (const ov of selectedOverrides()) {
            ov.hidden = !allHidden;
            ov.touched = true;
          }
          commitEdit(before);
          renderPanel();
          applyCss();
          positionSelection();
        });
        const clearBtn = button(row, "清空选择", "dse-btn dse-btn-ghost dse-btn-xs");
        clearBtn.addEventListener("click", () => {
          selection.clear();
          primary = null;
          renderPanel();
          positionSelection();
        });
      }

      if (picked.length === 1) {
        const target = picked[0];
        const pos = el("div", "dse-section", rootEl);
        el("div", "dse-section-title", pos).textContent = "位置偏移（也可拖动选择框左上角的 ✥）";
        const posRow = el("div", "dse-row dse-row-plain", pos);
        const applyOffset = (field, v) => {
          const before = beginEdit();
          target[field] = v;
          target.touched = true;

          const zeroX = target.offsetX == null || target.offsetX === 0;
          const zeroY = target.offsetY == null || target.offsetY === 0;
          if (zeroX && zeroY) {
            target.offsetX = null;
            target.offsetY = null;
          }
          commitEdit(before);
          applyCss();
          positionSelection();
          renderPanel();
        };
        numField(posRow, "X", {
          value: typeof target.offsetX === "number" ? target.offsetX : 0,
          min: -3000,
          max: 3000,
          onChange: (v) => applyOffset("offsetX", v),
        });
        numField(posRow, "Y", {
          value: typeof target.offsetY === "number" ? target.offsetY : 0,
          min: -3000,
          max: 3000,
          onChange: (v) => applyOffset("offsetY", v),
        });
        const zero = button(posRow, "归零", "dse-btn dse-btn-ghost dse-btn-xs", "位移回到原位");
        zero.addEventListener("click", () => {
          const before = beginEdit();
          target.offsetX = null;
          target.offsetY = null;
          commitEdit(before);
          applyCss();
          positionSelection();
          renderPanel();
        });

        const flowRow = el("label", "dse-check", pos);
        const flowBox = el("input", null, flowRow);
        flowBox.type = "checkbox";
        flowBox.checked = Boolean(target.flow);
        flowBox.addEventListener("change", () => {
          const before = beginEdit();
          target.flow = flowBox.checked;
          target.touched = true;
          commitEdit(before);
          applyCss();
          positionSelection();
          renderPanel();
        });
        el("span", null, flowRow).textContent = "脱离文档流（原位让出给其它元素）";
      }

      const list = el("div", "dse-section", rootEl);

      const shown = state.overrides;
      const touchedCount = shown.filter((o) => o.touched).length;
      el("div", "dse-section-title", list).textContent = `元素清单（${shown.length}，已改 ${touchedCount}）`;

      if (!shown.length) {
        el("div", "dse-empty", list).textContent = "还没有修改任何元素";
      }

      for (const o of shown) {
        const cls = ["dse-row"];
        if (!o.touched) cls.push("is-draft");
        if (selection.has(o.id)) cls.push("is-selected");
        if (o.id === primary) cls.push("is-primary");
        if (o.hidden) cls.push("is-hidden");
        const row = el("div", cls.join(" "), list);

        const name = el("span", "dse-row-label", row);
        const badge = o.count > 1 ? ` ×${o.count}` : "";
        const draft = o.touched ? "" : " ·未改";
        name.textContent = `${o.label || o.selector}${badge}${draft}`;
        name.title = `${o.selector}${o.count > 1 ? `\n同种元素 ${o.count} 个一起调` : ""}`;

        const wRef = numField(row, "W", {
          value: typeof o.width === "number" ? o.width : 0,
          min: MIN_SIZE,
          max: MAX_SIZE,
          onChange: (v) => {
            const before = beginEdit();
            const node = nodeFor(o);
            const prev =
              typeof o.width === "number"
                ? o.width
                : node
                  ? Math.round(node.getBoundingClientRect().width)
                  : 0;
            o.width = v;
            o.touched = true;
            if (prev > 0 && v > 0) applyCascade(descendantSnapshot(node, o.id), v / prev, 1);
            commitEdit(before);
            applyCss();
            positionSelection();
          },
        });

        const hRef = numField(row, "H", {
          value: typeof o.height === "number" ? o.height : 0,
          min: MIN_SIZE,
          max: MAX_SIZE,
          onChange: (v) => {
            const before = beginEdit();
            const node = nodeFor(o);
            const prev =
              typeof o.height === "number"
                ? o.height
                : node
                  ? Math.round(node.getBoundingClientRect().height)
                  : 0;
            o.height = v;
            o.touched = true;
            if (prev > 0 && v > 0) applyCascade(descendantSnapshot(node, o.id), 1, v / prev);
            commitEdit(before);
            applyCss();
            positionSelection();
          },
        });

        const fRef = numField(row, "F", {
          value: typeof o.fontSize === "number" ? o.fontSize : 0,
          min: 6,
          max: 96,
          onChange: (v) => {
            const before = beginEdit();
            o.fontSize = v || null;
            o.touched = true;
            commitEdit(before);
            applyCss();
            positionSelection();
          },
        });

        fieldRefs.set(o.id, { w: wRef.input, h: hRef.input, f: fRef.input });

        const hide = button(row, o.hidden ? "显示" : "隐藏", "dse-btn dse-btn-ghost dse-btn-xs", "切换隐藏");
        hide.addEventListener("click", () => toggleHidden(o.id));

        const reset = button(row, "恢复", "dse-btn dse-btn-ghost dse-btn-xs", "恢复该项为原生尺寸并取消隐藏");
        reset.addEventListener("click", () => resetOverride(o.id));

        const pick = button(row, "定位", "dse-btn dse-btn-ghost dse-btn-xs");
        pick.addEventListener("click", () => {
          selection.clear();
          selection.add(o.id);
          primary = o.id;
          renderPanel();
          positionSelection();
          const target = document.querySelector(o.selector);
          if (target && target.scrollIntoView) target.scrollIntoView({ block: "nearest" });
        });

        const del = button(row, "✕", "dse-btn dse-btn-ghost dse-btn-xs", "删除该覆盖");
        del.addEventListener("click", () => removeOverride(o.id));
      }

      const foot = el("div", "dse-foot", rootEl);
      const resetAllBtn = button(foot, "恢复默认", "dse-btn", "清空全部覆盖与列宽设置，回到出厂状态");
      resetAllBtn.addEventListener("click", resetAll);
      const exit = button(foot, "退出编辑", "dse-btn dse-btn-primary");
      exit.addEventListener("click", () => setEditing(false));
      foot.append(exit);

      const rz = el("div", "dse-panel-resize", rootEl);
      rz.title = "拖动缩放浮窗大小";
      rz.addEventListener("pointerdown", startResizeDrag);
    }

    function setInputValue(input, value) {
      if (!input) return;
      if (input === document.activeElement) return;
      const next = String(value);
      if (input.value !== next) input.value = next;
    }

    function syncPanelValues() {
      for (const o of state.overrides) {
        const refs = fieldRefs.get(o.id);
        if (!refs) continue;
        setInputValue(refs.w, typeof o.width === "number" ? o.width : 0);
        setInputValue(refs.h, typeof o.height === "number" ? o.height : 0);
        setInputValue(refs.f, typeof o.fontSize === "number" ? o.fontSize : 0);
      }
      if (sidebarInput) setInputValue(sidebarInput, state.sidebarWidth ?? 280);
      if (entryRefs.left) setInputValue(entryRefs.left, state.entry.left);
      if (entryRefs.bottom) setInputValue(entryRefs.bottom, state.entry.bottom);
    }

    function setStyle(node, prop, value) {
      if (node.style[prop] !== value) node.style[prop] = value;
    }

    function rectToStyle(node, rect) {
      setStyle(node, "left", `${rect.left}px`);
      setStyle(node, "top", `${rect.top}px`);
      setStyle(node, "width", `${rect.width}px`);
      setStyle(node, "height", `${rect.height}px`);
    }

    function positionGrip() {
      if (!gripEl || gripEl.hidden) return;
      const frame = findFrame();
      const col = frame && frame.querySelector("[class*=_sidebarCol]");
      if (!col) {
        gripEl.hidden = true;
        return;
      }
      const r = col.getBoundingClientRect();
      setStyle(gripEl, "left", `${Math.round(r.right) - 3}px`);
      setStyle(gripEl, "top", `${Math.round(r.top)}px`);
      setStyle(gripEl, "height", `${Math.round(r.height)}px`);
    }

    function positionSelection() {
      if (!selectionEl) return;
      if (!editing) {
        selectionEl.hidden = true;
        hidePlainBoxes(0);
        return;
      }

      let boxIndex = 0;
      let primaryDrawn = false;

      for (const id of selection) {
        const ov = findOverride(id);
        if (!ov) continue;
        let nodes = [];
        try {
          nodes = [...document.querySelectorAll(ov.selector)].slice(0, BOX_LIMIT);
        } catch {
          nodes = [];
        }
        for (const node of nodes) {
          const rect = node.getBoundingClientRect();
          if (!rect.width && !rect.height) continue;
          if (id === primary && !primaryDrawn) {
            primaryDrawn = true;
            selectionEl.hidden = false;
            rectToStyle(selectionEl, rect);
            continue;
          }
          const box = ensurePlainBox(boxIndex);
          boxIndex += 1;
          box.hidden = false;
          rectToStyle(box, rect);
        }
      }

      if (!primaryDrawn) selectionEl.hidden = true;
      hidePlainBoxes(boxIndex);
    }

    function trackDrag(onMove, onEnd) {
      const move = (e) => onMove(e);
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        if (onEnd) onEnd();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    }

    function startKnobDrag(e, axis) {
      const items = selectedOverrides();
      if (!items.length) return;
      e.preventDefault();
      e.stopPropagation();

      const x0 = e.clientX;
      const y0 = e.clientY;
      const base = items.map((ov) => {
        let node = null;
        try {
          node = document.querySelector(ov.selector);
        } catch {
          node = null;
        }
        const r = node ? node.getBoundingClientRect() : { width: 0, height: 0 };
        let fs = typeof ov.fontSize === "number" ? ov.fontSize : 0;
        if (!fs && node) fs = parseFloat(window.getComputedStyle(node).fontSize) || 0;
        return {
          ov,
          node,
          w: typeof ov.width === "number" ? ov.width : Math.round(r.width),
          h: typeof ov.height === "number" ? ov.height : Math.round(r.height),
          left: r.left || 0,
          top: r.top || 0,
          lines: node ? collectSnapLines(node) : { xs: [], ys: [] },
          fs,
          cascade: descendantSnapshot(node, ov.id),
        };
      });
      const before = beginEdit();
      const single = base.length === 1;

      trackDrag(
        (ev) => {
          const dx = ev.clientX - x0;
          const dy = ev.clientY - y0;
          let gx = NaN;
          let gy = NaN;
          for (const b of base) {
            let nextW = axis.includes("h") ? Math.max(MIN_SIZE, Math.round(b.w + dx)) : b.w;
            let nextH = axis.includes("v") ? Math.max(MIN_SIZE, Math.round(b.h + dy)) : b.h;
            if (state.snap.on && b.node) {
              if (state.snap.grid) {
                if (axis.includes("h")) nextW = Math.max(MIN_SIZE, snapToGrid(nextW));
                if (axis.includes("v")) nextH = Math.max(MIN_SIZE, snapToGrid(nextH));
              }

              if (axis.includes("h")) {
                const sx = nearestSnap([b.left + nextW], b.lines.xs, SNAP_TOL);
                if (sx) {
                  nextW = Math.max(MIN_SIZE, Math.round(nextW + sx.d));
                  if (single) gx = sx.line;
                }
              }
              if (axis.includes("v")) {
                const sy = nearestSnap([b.top + nextH], b.lines.ys, SNAP_TOL);
                if (sy) {
                  nextH = Math.max(MIN_SIZE, Math.round(nextH + sy.d));
                  if (single) gy = sy.line;
                }
              }
            }
            if (axis.includes("h") && nextW !== b.w) {
              b.ov.width = nextW;
              b.ov.touched = true;
            }
            if (axis.includes("v") && nextH !== b.h) {
              b.ov.height = nextH;
              b.ov.touched = true;
            }

            if (state.scaleFont && b.fs > 0) {
              const ratios = [];
              if (axis.includes("h")) ratios.push(nextW / (b.w || 1));
              if (axis.includes("v")) ratios.push(nextH / (b.h || 1));
              const ratio = Math.sqrt(ratios.reduce((p, c) => p * c, 1));
              if (Number.isFinite(ratio) && ratio > 0) {
                const fs = b.fs * ratio;
                if (Math.abs(fs - (b.ov.fontSize ?? b.fs)) >= 0.4) {
                  b.ov.fontSize = Math.round(Math.max(6, Math.min(96, fs)) * 10) / 10;
                  b.ov.touched = true;
                }
              }
            }

            if (b.cascade && b.cascade.length) {
              const rw = axis.includes("h") && b.w > 0 ? nextW / b.w : 1;
              const rh = axis.includes("v") && b.h > 0 ? nextH / b.h : 1;
              applyCascade(b.cascade, rw, rh);
            }
          }
          showGuides(gx, gy);
          applyCss();
          positionSelection();
          syncPanelValues();
        },
        () => {
          hideGuides();
          commitEdit(before);
          renderPanel();
        },
      );
    }

    function startGripDrag(e) {
      e.preventDefault();
      e.stopPropagation();
      const x0 = e.clientX;
      const frame = findFrame();
      const collapsed = Boolean(frame && frame.hasAttribute("data-sidebar-collapsed"));
      const base = collapsed
        ? state.railWidth
        : (state.sidebarWidth ?? (frame ? parseFloat(frame.style.gridTemplateColumns) || 280 : 280));
      const lo = collapsed ? RAIL_MIN : SIDEBAR_MIN;
      const hi = collapsed ? RAIL_MAX : SIDEBAR_MAX;
      const before = beginEdit();

      trackDrag(
        (ev) => {
          const v = Math.min(hi, Math.max(lo, Math.round(base + ev.clientX - x0)));
          if (collapsed) state.railWidth = v;
          else state.sidebarWidth = v;
          syncFrame();
          if (sidebarInput) sidebarInput.value = String(v);
        },
        () => {
          commitEdit(before);
          renderPanel();
        },
      );
    }

    function applyPanelGeometry() {
      if (!rootEl) return;
      const p = state.panel;
      rootEl.classList.toggle("is-min", Boolean(p.min));
      if (p.left == null && p.top == null) {
        setStyle(rootEl, "transform", "translateX(-50%)");
        setStyle(rootEl, "left", "50%");
        setStyle(rootEl, "top", "");
      } else {
        setStyle(rootEl, "transform", "none");
        setStyle(rootEl, "left", `${Math.round(p.left ?? 16)}px`);
        setStyle(rootEl, "top", `${Math.round(p.top ?? 12)}px`);
      }
      setStyle(rootEl, "width", p.width ? `${Math.round(p.width)}px` : "");
      setStyle(rootEl, "height", p.height ? `${Math.round(p.height)}px` : "");
    }

    function startPanelDrag(e) {
      if (!rootEl) return;
      const onControl = e.target && e.target.closest
        ? e.target.closest("button,input,label,.dse-panel-resize")
        : null;
      if (onControl) return;
      e.preventDefault();
      e.stopPropagation();
      const r = rootEl.getBoundingClientRect();
      const x0 = e.clientX;
      const y0 = e.clientY;
      const l0 = r.left;
      const t0 = r.top;
      trackDrag(
        (ev) => {
          state.panel.left = Math.round(
            Math.min(Math.max(0, snapToGrid(l0 + ev.clientX - x0)), Math.max(0, window.innerWidth - 140)),
          );
          state.panel.top = Math.round(
            Math.min(Math.max(0, snapToGrid(t0 + ev.clientY - y0)), Math.max(0, window.innerHeight - 60)),
          );
          applyPanelGeometry();
        },
        () => saveState(),
      );
    }

    function startResizeDrag(e) {
      e.preventDefault();
      e.stopPropagation();
      if (!rootEl) return;
      const r = rootEl.getBoundingClientRect();
      const x0 = e.clientX;
      const y0 = e.clientY;
      const w0 = r.width;
      const h0 = r.height;
      trackDrag(
        (ev) => {
          state.panel.width = Math.round(
            Math.min(Math.max(240, snapToGrid(w0 + ev.clientX - x0)), window.innerWidth * 0.92),
          );
          state.panel.height = Math.round(
            Math.min(Math.max(160, snapToGrid(h0 + ev.clientY - y0)), window.innerHeight * 0.88),
          );
          applyPanelGeometry();
        },
        () => saveState(),
      );
    }

    function startMoveDrag(e) {
      const ov = findOverride(primary);
      if (!ov) return;
      e.preventDefault();
      e.stopPropagation();
      const x0 = e.clientX;
      const y0 = e.clientY;
      const bx = typeof ov.offsetX === "number" ? ov.offsetX : 0;
      const by = typeof ov.offsetY === "number" ? ov.offsetY : 0;
      const node = safeQuery(ov.selector);

      const r0 = node ? node.getBoundingClientRect() : null;
      const left0 = r0 ? r0.left - bx : 0;
      const top0 = r0 ? r0.top - by : 0;
      const w = r0 ? r0.width : 0;
      const h = r0 ? r0.height : 0;
      const lines = node ? collectSnapLines(node) : { xs: [], ys: [] };
      const before = beginEdit();
      ov.z = ++zTop;
      trackDrag(
        (ev) => {
          let nx = Math.round(bx + ev.clientX - x0);
          let ny = Math.round(by + ev.clientY - y0);
          let gx = NaN;
          let gy = NaN;
          if (state.snap.on && node) {
            if (state.snap.grid) {
              nx = snapToGrid(Math.round(left0 + nx)) - Math.round(left0);
              ny = snapToGrid(Math.round(top0 + ny)) - Math.round(top0);
            }
            const sx = nearestSnap(
              [left0 + nx, left0 + nx + w / 2, left0 + nx + w],
              lines.xs,
              SNAP_TOL,
            );
            if (sx) {
              nx = Math.round(nx + sx.d);
              gx = sx.line;
            }
            const sy = nearestSnap(
              [top0 + ny, top0 + ny + h / 2, top0 + ny + h],
              lines.ys,
              SNAP_TOL,
            );
            if (sy) {
              ny = Math.round(ny + sy.d);
              gy = sy.line;
            }
          }
          if (nx !== bx || ny !== by) ov.touched = true;
          ov.offsetX = nx;
          ov.offsetY = ny;
          showGuides(gx, gy);
          applyCss();
          positionSelection();
        },
        () => {
          hideGuides();
          commitEdit(before);
          renderPanel();
        },
      );
    }

    function onHover(e) {
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      if (!hit || isOurUi(hit)) {
        highlightEl.hidden = true;
        return;
      }
      const node = adjustableFor(hit);
      if (!node) {
        highlightEl.hidden = true;
        return;
      }
      highlightEl.hidden = false;
      rectToStyle(highlightEl, node.getBoundingClientRect());
    }

    function onClickCapture(e) {
      const node = e.target;
      if (!node || isOurUi(node)) return;
      const target = adjustableFor(node);
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      selectElement(target, e.ctrlKey || e.metaKey);
    }

    function onKeyDown(e) {
      if (e.key === "Escape" && editing) {
        setEditing(false);
        e.preventDefault();
        return;
      }
      if (e.ctrlKey && e.shiftKey && (e.key === "E" || e.key === "e")) {
        e.preventDefault();
        setEditing(!editing);
        return;
      }
      if (!editing) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && key === "y") {
        e.preventDefault();
        redo();
      }
    }

    function setEditing(next) {
      if (editing === next) return;
      editing = next;
      document.documentElement.toggleAttribute(ATTR_EDITING, editing);

      if (editing) {
        if (!rootEl) buildPanel();
        if (!highlightEl) buildOverlays();
        renderPanel();
        applyPanelGeometry();
        highlightEl.hidden = true;
        gripEl.hidden = false;
        positionGrip();
        document.addEventListener("pointermove", onHover, true);
        document.addEventListener("click", onClickCapture, true);
      } else {
        hideGuides();
        if (guideX) guideX.remove();
        if (guideY) guideY.remove();
        guideX = null;
        guideY = null;
        if (rootEl) rootEl.remove();
        rootEl = null;
        if (highlightEl) highlightEl.remove();
        highlightEl = null;
        if (selectionEl) selectionEl.remove();
        selectionEl = null;
        for (const box of plainBoxes) box.remove();
        plainBoxes = [];
        if (gripEl) gripEl.remove();
        gripEl = null;
        selection.clear();
        primary = null;

        const kept = state.overrides.filter((o) => o.touched);
        if (kept.length !== state.overrides.length) {
          state.overrides = kept;
        }
        fieldRefs = new Map();
        sidebarInput = null;
        flushSave();
        document.removeEventListener("pointermove", onHover, true);
        document.removeEventListener("click", onClickCapture, true);
      }
      if (entryEl) entryEl.classList.toggle("is-on", editing);
    }

    const THEME_ATTR = "data-dse-theme";

    function parseColor(value) {
      const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/i.exec(
        String(value || "").trim(),
      );
      if (!m) return null;
      return {
        r: Number(m[1]),
        g: Number(m[2]),
        b: Number(m[3]),
        a: m[4] === undefined ? 1 : Number(m[4]),
      };
    }

    function luminanceOf(c) {
      return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
    }

    function detectTheme() {
      const nodes = [document.body, document.documentElement].filter(Boolean);
      for (const node of nodes) {
        const bg = parseColor(getComputedStyleOf(node).backgroundColor);
        if (bg && bg.a > 0.25) return luminanceOf(bg) > 0.55 ? "light" : "dark";
      }
      for (const node of nodes) {
        const fg = parseColor(getComputedStyleOf(node).color);
        if (fg && fg.a > 0.25) return luminanceOf(fg) > 0.55 ? "dark" : "light";
      }
      try {
        if (
          typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-color-scheme: light)").matches
        ) {
          return "light";
        }
      } catch {

      }
      return "dark";
    }

    function applyTheme() {
      const root = document.documentElement;
      if (!root) return;
      const next = detectTheme();
      if (root.getAttribute(THEME_ATTR) !== next) root.setAttribute(THEME_ATTR, next);
    }

    const BASE_CSS = `
[${ATTR_UI}]{box-sizing:border-box}
:root{
  --dse-bg:#24262b;--dse-fg:#e9ebef;--dse-muted:#a3a8ae;--dse-faint:#8b9096;
  --dse-line:rgba(255,255,255,0.14);--dse-input:rgba(255,255,255,0.06);
  --dse-hover:rgba(255,255,255,0.10);
  --dse-accent:#5b9dff;--dse-accent-soft:rgba(91,157,255,0.24);
  --dse-accent-line:rgba(91,157,255,0.55);--dse-accent-ghost:rgba(91,157,255,0.12);
  --dse-shadow:0 16px 40px rgba(0,0,0,0.34);
}
html[data-dse-theme="light"]{
  --dse-bg:#ffffff;--dse-fg:#1f2023;--dse-muted:#5f6368;--dse-faint:#6b7075;
  --dse-line:rgba(0,0,0,0.14);--dse-input:rgba(0,0,0,0.04);
  --dse-hover:rgba(0,0,0,0.07);
  --dse-accent:#2f6fed;--dse-accent-soft:rgba(47,111,237,0.16);
  --dse-accent-line:rgba(47,111,237,0.55);--dse-accent-ghost:rgba(47,111,237,0.10);
  --dse-shadow:0 16px 40px rgba(15,20,30,0.18);
}
.dse-entry{
  position:fixed;left:10px;bottom:10px;z-index:999998;
  cursor:grab;touch-action:none;
  width:30px;height:30px;border-radius:50%;
  border:1px solid var(--dse-line);
  background:var(--dse-bg);
  color:var(--dse-muted);
  font-size:15px;line-height:1;cursor:pointer;opacity:.32;
  transition:opacity .15s ease;
}
.dse-entry:hover,.dse-entry.is-on{opacity:1}
.dse-panel{
  position:fixed;top:68px;left:50%;transform:translateX(-50%);z-index:999999;
  width:min(760px,calc(100vw - 32px));max-height:76vh;overflow:auto;
  padding:12px 14px;border-radius:12px;
  background:var(--dse-bg);
  border:1px solid var(--dse-line);
  box-shadow:var(--dse-shadow);
  color:var(--dse-fg);
  font:12px/1.5 system-ui,sans-serif;
  overscroll-behavior:contain;
}
.dse-head{display:flex;align-items:baseline;gap:10px;margin-bottom:10px;user-select:none;cursor:grab}
.dse-head:active{cursor:grabbing}
.dse-title{font-weight:600;font-size:13px}
.dse-hint{flex:1;color:var(--dse-faint);font-size:11px}
.dse-head-actions{display:flex;gap:6px}
.dse-section{border-top:1px solid var(--dse-line);padding-top:8px;margin-top:8px}
.dse-section-title{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--dse-faint);margin-bottom:6px}
.dse-field{display:inline-flex;align-items:center;gap:6px;margin-right:12px}
.dse-input{
  width:72px;padding:3px 6px;border-radius:6px;
  border:1px solid var(--dse-line);
  background:var(--dse-input);
  color:inherit;font:inherit;
}
.dse-check{display:flex;align-items:center;gap:6px;margin-top:8px;cursor:pointer}
.dse-row{display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:7px}
.dse-row-plain{padding:0}
.dse-row.is-selected{background:var(--dse-hover)}
.dse-row.is-primary{outline:1px solid var(--dse-accent-line)}
.dse-row.is-hidden .dse-row-label{opacity:.55;text-decoration:line-through}
.dse-row.is-draft{opacity:.6}
.dse-row.is-draft .dse-row-label{font-style:italic}
.dse-hint-inline{color:var(--dse-faint);font-size:11px}
.dse-guide{
  position:fixed;z-index:2147483300;pointer-events:none;margin:0;padding:0;
  background:var(--dse-accent);opacity:.9;
}
.dse-guide-v{top:0;bottom:0;width:1px}
.dse-guide-h{left:0;right:0;height:1px}
.dse-row-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dse-empty{color:var(--dse-faint);padding:2px 6px}
.dse-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}
.dse-btn{
  padding:4px 12px;border-radius:7px;cursor:pointer;font:inherit;
  border:1px solid var(--dse-line);
  background:transparent;color:inherit;
}
.dse-btn:hover{background:var(--dse-hover)}
.dse-btn:disabled{opacity:.4;cursor:default}
.dse-btn:disabled:hover{background:transparent}
.dse-btn-primary{background:var(--dse-accent-soft);border-color:transparent}
.dse-btn-ghost{border-color:transparent;padding:2px 7px;opacity:.7}
.dse-btn-ghost:hover{opacity:1}
.dse-btn-xs{padding:1px 7px;font-size:11px}
.dse-highlight{
  position:fixed;z-index:999997;pointer-events:none;
  border:1px solid var(--dse-accent);
  background:var(--dse-accent-ghost);border-radius:3px;
}
.dse-selection{position:fixed;z-index:999996;pointer-events:none;outline:1px dashed var(--dse-accent)}
.dse-selection-plain{opacity:.55;z-index:999995}
.dse-knob{position:absolute;pointer-events:auto;background:var(--dse-accent);border-radius:2px}
.dse-h-e{right:-4px;top:50%;width:8px;height:22px;margin-top:-11px;cursor:ew-resize}
.dse-h-s{bottom:-4px;left:50%;height:8px;width:22px;margin-left:-11px;cursor:ns-resize}
.dse-h-se{right:-5px;bottom:-5px;width:11px;height:11px;cursor:nwse-resize}
.dse-h-move{left:-7px;top:-7px;width:15px;height:15px;border-radius:4px;cursor:move;color:#fff;font-size:9px;line-height:15px;text-align:center;touch-action:none}
.dse-panel-grip{cursor:grab;color:var(--dse-faint);font-size:12px;user-select:none;touch-action:none}
.dse-panel-grip:active{cursor:grabbing}
.dse-panel-resize{
  position:absolute;right:3px;bottom:3px;width:12px;height:12px;cursor:nwse-resize;opacity:.55;
  border-right:2px solid var(--dse-faint);
  border-bottom:2px solid var(--dse-faint);
}
.dse-panel-resize:hover{opacity:1}
.dse-panel.is-min{width:auto!important;height:auto!important;max-height:none}
.dse-panel.is-min .dse-section,.dse-panel.is-min .dse-foot,.dse-panel.is-min .dse-hint{display:none}
.dse-panel.is-min .dse-head{margin-bottom:0}
.dse-grip{
  position:fixed;z-index:999995;width:6px;cursor:ew-resize;border-radius:3px;
  background:transparent;transition:background .12s ease;
}
.dse-grip:hover{background:var(--dse-accent)}
`;

    function apply(ctx) {
      loadState();

      ctx.effect(() => {
        const base = document.createElement("style");
        base.id = `${STYLE_ID}-base`;
        base.textContent = BASE_CSS;
        document.head.append(base);

        applyCss();
        buildEntryButton();
        applyTheme();

        const themeObserver = new MutationObserver(() => applyTheme());
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["class", "style", "data-theme", "data-ds-theme", "data-ds-theme-source"],
        });
        let themeMedia = null;
        const onThemeMedia = () => applyTheme();
        try {
          if (typeof window.matchMedia === "function") {
            themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
            if (themeMedia.addEventListener) themeMedia.addEventListener("change", onThemeMedia);
          }
        } catch {
          themeMedia = null;
        }

        const observer = new MutationObserver(() => {
          syncFrame();
          positionSelection();
        });
        observer.observe(document.body || document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["style", "data-sidebar-collapsed", "data-rightbar-collapsed"],
        });

        const onResize = () => {
          syncFrame();
          positionSelection();
        };

        const onPageHide = () => flushSave();
        const onVisibility = () => {
          if (document.visibilityState === "hidden") flushSave();
        };
        window.addEventListener("resize", onResize);
        window.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("pagehide", onPageHide);
        document.addEventListener("visibilitychange", onVisibility);
        syncFrame();

        return () => {
          observer.disconnect();
          themeObserver.disconnect();
          if (themeMedia && themeMedia.removeEventListener) {
            themeMedia.removeEventListener("change", onThemeMedia);
          }
          window.removeEventListener("resize", onResize);
          window.removeEventListener("keydown", onKeyDown, true);
          window.removeEventListener("pagehide", onPageHide);
          document.removeEventListener("visibilitychange", onVisibility);
          frameCache = null;
          document.removeEventListener("pointermove", onHover, true);
          document.removeEventListener("click", onClickCapture, true);
          base.remove();
          if (styleEl) styleEl.remove();
          styleEl = null;
          rootEl?.remove();
          rootEl = null;
          highlightEl?.remove();
          highlightEl = null;
          selectionEl?.remove();
          selectionEl = null;
          for (const box of plainBoxes) box.remove();
          plainBoxes = [];
          gripEl?.remove();
          gripEl = null;
          entryEl?.remove();
          entryEl = null;
          selection.clear();
          primary = null;
          document.documentElement.removeAttribute(ATTR);
          document.documentElement.removeAttribute(ATTR_EDITING);
          document.documentElement.removeAttribute(THEME_ATTR);
          editing = false;
          lastCols = "";
        };
      }, "ui-custom: layout overrides");
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
