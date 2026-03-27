const jsonInput = document.getElementById("jsonInput");
const processBtn = document.getElementById("processBtn");
const treeContainer = document.getElementById("treeContainer");
const selectedList = document.getElementById("selectedList");
const outputFinal = document.getElementById("outputFinal");
const inputStatus = document.getElementById("inputStatus");

const selectedMap = new Map();
let currentArrayPaths = [];

function joinPath(base, key) {
  if (!base) return key;
  return `${base}.${key}`;
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
  const item = {
    path: path.startsWith(".") ? path.slice(1) : path,
    collection: getCollectionName(path),
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

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tree-key";
  btn.textContent = label;
  btn.addEventListener("click", () => {
    addSelection(path, value);
    renderSelectedList();
  });

  const meta = document.createElement("span");
  meta.className = "tree-meta";
  meta.textContent = ` (${getDataType(value)})`;

  li.appendChild(btn);
  li.appendChild(meta);
  return li;
}

function buildObjectNode(label, path, obj) {
  const li = document.createElement("li");
  li.className = "tree-item";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tree-key tree-key-object";
  btn.textContent = label;
  btn.addEventListener("click", () => {
    addDescendantSelections(path, obj);
    renderSelectedList();
  });

  const meta = document.createElement("span");
  meta.className = "tree-meta";
  meta.textContent = " (Object)";

  li.appendChild(btn);
  li.appendChild(meta);

  const ul = document.createElement("ul");
  ul.className = "tree-list";
  Object.keys(obj).forEach((k) => {
    const v = obj[k];
    const childPath = joinPath(path, k);
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      ul.appendChild(buildObjectNode(k, childPath, v));
    } else {
      ul.appendChild(buildLeafNode(k, childPath, v));
    }
  });
  li.appendChild(ul);
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

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tree-key tree-key-array";
  btn.textContent = label;
  btn.addEventListener("click", () => {
    // Ao clicar na lista, adiciona todos os campos dos objetos dela.
    addArrayObjectSelections(path, arr);
    renderSelectedList();
  });

  const meta = document.createElement("span");
  meta.className = "tree-meta";
  meta.textContent = ` (Array, itens: ${arr.length})`;

  li.appendChild(btn);
  li.appendChild(meta);

  const ul = document.createElement("ul");
  ul.className = "tree-list";

  // Sem indice [0], [1]...: exibimos somente os campos do(s) objeto(s) da lista.
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
    const span = document.createElement("span");
    span.className = "tree-meta";
    span.textContent = " (sem itens-objeto para listar)";
    empty.appendChild(span);
    ul.appendChild(empty);
  }

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

  const rootList = document.createElement("ul");
  rootList.className = "tree-list";
  arrays.forEach((entry) => {
    rootList.appendChild(buildArrayNode(entry.path, entry.path === "(root)" ? "" : entry.path, entry.value));
  });
  treeContainer.appendChild(rootList);
}

processBtn.addEventListener("click", () => {
  const raw = jsonInput.value.trim();
  selectedMap.clear();
  renderSelectedList();

  if (!raw) {
    treeContainer.innerHTML = '<p class="placeholder">Insira um JSON valido para continuar.</p>';
    showStatus("Cole um JSON antes de processar.", "error");
    return;
  }

  try {
    const parsed = parseJsonWithFallback(raw);
    renderFilteredTree(parsed);
    showStatus("JSON processado com sucesso.", "success");
  } catch (_error) {
    treeContainer.innerHTML = '<p class="placeholder">Nao foi possivel processar o JSON informado.</p>';
    showStatus("JSON invalido. Verifique a sintaxe.", "error");
  }
});

