const jsonInput = document.getElementById("jsonInput");
const processBtn = document.getElementById("processBtn");
const treeContainer = document.getElementById("treeContainer");
const selectedList = document.getElementById("selectedList");
const outputFinal = document.getElementById("outputFinal");
const inputStatus = document.getElementById("inputStatus");
const syncMysqlBtn = document.getElementById("syncMysqlBtn");
const generateMysqlBtn = document.getElementById("generateMysqlBtn");
const mysqlTablesContainer = document.getElementById("mysqlTablesContainer");
const mysqlOutput = document.getElementById("mysqlOutput");
const includeIdColumn = document.getElementById("includeIdColumn");
const mysqlStats = document.getElementById("mysqlStats");
const varcharHintsInput = document.getElementById("varcharHintsInput");
const reapplyVarcharHintsBtn = document.getElementById("reapplyVarcharHintsBtn");
const VARCHAR_HINTS_LS = "analisadorjson-varchar-hints";

const selectedMap = new Map();
let currentArrayPaths = [];

/** Raiz do JSON processado (estado visual na arvore). */
let listasJsonRoot = null;

function listasMergedLeafCount(arr) {
  const merged = buildArrayObjectFields(arr);
  let n = 0;
  Object.keys(merged).forEach((k) => {
    const v = merged[k];
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      n += TreeUi.countLeaves(v);
    } else {
      n += 1;
    }
  });
  return n;
}

function listasMergedSelectedCount(arrayPath, arr, map) {
  const merged = buildArrayObjectFields(arr);
  let n = 0;
  Object.keys(merged).forEach((k) => {
    const p = joinPath(arrayPath, k);
    const v = merged[k];
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      n += TreeUi.countSelectedUnder(p, v, map);
    } else if (map.has(p)) {
      n += 1;
    }
  });
  return n;
}

function syncListasTreeVisuals() {
  if (listasJsonRoot === null || !treeContainer.querySelector(".tree-list")) return;
  treeContainer.querySelectorAll(".tree-key[data-tree-path]").forEach((btn) => {
    const path = btn.dataset.treePath;
    if (path === undefined) return;
    btn.classList.remove("tree-key--selected", "tree-key--partial", "tree-key--group-full");
    const val = TreeUi.getValueAtPath(listasJsonRoot, path);
    if (Array.isArray(val)) {
      const total = listasMergedLeafCount(val);
      if (total > 0) {
        const sel = listasMergedSelectedCount(path, val, selectedMap);
        if (sel === total) btn.classList.add("tree-key--group-full");
        else if (sel > 0) btn.classList.add("tree-key--partial");
      }
    } else if (val !== null && typeof val === "object") {
      const total = TreeUi.countLeaves(val);
      if (total > 0) {
        const sel = TreeUi.countSelectedUnder(path, val, selectedMap);
        if (sel === total) btn.classList.add("tree-key--group-full");
        else if (sel > 0) btn.classList.add("tree-key--partial");
      }
    } else if (selectedMap.has(path)) {
      btn.classList.add("tree-key--selected");
    }
  });
}

/** @type {Record<string, Array<{ path: string; columnName: string; mysqlType: string; size: string; nullable: boolean }>>} */
const mysqlState = {};

function joinPath(base, key) {
  if (!base) return key;
  return `${base}.${key}`;
}

function mysqlRenderOptions() {
  return {
    selectedMap,
    statsEl: mysqlStats,
    onAddManual(collection) {
      MysqlSchema.addManualRow(mysqlState, collection);
      MysqlSchema.renderTables(mysqlState, mysqlTablesContainer, mysqlRenderOptions());
    },
  };
}

function syncMysqlFromSelection() {
  MysqlSchema.syncFromSelection(selectedMap, mysqlState);
  MysqlSchema.renderTables(mysqlState, mysqlTablesContainer, mysqlRenderOptions());
}

