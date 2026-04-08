/**
 * Helpers para arvore JSON: caminhos, contagens de selecao e UI expandir/recolher.
 */
const TreeUi = {
  getValueAtPath(root, path) {
    if (path === "" || path === undefined) return root;
    const parts = String(path).split(".").filter(Boolean);
    let cur = root;
    for (const p of parts) {
      if (cur === null || cur === undefined) return undefined;
      cur = Array.isArray(cur) ? cur[Number(p)] : cur[p];
    }
    return cur;
  },

  countLeaves(value) {
    if (value === null || value === undefined) return 1;
    if (Array.isArray(value)) return 0;
    if (typeof value !== "object") return 1;
    let n = 0;
    Object.keys(value).forEach((k) => {
      n += TreeUi.countLeaves(value[k]);
    });
    return n;
  },

  countSelectedUnder(pathPrefix, value, selectedMap) {
    if (value === null || value === undefined) {
      return selectedMap.has(pathPrefix) ? 1 : 0;
    }
    if (Array.isArray(value)) return 0;
    if (typeof value !== "object") {
      return selectedMap.has(pathPrefix) ? 1 : 0;
    }
    let n = 0;
    Object.keys(value).forEach((k) => {
      const p = pathPrefix ? `${pathPrefix}.${k}` : k;
      n += TreeUi.countSelectedUnder(p, value[k], selectedMap);
    });
    return n;
  },

  attachToggle(toggleBtn, childList) {
    toggleBtn.type = "button";
    toggleBtn.className = "tree-toggle";
    toggleBtn.setAttribute("aria-expanded", "true");
    toggleBtn.setAttribute("aria-label", "Recolher grupo");
    toggleBtn.textContent = "▼";
    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = toggleBtn.getAttribute("aria-expanded") === "true";
      const nextOpen = !isOpen;
      toggleBtn.setAttribute("aria-expanded", String(nextOpen));
      childList.classList.toggle("tree-children--collapsed", !nextOpen);
      toggleBtn.textContent = nextOpen ? "▼" : "▶";
      toggleBtn.setAttribute("aria-label", nextOpen ? "Recolher grupo" : "Expandir grupo");
    });
  },

  makeToggleSpacer() {
    const spacer = document.createElement("span");
    spacer.className = "tree-toggle-spacer";
    spacer.setAttribute("aria-hidden", "true");
    return spacer;
  },
};
