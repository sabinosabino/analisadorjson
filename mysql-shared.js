/**
 * MySQL schema UI + SQL generation (shared by index.html and listas.html).
 * Column names: pai_filho (immediate parent + leaf), except single-segment paths.
 * Sync preserves selection order; manual rows (not from JSON) stay at the end.
 */
const MysqlSchema = {
  /** Colunas fixas em toda tabela gerada (apos as colunas da grade). */
  STANDARD_TABLE_COLUMNS_SQL: [
    "  `cadastradoEm` datetime DEFAULT NULL",
    "  `atualizadoEm` datetime DEFAULT NULL",
    "  `criadoPor` varchar(50) DEFAULT NULL",
    "  `atualizadoPor` varchar(50) DEFAULT NULL",
    "  `excluido` tinyint(4) DEFAULT NULL",
    "  `excluidoEm` datetime DEFAULT NULL",
    "  `EmpresaId` varchar(14) DEFAULT NULL",
  ],

  /**
   * Atalhos de tipo/tamanho por palavra-chave no caminho ou nome da coluna.
   *
   * Formatos:
   * - Legado: palavra + numero so = VARCHAR(n)  →  cMun 20
   * - Explicito: palavra TIPO [extra]  →  dhEmi datetime | vBC decimal 15,2 | ativo tinyint 1
   * Linhas # sao comentario. Igualdade no ultimo segmento ou no nome da coluna vem antes de "contem".
   */
  DEFAULT_FIELD_HINTS: `# Legado (so numero = VARCHAR)
cMun 20
cUF 2
xMun 60
bairro 80
nro 15
cep 9
logradouro 120
compl 60
xBairro 60
xCpl 60
xLgr 120

# Tipos explicitos (exemplos)
# dhEmi datetime
# dEmi date
# vBC decimal 15,2
# vNF decimal 15,0
# pRedBC decimal 7,4
# ativo tinyint 1
`,

  fieldHintsText: "",

  parseFieldHintsLine(line) {
    const t = line.trim();
    if (!t || t.startsWith("#")) return null;

    const explicit = t.match(
      /^\s*([^\s#]+)\s+(VARCHAR|CHAR|TEXT|TINYTEXT|MEDIUMTEXT|LONGTEXT|INT|BIGINT|SMALLINT|TINYINT|DECIMAL|DOUBLE|FLOAT|DATE|DATETIME|TIMESTAMP|JSON)\b\s*(.*)$/i
    );
    if (explicit) {
      const key = explicit[1].toLowerCase();
      const mysqlType = explicit[2].toUpperCase();
      let rest = explicit[3].trim().replace(/\s*,\s*/g, ",");

      let size = "";
      if (["VARCHAR", "CHAR"].includes(mysqlType)) {
        const m = rest.match(/^(\d+)/);
        size = m ? m[1] : "255";
      } else if (["DECIMAL", "FLOAT", "DOUBLE"].includes(mysqlType)) {
        const m = rest.match(/^([\d]+\s*,\s*[\d]+)/);
        if (m) size = m[1].replace(/\s/g, "");
        else if (mysqlType === "DECIMAL") size = "10,2";
      } else if (mysqlType === "TINYINT") {
        const m = rest.match(/^(\d+)/);
        size = m ? m[1] : "1";
      }
      return { key, mysqlType, size };
    }

    const legacy = t.match(/^\s*([^\s#]+)[\s,]+(\d+)\s*$/);
    if (legacy) {
      const key = legacy[1].trim().toLowerCase();
      const n = parseInt(legacy[2], 10);
      if (key && !Number.isNaN(n) && n > 0) {
        return { key, mysqlType: "VARCHAR", size: String(n) };
      }
    }
    return null;
  },

  parseFieldHints(text) {
    const rules = [];
    String(text || "")
      .split(/\r?\n/)
      .forEach((line) => {
        const r = MysqlSchema.parseFieldHintsLine(line);
        if (r) rules.push(r);
      });
    return rules;
  },

  matchFieldHintRule(path, columnName, rules) {
    if (!rules.length) return null;
    const lastSeg = String(path).split(".").pop().toLowerCase();
    const col = String(columnName).toLowerCase();
    const pathLower = String(path).toLowerCase();

    for (const r of rules) {
      if (lastSeg === r.key || col === r.key) {
        return { mysqlType: r.mysqlType, size: r.size };
      }
    }
    for (const r of rules) {
      if (pathLower.includes(r.key) || lastSeg.includes(r.key) || col.includes(r.key)) {
        return { mysqlType: r.mysqlType, size: r.size };
      }
    }
    return null;
  },

  findFieldHintRule(path, columnName) {
    const rules = MysqlSchema.parseFieldHints(MysqlSchema.fieldHintsText);
    return MysqlSchema.matchFieldHintRule(path, columnName, rules);
  },

  MYSQL_TYPES: [
    "VARCHAR",
    "CHAR",
    "TEXT",
    "TINYTEXT",
    "MEDIUMTEXT",
    "LONGTEXT",
    "INT",
    "BIGINT",
    "SMALLINT",
    "TINYINT",
    "DECIMAL",
    "DOUBLE",
    "FLOAT",
    "DATE",
    "DATETIME",
    "TIMESTAMP",
    "JSON",
  ],

  sanitizeMysqlIdentifier(name) {
    const s = String(name).replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_");
    const trimmed = s.replace(/^_|_$/g, "");
    if (!trimmed.length) return "col";
    if (/^[0-9]/.test(trimmed)) return `c_${trimmed}`;
    return trimmed;
  },

  defaultColumnNameFromPath(path) {
    const parts = path.split(".").filter((p) => p.length > 0);
    if (parts.length === 0) {
      return "col";
    }
    if (parts.length === 1) {
      return MysqlSchema.sanitizeMysqlIdentifier(parts[0]);
    }
    const parent = parts[parts.length - 2];
    const leaf = parts[parts.length - 1];
    return MysqlSchema.sanitizeMysqlIdentifier(`${parent}_${leaf}`);
  },

  suggestMysqlRow(item) {
    const columnName = MysqlSchema.defaultColumnNameFromPath(item.path);
    let mysqlType = "VARCHAR";
    let size = "255";
    const nullable = true;

    switch (item.type) {
      case "Number":
        mysqlType = "INT";
        size = "";
        break;
      case "Boolean":
        mysqlType = "TINYINT";
        size = "1";
        break;
      case "String":
        mysqlType = "VARCHAR";
        size = "255";
        break;
      case "Null":
        mysqlType = "VARCHAR";
        size = "255";
        break;
      default:
        mysqlType = "TEXT";
        size = "";
        break;
    }

    const hint = MysqlSchema.findFieldHintRule(item.path, columnName);
    if (hint) {
      mysqlType = hint.mysqlType;
      size = hint.size !== undefined && hint.size !== null ? hint.size : "";
    }

    return {
      path: item.path,
      columnName,
      mysqlType,
      size,
      nullable,
    };
  },

  manualRowTemplate() {
    const path = `__manual_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const columnName = "campo_extra";
    const hint = MysqlSchema.findFieldHintRule(path, columnName);
    return {
      path,
      manual: true,
      columnName,
      mysqlType: hint ? hint.mysqlType : "VARCHAR",
      size: hint ? hint.size || "" : "255",
      nullable: true,
    };
  },

  addManualRow(mysqlState, collection) {
    if (!mysqlState[collection]) {
      mysqlState[collection] = [];
    }
    mysqlState[collection].push(MysqlSchema.manualRowTemplate());
  },

  /** Reaplica atalhos de tipo (VARCHAR, DECIMAL, DATETIME, etc.) na grade ja carregada. */
  reapplyFieldHintsToState(mysqlState) {
    Object.values(mysqlState).forEach((rows) => {
      rows.forEach((row) => {
        const hint = MysqlSchema.findFieldHintRule(row.path, row.columnName);
        if (hint) {
          row.mysqlType = hint.mysqlType;
          row.size = hint.size !== undefined && hint.size !== null ? hint.size : "";
        }
      });
    });
  },

  typeNeedsSizeField(mysqlType) {
    return ["VARCHAR", "CHAR", "BINARY", "VARBINARY", "TINYINT", "DECIMAL", "FLOAT", "DOUBLE"].includes(
      mysqlType
    );
  },

  clearState(mysqlState) {
    Object.keys(mysqlState).forEach((k) => {
      delete mysqlState[k];
    });
  },

  countStats(selectedMap, mysqlState) {
    const selectionCount = selectedMap.size;
    let jsonCols = 0;
    let manualCols = 0;
    Object.values(mysqlState).forEach((rows) => {
      rows.forEach((r) => {
        if (r.manual) manualCols += 1;
        else jsonCols += 1;
      });
    });
    return {
      selectionCount,
      jsonCols,
      manualCols,
      totalCols: jsonCols + manualCols,
    };
  },

  formatStats(selectedMap, mysqlState) {
    const s = MysqlSchema.countStats(selectedMap, mysqlState);
    const mismatch = s.jsonCols !== s.selectionCount;
    const warn = mismatch
      ? " — sincronize para alinhar colunas do JSON com a selecao."
      : "";
    return (
      `Selecao JSON: ${s.selectionCount} campo(s) · Grade MySQL: ${s.totalCols} coluna(s) ` +
      `(${s.jsonCols} do JSON · ${s.manualCols} extra(s))${warn}`
    );
  },

  updateStatsEl(selectedMap, mysqlState, statsEl) {
    if (!statsEl) return;
    if (!Object.keys(mysqlState).length && selectedMap.size === 0) {
      statsEl.textContent = "";
      return;
    }
    statsEl.textContent = MysqlSchema.formatStats(selectedMap, mysqlState);
  },

  syncFromSelection(selectedMap, mysqlState) {
    const byCollection = new Map();
    const orderByCollection = new Map();

    selectedMap.forEach((item, path) => {
      if (!byCollection.has(item.collection)) {
        byCollection.set(item.collection, new Map());
        orderByCollection.set(item.collection, []);
      }
      const pathMap = byCollection.get(item.collection);
      if (!pathMap.has(path)) {
        pathMap.set(path, item);
        orderByCollection.get(item.collection).push(path);
      }
    });

    Object.keys(mysqlState).forEach((collection) => {
      if (byCollection.has(collection)) return;
      const manualOnly = (mysqlState[collection] || []).filter((r) => r.manual);
      if (manualOnly.length) {
        mysqlState[collection] = manualOnly;
      } else {
        delete mysqlState[collection];
      }
    });

    byCollection.forEach((pathMap, collection) => {
      const existing = mysqlState[collection] || [];
      const manualRows = existing.filter((r) => r.manual);
      const orderedPaths = orderByCollection.get(collection) || [];

      const pathToRow = new Map();
      existing
        .filter((r) => !r.manual && pathMap.has(r.path))
        .forEach((r) => pathToRow.set(r.path, r));

      orderedPaths.forEach((path) => {
        const item = pathMap.get(path);
        if (!pathToRow.has(path)) {
          pathToRow.set(path, MysqlSchema.suggestMysqlRow(item));
        }
      });

      const jsonRows = orderedPaths.filter((p) => pathToRow.has(p)).map((p) => pathToRow.get(p));

      mysqlState[collection] = [...jsonRows, ...manualRows];
    });
  },

  /**
   * @param {object} options
   * @param {Map} [options.selectedMap]
   * @param {HTMLElement} [options.statsEl]
   * @param {function(collection: string): void} [options.onAddManual]
   * @param {function(): void} [options.onAddManualEmpty] — quando nao ha tabelas (ex.: so extras na tela principal)
   */
  renderTables(mysqlState, mysqlTablesContainer, options = {}) {
    const { selectedMap, statsEl, onAddManual, onAddManualEmpty } = options;

    mysqlTablesContainer.innerHTML = "";
    const collections = Object.keys(mysqlState).sort((a, b) => a.localeCompare(b, "pt-BR"));

    if (!collections.length) {
      const wrap = document.createElement("div");
      wrap.className = "mysql-empty-wrap";
      const p = document.createElement("p");
      p.className = "mysql-placeholder";
      p.textContent =
        "Nenhum campo MySQL ainda. Selecione campos na arvore e clique em Sincronizar, ou adicione colunas extras.";
      wrap.appendChild(p);
      if (typeof onAddManualEmpty === "function") {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-secondary mysql-add-empty-btn";
        btn.textContent = "Adicionar coluna (sem JSON)";
        btn.addEventListener("click", () => onAddManualEmpty());
        wrap.appendChild(btn);
      }
      mysqlTablesContainer.appendChild(wrap);
      if (selectedMap && statsEl) {
        MysqlSchema.updateStatsEl(selectedMap, mysqlState, statsEl);
      }
      return;
    }

    collections.forEach((collection) => {
      const rows = mysqlState[collection];
      const block = document.createElement("div");
      block.className = "mysql-table-block";

      const headRow = document.createElement("div");
      headRow.className = "mysql-table-head";

      const title = document.createElement("h3");
      title.textContent = `Tabela sugerida: \`${MysqlSchema.sanitizeMysqlIdentifier(collection)}\``;
      headRow.appendChild(title);

      if (typeof onAddManual === "function") {
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "btn-secondary mysql-add-col-btn";
        addBtn.textContent = "Adicionar coluna (sem JSON)";
        addBtn.addEventListener("click", () => onAddManual(collection));
        headRow.appendChild(addBtn);
      }

      block.appendChild(headRow);

      const wrap = document.createElement("div");
      wrap.className = "mysql-grid-wrap";

      const table = document.createElement("table");
      table.className = "mysql-grid";

      const thead = document.createElement("thead");
      thead.innerHTML =
        "<tr><th>Caminho JSON</th><th>Nome da coluna</th><th>Tipo MySQL</th><th>Tamanho / precisao</th><th>NULL</th><th scope=\"col\">Extra</th></tr>";
      table.appendChild(thead);

      const tbody = document.createElement("tbody");

      rows.forEach((row, index) => {
        const tr = document.createElement("tr");
        if (row.manual) tr.classList.add("mysql-row-manual");

        const tdPath = document.createElement("td");
        tdPath.className = "path-cell";
        tdPath.textContent = row.manual ? "(sem JSON)" : row.path;

        const tdName = document.createElement("td");
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.value = row.columnName;
        nameInput.autocomplete = "off";
        nameInput.addEventListener("input", () => {
          mysqlState[collection][index].columnName = nameInput.value;
        });
        tdName.appendChild(nameInput);

        const tdSize = document.createElement("td");
        tdSize.className = "size-cell";
        const sizeInput = document.createElement("input");
        sizeInput.type = "text";
        sizeInput.value = row.size;
        sizeInput.placeholder = "ex: 255 ou 10,2";
        sizeInput.disabled = !MysqlSchema.typeNeedsSizeField(row.mysqlType);
        sizeInput.addEventListener("input", () => {
          mysqlState[collection][index].size = sizeInput.value;
        });
        tdSize.appendChild(sizeInput);

        const tdType = document.createElement("td");
        const typeSelect = document.createElement("select");
        MysqlSchema.MYSQL_TYPES.forEach((t) => {
          const opt = document.createElement("option");
          opt.value = t;
          opt.textContent = t;
          if (t === row.mysqlType) opt.selected = true;
          typeSelect.appendChild(opt);
        });
        typeSelect.addEventListener("change", () => {
          mysqlState[collection][index].mysqlType = typeSelect.value;
          const needs = MysqlSchema.typeNeedsSizeField(typeSelect.value);
          sizeInput.disabled = !needs;
          if (!needs) {
            mysqlState[collection][index].size = "";
            sizeInput.value = "";
          } else if (!mysqlState[collection][index].size) {
            if (typeSelect.value === "DECIMAL") {
              mysqlState[collection][index].size = "10,2";
              sizeInput.value = "10,2";
            } else if (typeSelect.value === "TINYINT") {
              mysqlState[collection][index].size = "1";
              sizeInput.value = "1";
            } else {
              mysqlState[collection][index].size = "255";
              sizeInput.value = "255";
            }
          }
        });
        tdType.appendChild(typeSelect);

        const tdNull = document.createElement("td");
        tdNull.className = "null-cell";
        const nullCb = document.createElement("input");
        nullCb.type = "checkbox";
        nullCb.checked = row.nullable;
        nullCb.title = "Permitir NULL";
        nullCb.addEventListener("change", () => {
          mysqlState[collection][index].nullable = nullCb.checked;
        });
        tdNull.appendChild(nullCb);

        const tdAct = document.createElement("td");
        tdAct.className = "mysql-actions-cell";
        if (row.manual) {
          const rm = document.createElement("button");
          rm.type = "button";
          rm.className = "remove-btn mysql-remove-extra";
          rm.textContent = "Remover";
          rm.addEventListener("click", () => {
            mysqlState[collection].splice(index, 1);
            if (!mysqlState[collection].length) {
              delete mysqlState[collection];
            }
            MysqlSchema.renderTables(mysqlState, mysqlTablesContainer, options);
          });
          tdAct.appendChild(rm);
        }

        tr.appendChild(tdPath);
        tr.appendChild(tdName);
        tr.appendChild(tdType);
        tr.appendChild(tdSize);
        tr.appendChild(tdNull);
        tr.appendChild(tdAct);
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      wrap.appendChild(table);
      block.appendChild(wrap);
      mysqlTablesContainer.appendChild(block);
    });

    if (selectedMap && statsEl) {
      MysqlSchema.updateStatsEl(selectedMap, mysqlState, statsEl);
    }
  },

  buildMysqlColumnSql(row) {
    let typePart = row.mysqlType;
    const needsParen =
      MysqlSchema.typeNeedsSizeField(row.mysqlType) && row.size && String(row.size).trim().length > 0;
    if (needsParen) {
      typePart += `(${row.size.trim()})`;
    }
    const nullPart = row.nullable ? "NULL" : "NOT NULL";
    const col = MysqlSchema.sanitizeMysqlIdentifier(row.columnName || "col");
    return `\`${col}\` ${typePart} ${nullPart}`;
  },

  uniquifyColumnNames(rows) {
    const used = new Map();
    return rows.map((row) => {
      let base = MysqlSchema.sanitizeMysqlIdentifier(row.columnName || "col");
      let candidate = base;
      let n = 2;
      while (used.has(candidate)) {
        candidate = `${base}_${n}`;
        n += 1;
      }
      used.set(candidate, true);
      return { ...row, columnName: candidate };
    });
  },

  generateSql(mysqlState, mysqlOutput, includeIdColumn) {
    const collections = Object.keys(mysqlState);
    if (!collections.length) {
      mysqlOutput.value =
        "-- Nada para gerar. Adicione colunas na grade ou sincronize com a selecao.";
      return;
    }

    const parts = [];
    const addId = includeIdColumn;

    collections.sort((a, b) => a.localeCompare(b, "pt-BR")).forEach((collection) => {
      const tableName = MysqlSchema.sanitizeMysqlIdentifier(collection);
      const rows = MysqlSchema.uniquifyColumnNames(mysqlState[collection].map((r) => ({ ...r })));
      const colLines = [];
      if (addId) {
        colLines.push("  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT");
      }
      rows.forEach((row) => {
        colLines.push(`  ${MysqlSchema.buildMysqlColumnSql(row)}`);
      });
      MysqlSchema.STANDARD_TABLE_COLUMNS_SQL.forEach((line) => {
        colLines.push(line);
      });
      if (addId) {
        colLines.push("  PRIMARY KEY (`id`)");
      }

      const createSql = [
        `CREATE TABLE \`${tableName}\` (`,
        colLines.join(",\n"),
        `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
        "",
      ].join("\n");
      parts.push(createSql);
    });

    mysqlOutput.value = parts.join("\n").trim();
  },
};