function generateMysqlSql() {
  MysqlSchema.generateSql(mysqlState, mysqlOutput, includeIdColumn.checked);
}

function getDataType(value) {
  if (value === null) return "Null";
  if (Array.isArray(value)) return "Array";
  const jsType = typeof value;
  return jsType.charAt(0).toUpperCase() + jsType.slice(1);
}

function stringifyValue(value) {
  if (typeof value === "string") return `"${value}"`;
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return "[Objeto nao serializavel]";
    }
  }
  return String(value);
}

function showStatus(message, type) {
  inputStatus.textContent = message;
  inputStatus.className = `status ${type}`;
}

function parseJsonWithFallback(raw) {
  try {
    return JSON.parse(raw);
  } catch (_firstError) {
    return JSON.parse(`{${raw}}`);
  }
}

function updateConsolidatedOutput() {
  const rows = [];
  const grouped = new Map();
  selectedMap.forEach((item) => {
    if (!grouped.has(item.collection)) {
      grouped.set(item.collection, []);
    }
    grouped.get(item.collection).push(item);
  });

  grouped.forEach((items, collection) => {
    rows.push(`--table [${collection}]`);
    items.forEach((item) => {
      rows.push(`${item.path} | Tipo: ${item.type} | Valor: ${item.value}`);
    });
    rows.push("");
  });

  outputFinal.value = rows.join("\n").trim();
}

function renderSelectedList() {
  selectedList.innerHTML = "";

  const grouped = new Map();
  selectedMap.forEach((item) => {
    if (!grouped.has(item.collection)) {
      grouped.set(item.collection, []);
    }
    grouped.get(item.collection).push(item);
  });

  grouped.forEach((items, collection) => {
    const titleLi = document.createElement("li");
    titleLi.className = "selected-table-title";
    titleLi.textContent = `--table [${collection}]`;
    selectedList.appendChild(titleLi);

    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "selected-item";

      const text = document.createElement("span");
      text.className = "selected-text";
      text.textContent = `${item.path} | Tipo: ${item.type} | Valor: ${item.value}`;

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "remove-btn";
      removeBtn.textContent = "Remover";
      removeBtn.addEventListener("click", () => {
        selectedMap.delete(item.path);
        renderSelectedList();
      });

      li.appendChild(text);
      li.appendChild(removeBtn);
      selectedList.appendChild(li);
    });
  });
  updateConsolidatedOutput();
  MysqlSchema.updateStatsEl(selectedMap, mysqlState, mysqlStats);
  syncListasTreeVisuals();
}

function getCollectionName(path) {
  const normalized = path.startsWith(".") ? path.slice(1) : path;
  let bestMatch = "";

  currentArrayPaths.forEach((arrayPath) => {
    const normalizedArrayPath = arrayPath.startsWith(".") ? arrayPath.slice(1) : arrayPath;
    if (!normalizedArrayPath) return;
    if (
      normalized === normalizedArrayPath ||
      normalized.startsWith(`${normalizedArrayPath}.`)
    ) {
      if (normalizedArrayPath.length > bestMatch.length) {
        bestMatch = normalizedArrayPath;
      }
    }
  });

  return bestMatch || "sem_colecao";
}

function addSelection(path, value) {
  if (Array.isArray(value)) return;
  const normPath = path.startsWith(".") ? path.slice(1) : path;
  const item = {
    path: normPath,
    collection: getCollectionName(normPath),
    type: getDataType(value),
    value: stringifyValue(value),
  };
  selectedMap.set(normPath, item);
}

function addDescendantSelections(parentPath, value) {
  if (value === null || typeof value !== "object") {
    addSelection(parentPath, value);
    return;
  }

  if (Array.isArray(value)) {
    // Nesta tela, arrays sao apenas "containers"; nao adicionamos o array em si.
    value.forEach((item, index) => {
      const childPath = `${parentPath}.${index}`;
      addDescendantSelections(childPath, item);
    });
    return;
  }

  Object.keys(value).forEach((childKey) => {
    addDescendantSelections(joinPath(parentPath, childKey), value[childKey]);
  });
}

