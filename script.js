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

const selectedMap = new Map();

/** @type {Record<string, Array<{ path: string; columnName: string; mysqlType: string; size: string; nullable: boolean }>>} */
const mysqlState = {};

/** Um unico grupo MySQL na tela principal (uma CREATE TABLE). */
const INDEX_MYSQL_SINGLE_TABLE = "dados";

function mysqlRenderOptions() {
  return {
    selectedMap,
    statsEl: mysqlStats,
    onAddManual(collection) {
      MysqlSchema.addManualRow(mysqlState, collection);
      MysqlSchema.renderTables(mysqlState, mysqlTablesContainer, mysqlRenderOptions());
    },
    onAddManualEmpty() {
      MysqlSchema.addManualRow(mysqlState, INDEX_MYSQL_SINGLE_TABLE);
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

function updateConsolidatedOutput() {
  const rows = [];
  selectedMap.forEach((item) => {
    rows.push(`${item.path} | Tipo: ${item.type} | Valor: ${item.value}`);
  });
  outputFinal.value = rows.join("\n");
}

function renderSelectedList() {
  selectedList.innerHTML = "";
  selectedMap.forEach((item) => {
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
  updateConsolidatedOutput();
  MysqlSchema.updateStatsEl(selectedMap, mysqlState, mysqlStats);
}

function addSelection(path, value) {
  if (Array.isArray(value)) {
    return;
  }

  const item = {
    path,
    collection: INDEX_MYSQL_SINGLE_TABLE,
    type: getDataType(value),
    value: stringifyValue(value),
  };
  selectedMap.set(path, item);
}

function addDescendantSelections(parentPath, value) {
  if (value === null || typeof value !== "object") {
    addSelection(parentPath, value);
    return;
  }

  if (Array.isArray(value)) {
    // Arrays nao entram na selecao recursiva de filhos.
    return;
  }

  Object.keys(value).forEach((childKey) => {
    const childPath = `${parentPath}.${childKey}`;
    addDescendantSelections(childPath, value[childKey]);
  });
}

function buildTreeNode(key, value, parentPath) {
  const currentPath = parentPath ? `${parentPath}.${key}` : key;
  const li = document.createElement("li");
  li.className = "tree-item";

  const keyButton = document.createElement("button");
  keyButton.type = "button";
  keyButton.className = "tree-key";
  if (Array.isArray(value)) {
    keyButton.classList.add("tree-key-array");
  } else if (value !== null && typeof value === "object") {
    keyButton.classList.add("tree-key-object");
  }
  keyButton.textContent = key;
  keyButton.addEventListener("click", () => {
    if (value !== null && typeof value === "object") {
      addDescendantSelections(currentPath, value);
    } else {
      addSelection(currentPath, value);
    }
    renderSelectedList();
  });

  const meta = document.createElement("span");
  meta.className = "tree-meta";
  meta.textContent = ` (${getDataType(value)})`;

  li.appendChild(keyButton);
  li.appendChild(meta);

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const childList = document.createElement("ul");
    childList.className = "tree-list";
    Object.keys(value).forEach((childKey) => {
      childList.appendChild(buildTreeNode(childKey, value[childKey], currentPath));
    });

    li.appendChild(childList);
  }

  return li;
}

function renderTree(data) {
  treeContainer.innerHTML = "";

  if (data === null || typeof data !== "object") {
    const message = document.createElement("p");
    message.className = "placeholder";
    message.textContent = "O JSON deve ser um objeto ou array na raiz.";
    treeContainer.appendChild(message);
    return;
  }

  const rootList = document.createElement("ul");
  rootList.className = "tree-list";

  if (Array.isArray(data)) {
    data.forEach((item, index) => {
      rootList.appendChild(buildTreeNode(String(index), item, ""));
    });
  } else {
    Object.keys(data).forEach((key) => {
      rootList.appendChild(buildTreeNode(key, data[key], ""));
    });
  }

  treeContainer.appendChild(rootList);
}

function showStatus(message, type) {
  inputStatus.textContent = message;
  inputStatus.className = `status ${type}`;
}

function parseJsonWithFallback(raw) {
  try {
    return JSON.parse(raw);
  } catch (_firstError) {
    // Permite colar fragmentos no formato: "chave": { ... }
    const wrapped = `{${raw}}`;
    return JSON.parse(wrapped);
  }
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
    treeContainer.innerHTML = '<p class="placeholder">Insira um JSON valido para continuar.</p>';
    showStatus("Cole um JSON antes de processar.", "error");
    return;
  }

  try {
    const parsed = parseJsonWithFallback(raw);
    renderTree(parsed);
    showStatus("JSON processado com sucesso.", "success");
  } catch (_error) {
    treeContainer.innerHTML = '<p class="placeholder">Nao foi possivel processar o JSON informado.</p>';
    showStatus("JSON invalido. Verifique a sintaxe.", "error");
  }
});

MysqlSchema.renderTables(mysqlState, mysqlTablesContainer, mysqlRenderOptions());
