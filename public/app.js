// Front end: pick a task, see the price, pay the invoice, get the result.
// All server and AI text is inserted with textContent, never as HTML.

const $ = (id) => document.getElementById(id);
const state = { task: "summarise", jobId: null, pollTimer: null, priceTimer: null, maxChars: 20000 };

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function currentRequest() {
  const text = $("text").value;
  return state.task === "summarise"
    ? { task: "summarise", text, length: $("length").value }
    : { task: "translate", text, targetLanguage: $("language").value };
}

function show(section) {
  for (const id of ["order", "invoice", "result"]) $(id).hidden = id !== section;
}

function setError(message) {
  $("order-error").textContent = message || "";
  $("order-error").hidden = !message;
}

// Price preview, debounced so typing doesn't flood the server.
function refreshPrice() {
  clearTimeout(state.priceTimer);
  const text = $("text").value;
  $("count").textContent = text.length.toLocaleString();
  const valid = text.trim() !== "" && text.length <= state.maxChars;
  $("submit").disabled = !valid;
  if (!valid) {
    $("price").textContent = text.length > state.maxChars ? "Too long" : "–";
    return;
  }
  state.priceTimer = setTimeout(async () => {
    try {
      const { amountSats } = await api("/api/price", currentRequest());
      $("price").textContent = `${amountSats.toLocaleString()} sats`;
    } catch {
      $("price").textContent = "–";
    }
  }, 400);
}

function selectTask(task) {
  state.task = task;
  for (const tab of document.querySelectorAll(".tab")) {
    tab.setAttribute("aria-selected", String(tab.dataset.task === task));
  }
  for (const el of document.querySelectorAll("[data-for]")) el.hidden = el.dataset.for !== task;
  refreshPrice();
}

async function submit() {
  setError("");
  $("submit").disabled = true;
  try {
    const job = await api("/api/jobs", currentRequest());
    showInvoice(job);
    history.replaceState(null, "", `#job=${job.id}`);
    startPolling(job.id);
  } catch (err) {
    setError(err.message);
  } finally {
    $("submit").disabled = false;
  }
}

function showInvoice(job) {
  state.jobId = job.id;
  $("amount").textContent = job.amountSats.toLocaleString();
  if (job.qr) $("qr").src = job.qr;
  $("qr").hidden = !job.qr;
  $("wallet-link").href = `lightning:${job.bolt11}`;
  $("copy-invoice").onclick = () => copy(job.bolt11, $("copy-invoice"));
  setStatus("Waiting for payment…");
  show("invoice");
}

function setStatus(text, kind) {
  $("status").textContent = text;
  $("status").className = `status${kind ? ` ${kind}` : ""}`;
}

function startPolling(id) {
  stopPolling();
  const tick = async () => {
    try {
      const job = await api(`/api/jobs/${id}`);
      if (render(job)) return; // finished
    } catch (err) {
      setStatus(err.message, "error");
      return;
    }
    state.pollTimer = setTimeout(tick, 2000);
  };
  tick();
}

function stopPolling() {
  clearTimeout(state.pollTimer);
}

/** Updates the page for a job; returns true once there's nothing left to wait for. */
function render(job) {
  switch (job.status) {
    case "awaiting_payment": {
      const secs = Math.max(0, Math.round((job.expiresAt - Date.now()) / 1000));
      setStatus(`Waiting for payment… (invoice expires in ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")})`);
      return false;
    }
    case "processing":
      setStatus("Paid ✓ Working on it…", "ok");
      return false;
    case "done":
      $("result-text").textContent = job.result;
      $("truncated").hidden = !job.truncated;
      show("result");
      return true;
    case "expired":
      setStatus("The invoice expired before payment. Start over to get a new one.", "error");
      return true;
    case "failed":
      setStatus(job.error, "error");
      return true;
  }
  return true;
}

async function copy(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const label = button.textContent;
    button.textContent = "Copied ✓";
    setTimeout(() => (button.textContent = label), 1500);
  } catch {
    window.prompt("Copy this:", text);
  }
}

function reset() {
  stopPolling();
  state.jobId = null;
  history.replaceState(null, "", location.pathname);
  show("order");
  refreshPrice();
}

async function init() {
  const opts = await api("/api/options");
  state.maxChars = opts.maxInputChars;
  $("max").textContent = opts.maxInputChars.toLocaleString();
  $("text").maxLength = opts.maxInputChars;
  for (const lang of opts.languages) $("language").append(new Option(lang, lang));
  $("mock-pay").hidden = !opts.mockPayments;

  for (const tab of document.querySelectorAll(".tab")) tab.onclick = () => selectTask(tab.dataset.task);
  $("text").oninput = refreshPrice;
  $("length").onchange = refreshPrice;
  $("language").onchange = refreshPrice;
  $("submit").onclick = submit;
  $("cancel").onclick = reset;
  $("again").onclick = () => { $("text").value = ""; reset(); };
  $("copy-result").onclick = () => copy($("result-text").textContent, $("copy-result"));
  $("mock-pay").onclick = () => api(`/api/dev/pay/${state.jobId}`, {}).catch((e) => setStatus(e.message, "error"));

  // Reloading the page (or coming back from the wallet app) resumes the job.
  const resumeId = new URLSearchParams(location.hash.slice(1)).get("job");
  if (resumeId) {
    try {
      const job = await api(`/api/jobs/${resumeId}`);
      showInvoice(job);
      if (!render(job)) startPolling(job.id);
      return;
    } catch {
      history.replaceState(null, "", location.pathname);
    }
  }
  refreshPrice();
}

init().catch((err) => setError(`Couldn't load: ${err.message}`));