function addArrayObjectSelections(arrayPath, arr) {
  arr.forEach((item) => {
    if (item !== null && typeof item === "object" && !Array.isArray(item)) {
      Object.keys(item).forEach((k) => {
        addDescendantSelections(joinPath(arrayPath, k), item[k]);
      });
    }
  });
}

function buildLeafNode(label, path, value) {
  const li = document.createElement("li");
  li.className = "tree-item";

  const row = document.createElement("div");
  row.className = "tree-row";
  row.appendChild(TreeUi.makeToggleSpacer());

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tree-key";
  btn.dataset.treePath = path;
  btn.textContent = label;
  btn.addEventListener("click", () => {
    addSelection(path, value);
    renderSelectedList();
  });

  const meta = document.createElement("span");
  meta.className = "tree-meta";
  meta.textContent = ` (${getDataType(value)})`;

  row.appendChild(btn);
  row.appendChild(meta);
  li.appendChild(row);
  return li;
}

function buildObjectNode(label, path, obj) {
  const li = document.createElement("li");
  li.className = "tree-item";

  const childList = document.createElement("ul");
  childList.className = "tree-list tree-children";
  Object.keys(obj).forEach((k) => {
    const v = obj[k];
    const childPath = joinPath(path, k);
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      childList.appendChild(buildObjectNode(k, childPath, v));
    } else {
      childList.appendChild(buildLeafNode(k, childPath, v));
    }
  });

  const row = document.createElement("div");
  row.className = "tree-row";

  const toggle = document.createElement("button");
  TreeUi.attachToggle(toggle, childList);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tree-key tree-key-object";
  btn.dataset.treePath = path;
  btn.textContent = label;
  btn.addEventListener("click", () => {
    addDescendantSelections(path, obj);
    renderSelectedList();
  });

  const meta = document.createElement("span");
  meta.className = "tree-meta";
  meta.textContent = " (Object)";

  row.appendChild(toggle);
  row.appendChild(btn);
  row.appendChild(meta);
  li.appendChild(row);
  li.appendChild(childList);
  return li;
}

function buildArrayObjectFields(arr) {
  const merged = {};
  arr.forEach((item) => {
    if (item !== null && typeof item === "object" && !Array.isArray(item)) {
      Object.keys(item).forEach((k) => {
        if (!(k in merged)) {
          merged[k] = item[k];
        }
      });
    }
  });
  return merged;
}

function buildArrayNode(label, path, arr) {
  const li = document.createElement("li");
  li.className = "tree-item";

  const ul = document.createElement("ul");
  ul.className = "tree-list tree-children";

  const mergedFields = buildArrayObjectFields(arr);
  Object.keys(mergedFields).forEach((k) => {
    const v = mergedFields[k];
    const childPath = joinPath(path, k);
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      ul.appendChild(buildObjectNode(k, childPath, v));
    } else {
      ul.appendChild(buildLeafNode(k, childPath, v));
    }
  });

  if (!ul.childNodes.length) {
    const empty = document.createElement("li");
    empty.className = "tree-item";
    const row = document.createElement("div");
    row.className = "tree-row";
    row.appendChild(TreeUi.makeToggleSpacer());
    const span = document.createElement("span");
    span.className = "tree-meta";
    span.textContent = " (sem itens-objeto para listar)";
    row.appendChild(span);
    empty.appendChild(row);
    ul.appendChild(empty);
  }

  const row = document.createElement("div");
  row.className = "tree-row";

  const toggle = document.createElement("button");
  TreeUi.attachToggle(toggle, ul);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tree-key tree-key-array";
  btn.dataset.treePath = path;
  btn.textContent = label;
  btn.addEventListener("click", () => {
    addArrayObjectSelections(path, arr);
    renderSelectedList();
  });

  const meta = document.createElement("span");
  meta.className = "tree-meta";
  meta.textContent = ` (Array, itens: ${arr.length})`;

  row.appendChild(toggle);
  row.appendChild(btn);
  row.appendChild(meta);
  li.appendChild(row);
  li.appendChild(ul);
  return li;
}

