package agent

import "fmt"

func renderGUIPage(csrfToken string) string {
	return fmt.Sprintf(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Bore GUI</title>
  <style>
    :root { color-scheme: dark; --bg:#0a0f1a; --panel:#101828; --line:#233148; --text:#e6eefc; --muted:#99a7bf; --accent:#58a6ff; --danger:#ff7b72; }
    * { box-sizing:border-box; }
    body { margin:0; font:14px/1.5 ui-sans-serif,system-ui,sans-serif; background:radial-gradient(circle at top,#15223a,transparent 30%%),var(--bg); color:var(--text); }
    main { max-width:1100px; margin:0 auto; padding:24px; display:grid; gap:16px; }
    section { background:rgba(16,24,40,.92); border:1px solid var(--line); border-radius:18px; padding:18px; }
    h1,h2 { margin:0 0 10px; }
    p { margin:0; color:var(--muted); }
    .row,.actions,.toggles,.form-row { display:flex; gap:12px; flex-wrap:wrap; align-items:center; }
    .row > div { flex:1 1 220px; }
    .actions { margin-top:14px; }
    .toggles { margin-top:12px; }
    label { display:grid; gap:6px; color:var(--muted); }
    input,select { width:100%%; border:1px solid var(--line); border-radius:12px; background:#0b1220; color:var(--text); padding:10px 12px; }
    button, a.button { border:0; border-radius:999px; background:var(--accent); color:#08111f; padding:10px 14px; font-weight:700; cursor:pointer; text-decoration:none; display:inline-flex; align-items:center; }
    button.secondary { background:#172235; color:var(--text); border:1px solid var(--line); }
    button.danger { background:var(--danger); color:#240b0a; }
    table { width:100%%; border-collapse:collapse; }
    th,td { text-align:left; padding:10px 0; border-bottom:1px solid rgba(255,255,255,.08); vertical-align:top; }
    th { color:var(--muted); font-weight:600; }
    .stack { display:grid; gap:10px; }
    .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:4px 10px; color:var(--muted); }
    .alert { display:none; padding:12px 14px; border-radius:14px; border:1px solid var(--line); }
    .alert.show { display:block; }
    .alert.error { border-color:#6e2f2f; background:rgba(110,47,47,.22); color:#ffd7d4; }
    .alert.ok { border-color:#244d2d; background:rgba(36,77,45,.22); color:#d8ffe0; }
    .muted { color:var(--muted); }
    .mono { font-family:ui-monospace,SFMono-Regular,monospace; }
    ul { margin:10px 0 0; padding-left:18px; color:var(--muted); }
  </style>
</head>
<body>
  <main>
    <section class="stack">
      <div class="row">
        <div>
          <h1>Bore GUI</h1>
          <p>Local-only control panel for the Bore agent.</p>
        </div>
        <div class="mono muted" id="local-url"></div>
      </div>
      <div id="alert" class="alert"></div>
      <div class="row" id="summary"></div>
      <div class="actions">
        <button id="refresh">Refresh</button>
        <button id="login" class="secondary">Sign In</button>
        <button id="signout" class="secondary">Sign Out</button>
        <button id="close" class="danger">Close GUI</button>
      </div>
      <div class="toggles">
        <label><span>Start Bore agent when the computer starts</span><input id="agent-autostart" type="checkbox"></label>
        <label><span>Start Bore GUI when the computer starts</span><input id="gui-autostart" type="checkbox"></label>
      </div>
    </section>

    <section class="stack">
      <div>
        <h2>Add Or Reassign Tunnel</h2>
        <p>Choose an available reserved namespace or let Bore generate a new one.</p>
      </div>
      <form id="tunnel-form" class="form-row">
        <label><span>Local Port</span><input id="local-port" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off" required></label>
        <label><span>Preferred Namespace</span><select id="namespace"></select></label>
        <button type="submit">Save Tunnel</button>
      </form>
    </section>

    <section class="stack">
      <div><h2>Local Tunnels</h2><p>Only the tunnels claimed by this machine are shown here.</p></div>
      <div id="tunnels"></div>
    </section>

    <section class="stack">
      <div><h2>Namespaces</h2><p>Reserved namespaces for this account, including child hosts and claims.</p></div>
      <div id="namespaces"></div>
    </section>
  </main>

  <script>
    const csrf = %q;
    const alertBox = document.getElementById("alert");
    let currentState = null;

    async function api(path, body) {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Bore-GUI-Token": csrf },
        body: JSON.stringify(body ?? {}),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Request failed");
      return payload;
    }

    function showAlert(message, kind) {
      alertBox.textContent = message;
      alertBox.className = "alert show " + kind;
    }

    function clearAlert() {
      alertBox.className = "alert";
      alertBox.textContent = "";
    }

    function button(label, className, onclick) {
      const el = document.createElement("button");
      el.type = "button";
      el.textContent = label;
      el.className = className || "secondary";
      el.onclick = onclick;
      return el;
    }

    function limitPortInput(input) {
      input.value = input.value.replace(/\D/g, "").slice(0, 5);
    }

    function isActiveElsewhere(namespace, state) {
      return namespace.claims.some((claim) => claim.deviceId !== state.deviceId && claim.status === "active");
    }

    function isClaimedByOtherLocalPort(namespace, state, localPort) {
      return namespace.claims.some((claim) => (
        claim.deviceId === state.deviceId && (!localPort || claim.localPort !== localPort)
      ));
    }

    function availableNamespaces(state, localPort) {
      return state.namespaces
        .filter((namespace) => !isActiveElsewhere(namespace, state))
        .filter((namespace) => !isClaimedByOtherLocalPort(namespace, state, localPort))
        .map((namespace) => namespace.subdomain)
        .sort((left, right) => left.localeCompare(right));
    }

    function renderNamespaceChoices(state) {
      const select = document.getElementById("namespace");
      const previous = select.value;
      const localPort = Number(document.getElementById("local-port").value);
      const reusable = availableNamespaces(state, localPort).map((subdomain) => [subdomain, subdomain]);
      const options = state.remainingNamespaceSlots > 0
        ? [["", "Generate a new namespace"]].concat(reusable)
        : reusable;

      if (!options.length) {
        options.push(["__unavailable", "No namespaces available"]);
      }

      select.replaceChildren(...options.map(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.disabled = value === "__unavailable";
        return option;
      }));
      select.value = options.some(([value]) => value === previous) ? previous : options[0][0];
      select.disabled = options.length === 1 && options[0][0] === "__unavailable";
    }

    function renderSummary(state) {
      document.getElementById("local-url").textContent = state.browserUrl;
      document.getElementById("agent-autostart").checked = state.agentAutostart;
      document.getElementById("gui-autostart").checked = state.guiAutostart;
      document.getElementById("login").style.display = state.signedIn ? "none" : "inline-flex";
      document.getElementById("signout").style.display = state.signedIn ? "inline-flex" : "none";

      const summary = document.getElementById("summary");
      summary.innerHTML = "";
      [
        ["Signed in", state.signedIn ? (state.userEmail || "yes") : "no"],
        ["Daemon", state.daemonRunning ? "running" : "stopped"],
        ["Server", state.serverOrigin],
        ["Device", state.deviceName],
      ].forEach(([label, value]) => {
        const card = document.createElement("div");
        card.innerHTML = "<div class='pill'>" + label + "</div><div style='margin-top:8px'>" + value + "</div>";
        summary.appendChild(card);
      });

      if (state.lastError) showAlert(state.lastError, "error");
      else if (state.remoteError) showAlert(state.remoteError, "error");
      else clearAlert();
    }

    function renderTunnels(state) {
      const root = document.getElementById("tunnels");
      if (!state.localTunnels.length) {
        root.innerHTML = "<p class='muted'>No local tunnels configured.</p>";
        return;
      }

      const table = document.createElement("table");
      table.innerHTML = "<thead><tr><th>Status</th><th>Port</th><th>Namespace</th><th>URL</th><th></th></tr></thead>";
      const body = document.createElement("tbody");
      state.localTunnels.forEach((tunnel) => {
        const row = document.createElement("tr");
        const actions = document.createElement("td");
        actions.appendChild(button("Stop", "danger", async () => { await run(() => api("/api/tunnels/down", { localPort: tunnel.localPort }), "Stopped tunnel."); }));
        row.innerHTML = "<td>" + tunnel.status + "</td><td>localhost:" + tunnel.localPort + "</td><td>" + tunnel.subdomain + "</td><td><a class='button secondary' href='" + tunnel.publicUrl + "' target='_blank' rel='noreferrer'>" + tunnel.publicUrl + "</a></td>";
        row.appendChild(actions);
        body.appendChild(row);
      });
      table.appendChild(body);
      root.replaceChildren(table);
    }

    function renderNamespaces(state) {
      const root = document.getElementById("namespaces");
      if (!state.namespaces.length) {
        root.innerHTML = "<p class='muted'>No reserved namespaces yet.</p>";
        return;
      }

      const wrapper = document.createElement("div");
      wrapper.className = "stack";
      state.namespaces.forEach((namespace) => {
        const box = document.createElement("section");
        const hosts = namespace.accessHosts.length
          ? "<ul>" + namespace.accessHosts.map((item) => "<li>" + item.publicUrl + (item.localPortOverride ? " -> localhost:" + item.localPortOverride : "") + "</li>").join("") + "</ul>"
          : "<p class='muted'>No child hosts.</p>";
        const claims = namespace.claims.length
          ? "<ul>" + namespace.claims.map((item) => "<li>" + item.status + " on " + item.deviceName + " -> localhost:" + item.localPort + "</li>").join("") + "</ul>"
          : "<p class='muted'>No claims.</p>";
        box.innerHTML = "<div class='row'><div><strong>" + namespace.subdomain + "</strong><div class='muted'>" + namespace.publicUrl + "</div></div></div><div><h3>Child Hosts</h3>" + hosts + "</div><div><h3>Claims</h3>" + claims + "</div>";
        box.querySelector(".row").appendChild(button("Release", "danger", async () => {
          await run(() => api("/api/namespaces/release", { subdomain: namespace.subdomain }), "Released namespace " + namespace.subdomain + ".");
        }));
        wrapper.appendChild(box);
      });
      root.replaceChildren(wrapper);
    }

    async function refresh() {
      const response = await fetch("/api/state");
      const state = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(state.error || "Unable to load Bore GUI state");
      currentState = state;
      renderSummary(state);
      renderNamespaceChoices(state);
      renderTunnels(state);
      renderNamespaces(state);
    }

    async function run(action, success) {
      try {
        const state = await action();
        currentState = state;
        renderSummary(state);
        renderNamespaceChoices(state);
        renderTunnels(state);
        renderNamespaces(state);
        if (success) showAlert(success, "ok");
      } catch (error) {
        showAlert(error.message, "error");
      }
    }

    document.getElementById("refresh").onclick = () => run(() => api("/api/sync"), "State refreshed.");
    document.getElementById("login").onclick = () => run(() => api("/api/login"), "Signed in.");
    document.getElementById("signout").onclick = () => run(() => api("/api/sign-out"), "Signed out.");
    document.getElementById("close").onclick = async () => {
      try {
        await api("/api/close");
        showAlert("Bore GUI stopped. This tab will stop working.", "ok");
      } catch (error) {
        showAlert(error.message, "error");
      }
    };
    document.getElementById("agent-autostart").onchange = (event) => run(() => api("/api/autostart/agent", { enabled: event.target.checked }), "Updated Bore agent autostart.");
    document.getElementById("gui-autostart").onchange = (event) => run(() => api("/api/autostart/gui", { enabled: event.target.checked }), "Updated Bore GUI autostart.");
    document.getElementById("local-port").oninput = (event) => {
      limitPortInput(event.target);
      if (currentState) renderNamespaceChoices(currentState);
    };
    document.getElementById("tunnel-form").onsubmit = (event) => {
      event.preventDefault();
      const namespace = document.getElementById("namespace").value;
      if (namespace === "__unavailable") {
        showAlert("No namespace is available. Stop an active claim or release a namespace before saving.", "error");
        return;
      }
      run(() => api("/api/tunnels", {
        localPort: Number(document.getElementById("local-port").value),
        preferredSubdomain: namespace.trim(),
      }), "Tunnel updated.");
    };

    refresh().catch((error) => showAlert(error.message, "error"));
  </script>
</body>
</html>`, csrfToken)
}
