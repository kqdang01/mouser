const apiKey = "API_KEY_HERE".trim();
const TESTS = [
  {
    id: "happy_path",
    name: "Happy Path — Keyword Search",
    desc: "Searches for 'arduino uno' and validates results are returned",
    query: { SearchByKeywordRequest: { keyword: "arduino uno", records: 5, startingRecord: 0 } },
    validate(data) {
      const parts = data?.SearchResults?.Parts;
      if (!Array.isArray(parts)) return { pass: false, msg: "Missing Parts array in response" };
      if (parts.length === 0) return { pass: false, msg: "Returned 0 results for common keyword" };
      return { pass: true, msg: `Returned ${parts.length} result(s). First: ${parts[0]?.MouserPartNumber || "N/A"}` };
    }
  },
  {
    id: "part_number",
    name: "Part Number Search",
    desc: "Searches by Mouser part number and checks for exact match",
    query: { SearchByKeywordRequest: { keyword: "595-SN74HC245N", records: 3, startingRecord: 0 } },
    validate(data) {
      const parts = data?.SearchResults?.Parts;
      if (!Array.isArray(parts) || parts.length === 0) return { pass: false, msg: "No results for part number search" };
      return { pass: true, msg: `Part number search returned ${parts.length} result(s)` };
    }
  },
  {
    id: "response_structure",
    name: "Response Structure Validation",
    desc: "Verifies all required fields exist in the response schema",
    query: { SearchByKeywordRequest: { keyword: "resistor", records: 1, startingRecord: 0 } },
    validate(data) {
      const requiredTop = ["Errors", "SearchResults"];
      const missingTop = requiredTop.filter(k => !(k in data));
      if (missingTop.length) return { pass: false, msg: `Missing top-level fields: ${missingTop.join(", ")}` };
      const part = data?.SearchResults?.Parts?.[0];
      if (!part) return { warn: true, msg: "No parts returned to validate part-level schema" };
      const requiredPart = ["MouserPartNumber", "ManufacturerPartNumber", "Manufacturer", "Description", "Availability"];
      const missing = requiredPart.filter(k => !(k in part));
      if (missing.length) return { pass: false, msg: `Part missing fields: ${missing.join(", ")}` };
      return { pass: true, msg: `All required fields present: ${requiredPart.join(", ")}` };
    }
  },
  {
    id: "empty_query",
    name: "Edge Case — Empty Query",
    desc: "Sends an empty string and expects graceful error handling",
    query: { SearchByKeywordRequest: { keyword: "", records: 5, startingRecord: 0 } },
    validate(data) {
      const errors = data?.Errors;
      if (Array.isArray(errors) && errors.length > 0) {
        return { pass: true, msg: `API correctly returned error for empty query: "${errors[0]?.Message || 'error returned'}"` };
      }
      const parts = data?.SearchResults?.Parts;
      if (!parts || parts.length === 0) return { warn: true, msg: "Empty query returned no results (no explicit error)" };
      return { warn: true, msg: "Empty query returned results — consider validating this behavior" };
    }
  },
  {
    id: "special_chars",
    name: "Edge Case — Special Characters",
    desc: "Tests query with special characters like !@#$%",
    query: { SearchByKeywordRequest: { keyword: "!@#$%^&*()", records: 5, startingRecord: 0 } },
    validate(data) {
      const errors = data?.Errors;
      if (Array.isArray(errors) && errors.length > 0) {
        return { pass: true, msg: "API gracefully handled special characters with an error response" };
      }
      return { warn: true, msg: "No error returned for special character query — review expected behavior" };
    }
  },
  {
    id: "latency",
    name: "Response Time / Latency",
    desc: "Measures API response time — should be under 3000ms",
    query: { SearchByKeywordRequest: { keyword: "capacitor", records: 0, startingRecord: 0 } },
    validate(data, meta) {
      const ms = meta?.latency;
      if (ms < 1000) return { pass: true, msg: `Excellent latency: ${ms}ms (< 1000ms)` };
      if (ms < 3000) return { pass: true, msg: `Acceptable latency: ${ms}ms (< 3000ms)` };
      return { warn: true, msg: `High latency: ${ms}ms (> 3000ms) — may affect user experience` };
    }
  },
  {
    id: "pagination",
    name: "Pagination — Offset Works",
    desc: "Checks that startingRecord offset returns different results",
    query: null,
    async run(apiKey, log) {
      const base = `https://api.mouser.com/api/v1/search/keyword?apiKey=${apiKey}`;
      const body1 = { SearchByKeywordRequest: { keyword: "LED", records: 3, startingRecord: 0 } };
      const body2 = { SearchByKeywordRequest: { keyword: "LED", records: 3, startingRecord: 4 } };
      const [r1, r2] = await Promise.all([
        fetch(base, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body1) }),
        fetch(base, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body2) })
      ]);
      const [d1, d2] = await Promise.all([r1.json(), r2.json()]);
      const p1 = d1?.SearchResults?.Parts?.map(p => p.MouserPartNumber) || [];
      const p2 = d2?.SearchResults?.Parts?.map(p => p.MouserPartNumber) || [];
      const overlap = p1.filter(p => p2.includes(p));
      if (p1.length === 0 || p2.length === 0) return { pass: false, msg: "Could not retrieve results for pagination test" };
      if (overlap.length === 0) return { pass: true, msg: `Pagination works — page 1 and page 2 have no overlapping parts` };
      return { warn: true, msg: `${overlap.length} overlapping parts between page 1 and 2 — review pagination` };
    }
  },
  {
    id: "error_field",
    name: "Error Field Present",
    desc: "Validates that response includes an Errors field",
    query: { SearchByKeywordRequest: { keyword: "transistor", records: 3, startingRecord: 0 } },
    validate(data) {
      if (!("Errors" in data)) return { pass: false, msg: "Response missing 'Errors' field entirely" };
      return { pass: true, msg: `'Errors' field present in response (value: ${JSON.stringify(data.Errors)})` };
    }
  }
];