function collectArraysOnly(data, parentPath, out) {
  if (data === null || typeof data !== "object") return;

  if (Array.isArray(data)) {
    out.push({ path: parentPath || "(root)", value: data });
    return;
  }

  Object.keys(data).forEach((k) => {
    const v = data[k];
    const p = parentPath ? `${parentPath}.${k}` : k;
    collectArraysOnly(v, p, out);
  });
}

function renderFilteredTree(data) {
  treeContainer.innerHTML = "";
  listasJsonRoot = null;

  const arrays = [];
  collectArraysOnly(data, "", arrays);
  currentArrayPaths = arrays
    .map((entry) => (entry.path === "(root)" ? "" : entry.path))
    .filter((path) => path !== "");

  if (!arrays.length) {
    const message = document.createElement("p");
    message.className = "placeholder";
    message.textContent = "Nenhum campo do tipo Array foi encontrado neste JSON.";
    treeContainer.appendChild(message);
    return;
  }

  listasJsonRoot = data;

  const rootList = document.createElement("ul");
  rootList.className = "tree-list";
  arrays.forEach((entry) => {
    rootList.appendChild(buildArrayNode(entry.path, entry.path === "(root)" ? "" : entry.path, entry.value));
  });
  treeContainer.appendChild(rootList);
  syncListasTreeVisuals();
}

syncMysqlBtn.addEventListener("click", () => {
  syncMysqlFromSelection();
});

generateMysqlBtn.addEventListener("click", () => {
  generateMysqlSql();
});

processBtn.addEventListener("click", () => {
  const raw = jsonInput.value.trim();
  selectedMap.clear();
  MysqlSchema.clearState(mysqlState);
  renderSelectedList();
  MysqlSchema.renderTables(mysqlState, mysqlTablesContainer, mysqlRenderOptions());

  if (!raw) {
    listasJsonRoot = null;
    treeContainer.innerHTML = '<p class="placeholder">Insira um JSON valido para continuar.</p>';
    showStatus("Cole um JSON antes de processar.", "error");
    return;
  }

  try {
    const parsed = parseJsonWithFallback(raw);
    renderFilteredTree(parsed);
    showStatus("JSON processado com sucesso.", "success");
  } catch (_error) {
    listasJsonRoot = null;
    treeContainer.innerHTML = '<p class="placeholder">Nao foi possivel processar o JSON informado.</p>';
    showStatus("JSON invalido. Verifique a sintaxe.", "error");
  }
});

function initVarcharHints() {
  if (!varcharHintsInput) return;
  const saved =
    localStorage.getItem("analisadorjson-field-hints") ?? localStorage.getItem(VARCHAR_HINTS_LS);
  varcharHintsInput.value =
    saved !== null ? saved : MysqlSchema.DEFAULT_FIELD_HINTS.trim();
  MysqlSchema.fieldHintsText = varcharHintsInput.value;
  varcharHintsInput.addEventListener("input", () => {
    localStorage.setItem("analisadorjson-field-hints", varcharHintsInput.value);
    MysqlSchema.fieldHintsText = varcharHintsInput.value;
  });
  if (reapplyVarcharHintsBtn) {
    reapplyVarcharHintsBtn.addEventListener("click", () => {
      MysqlSchema.fieldHintsText = varcharHintsInput.value;
      MysqlSchema.reapplyFieldHintsToState(mysqlState);
      MysqlSchema.renderTables(mysqlState, mysqlTablesContainer, mysqlRenderOptions());
    });
  }
}

initVarcharHints();
MysqlSchema.renderTables(mysqlState, mysqlTablesContainer, mysqlRenderOptions());