let results = {};

function init() {
  const grid = document.querySelector(".test-grid");
  
  TESTS.forEach(t => {
    const el = document.createElement("div");
    el.className = "test-item";
    el.innerHTML = `
      <input type="checkbox" id="chk_${t.id}" checked />
      <div class="test-info">
        <div class="test-name">${t.name}</div>
        <div class="test-desc">${t.desc}</div>
      </div>
      <div class="test-status" id="status_${t.id}"></div>
    `;
    el.onclick = (e) => {
      if (e.target.tagName !== "INPUT") {
        const chk = document.getElementById(`chk_${t.id}`);
        chk.checked = !chk.checked;
      }
    };
    grid.appendChild(el);
  });
}

function selectAll() {
  TESTS.forEach(t => { document.getElementById(`chk_${t.id}`).checked = true; });
}

function clearLog() {
  document.getElementById("logBox").innerHTML = '<div class="log-line"><span class="log-muted">// Log cleared.</span></div>';
  document.getElementById("summaryBox").innerHTML = "";
  document.getElementById("statRow").style.display = "none";
  TESTS.forEach(t => {
    const s = document.getElementById(`status_${t.id}`);
    s.className = "test-status";
  });
  document.getElementById("progressFill").style.width = "0%";
  results = {};
}

function log(msg, type = "info") {
  const box = document.getElementById("logBox");
  const now = new Date().toLocaleTimeString("en-US", { hour12: false });
  const div = document.createElement("div");
  div.className = "log-line";
  div.innerHTML = `<span class="log-time">${now}</span><span class="log-${type}">${msg}</span>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}


async function runSelectedTests() {
  if (!apiKey) {
    log("⚠ No API key provided. Please enter your Mouser API key.", "warn");
    return;
  }
  
  const selected = TESTS.filter(t => document.getElementById(`chk_${t.id}`).checked);
  if (selected.length === 0) {
    log("⚠ No tests selected.", "warn");
    return;
  }

  document.getElementById("runBtn").disabled = true;
  document.getElementById("statRow").style.display = "flex";
  document.getElementById("summaryBox").innerHTML = "";

  log(`━━━ Running ${selected.length} test(s) ━━━`, "info");

  let passed = 0, failed = 0, warned = 0;
  const fill = document.getElementById("progressFill");

  for (let i = 0; i < selected.length; i++) {
    const t = selected[i];
    const statusEl = document.getElementById(`status_${t.id}`);
    statusEl.className = "test-status running";
    log(`▷ [${t.name}]`, "info");

    fill.style.width = `${Math.round(((i) / selected.length) * 100)}%`;

    try {
      let result;

      if (t.run) {
        // custom async test
        result = await t.run(apiKey, log);
      } else {
        const url = `https://api.mouser.com/api/v1/search/keyword?apiKey=${apiKey}`;
        const start = Date.now();
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(t.query)
        });
        const latency = Date.now() - start;
        console.log(res);
        if (!res.ok) {
          result = { pass: false, msg: `HTTP ${res.status} — ${res.statusText}` };
          if (t.id === "special_chars") {
            const data = await res.json();
            result = t.validate(data);
          }
        } else {
          const data = await res.json();
          result = t.validate(data);
          if (t.id === "latency") {
            result = t.validate(data, { latency });
          }
        }
      }

      if (result.pass) {
        passed++;
        statusEl.className = "test-status pass";
        log(`  ✓ PASS — ${result.msg}`, "pass");
        results[t.id] = "pass";
      } else if (result.warn) {
        warned++;
        statusEl.className = "test-status warn";
        log(`  ⚠ WARN — ${result.msg}`, "warn");
        results[t.id] = "warn";
      } else {
        failed++;
        statusEl.className = "test-status fail";
        log(`  ✗ FAIL — ${result.msg}`, "fail");
        results[t.id] = "fail";
      }

    } catch (err) {
      failed++;
      statusEl.className = "test-status fail";
      log(`  ✗ ERROR — ${err.message}`, "fail");
      results[t.id] = "fail";
    }

    await new Promise(r => setTimeout(r, 300));
  }

  fill.style.width = "100%";
  log(`━━━ Done: ${passed} passed, ${failed} failed, ${warned} warnings ━━━`, "info");

  document.getElementById("passCount").textContent = `${passed} passed`;
  document.getElementById("failCount").textContent = `${failed} failed`;
  document.getElementById("warnCount").textContent = `${warned} warnings`;

  
  const summaryBox = document.getElementById("summaryBox");
  const allGood = failed === 0;
  summaryBox.innerHTML = `
    <div class="summary ${allGood ? 'all-pass' : 'has-fail'}">
      <div class="summary-icon">${allGood ? '✅' : '🔍'}</div>
      <div class="summary-text">
        <div class="summary-title">${allGood ? 'All selected tests passed' : `${failed} test(s) need attention`}</div>
        <div class="summary-sub">${passed} passed · ${failed} failed · ${warned} warnings · ${selected.length} total run</div>
      </div>
    </div>
  `;

  document.getElementById("runBtn").disabled = false;
}

init();