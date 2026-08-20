const labels = {
  done: "done",
  closed: "closed",
  in_progress: "in progress",
  partial: "partial",
  open: "open",
  blocked: "blocked",
  founder: "founder",
  na: "n/a",
};

function mark(status) {
  return `<span class="mark">${labels[status] ?? status}</span>`;
}

function hours(minutes) {
  const value = Math.max(0, Math.round(minutes));
  const h = Math.floor(value / 60);
  const m = value % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function when(minutes, timezone) {
  const date = new Date(Date.now() + Math.max(0, minutes) * 60_000);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  }).format(date);
}

function calibrationRatio(data) {
  const rows = data.timeLog.filter((row) => row.kind === "engineering");
  const first = rows.reduce((total, row) => total + row.firstEstimateMinutes, 0);
  const actual = rows.reduce((total, row) => total + row.actualMinutes, 0);
  if (first === 0) return 1;
  return actual / first;
}

function remainingOf(item, ratio) {
  if (item.status === "done" || item.status === "closed" || item.status === "na") return 0;
  const first = item.firstEstimateMinutes ?? 0;
  if (item.kind === "engineering") return first * ratio;
  return first;
}

function summarize(data) {
  const ratio = calibrationRatio(data);
  const items = data.phases.flatMap((phase) =>
    phase.items.map((item) => ({ ...item, phaseId: phase.id })));
  const remaining = (predicate) => items
    .filter((item) => !item.postLaunch)
    .filter(predicate)
    .reduce((total, item) => total + remainingOf(item, ratio), 0);
  const engineering = remaining((item) => item.kind === "engineering");
  const founder = remaining((item) => item.kind === "founder");
  const external = remaining((item) => item.kind === "external");
  const total = engineering + founder + external;
  const done = items.filter((i) => i.status === "done" || i.status === "closed").length;
  const blocked = items.filter((i) => i.status === "blocked").length;
  const spentActual = data.timeLog.reduce((t, row) => t + row.actualMinutes, 0);
  const spentEstimate = data.timeLog.reduce((t, row) => t + row.firstEstimateMinutes, 0);
  return { ratio, engineering, founder, external, total, done, blocked,
    count: items.length, spentActual, spentEstimate };
}

function itemLine(item, ratio) {
  const first = item.firstEstimateMinutes ?? 0;
  const time = item.status === "done" || item.status === "closed"
    ? `est ${hours(first)} · actual ${hours(item.actualMinutes ?? 0)}`
    : item.kind === "engineering"
      ? `est ${hours(first)} · now ${hours(remainingOf(item, ratio))}`
      : `${item.kind} ${hours(first)}`;
  const note = item.notes || item.blockers
    ? `<p class="note">${[item.blockers ? `Blocked: ${item.blockers}` : "", item.notes ?? ""].filter(Boolean).join(" · ")}</p>`
    : "";
  const tid = item.id ? `<b class="tid">${item.id}</b> ` : "";
  return `<li class="${item.status}">${mark(item.status)}<span class="who">${item.owner}</span><span>${tid}${item.text}</span><span class="time">${time}</span>${note}</li>`;
}

function phaseRemaining(phase, ratio) {
  return phase.items.reduce((total, item) => total + remainingOf(item, ratio), 0);
}

async function render() {
  const data = await fetch("./progress.json", { cache: "no-store" }).then((r) => r.json());
  const summary = summarize(data);
  const zone = data.timezone || "Asia/Kolkata";

  document.getElementById("subtitle").textContent = data.subtitle;
  document.getElementById("updated").textContent = data.updatedAt;
  document.getElementById("reference").href = data.referenceUi;
  document.getElementById("reference").textContent = data.referenceLabel || data.referenceUi.replace("https://", "");
  document.getElementById("api").href = data.api;
  document.getElementById("api").textContent = data.api.replace("https://", "");

  document.getElementById("total-clock").textContent = hours(summary.total);
  document.getElementById("total-eta").textContent =
    `If founder inputs and other agents arrive as work reaches them: ${when(summary.total, zone)}. External waits overlap engineering, so the wall-clock is usually better than this sum.`;
  document.getElementById("eng-clock").textContent = hours(summary.engineering);
  document.getElementById("eng-note").textContent =
    `Calibration factor ${summary.ratio.toFixed(2)} from this session's completed engineering tasks.`;
  document.getElementById("wait-clock").textContent = hours(summary.founder + summary.external);
  document.getElementById("wait-note").textContent =
    `Founder ${hours(summary.founder)} · external ${hours(summary.external)} (Vercel, DNS, Casa production URL; overlaps engineering). Post-launch items excluded.`;

  document.getElementById("learn").innerHTML =
    `<p><strong>Calibration:</strong> ${data.calibration.note} Closed engineering: first estimate ${hours(summary.spentEstimate)}, actual ${hours(summary.spentActual)}.</p>`;
  document.getElementById("safety").innerHTML =
    `<p><strong>Safety:</strong> ${data.safety.note}</p>`;

  document.getElementById("task-count").textContent = `${summary.done}/${summary.count}`;
  document.getElementById("blocked-count").textContent = `${summary.blocked}`;
  document.getElementById("spent-count").textContent =
    `${hours(summary.spentActual)} / ${hours(summary.spentEstimate)}`;
  document.getElementById("now-label").textContent = data.current.label;
  document.getElementById("now-detail").textContent = data.current.detail;

  const FINISHED = new Set(["done", "closed", "na"]);
  const allItems = data.phases.flatMap((phase) =>
    phase.items.map((item) => ({ ...item, phaseId: phase.id, phaseTitle: phase.title })));

  const nowCard = (item) => `
    <li class="${item.status}">
      <strong>${item.phaseId}${item.id ? " · " + item.id : ""}</strong>
      <span class="who">${item.owner}</span>
      <p>${item.text}</p>
      ${item.blockers ? `<p class="note">Blocked: ${item.blockers}</p>` : ""}
      ${item.notes ? `<p class="note">${item.notes}</p>` : ""}
    </li>`;
  const running = allItems.filter((item) => item.status === "in_progress");
  const waiting = allItems.filter((item) => item.status === "blocked");
  document.getElementById("now-items").innerHTML = running.length
    ? running.map(nowCard).join("")
    : `<li class="in_progress">
        <strong>NOW</strong>
        <span class="who">current</span>
        <p>${data.current.label}</p>
        <p class="note">${data.current.detail}</p>
      </li>`;
  document.getElementById("blocked-items").innerHTML = waiting.length
    ? waiting.map(nowCard).join("")
    : `<li class="done"><p>Nothing blocked.</p></li>`;

  document.getElementById("phases").innerHTML = data.phases.map((phase) => {
    const left = phaseRemaining(phase, summary.ratio);
    const active = phase.items.filter((item) => !FINISHED.has(item.status));
    const finished = phase.items.filter((item) => FINISHED.has(item.status));
    const activeBlock = active.length
      ? `<ul>${active.map((item) => itemLine(item, summary.ratio)).join("")}</ul>`
      : `<p class="alldone">Every task in this phase is complete.</p>`;
    const estSum = finished.reduce((t, i) => t + (i.firstEstimateMinutes ?? 0), 0);
    const actSum = finished.reduce((t, i) => t + (i.actualMinutes ?? 0), 0);
    const delta = actSum - estSum;
    const deltaStr = `${delta > 0 ? "+" : "-"}${hours(Math.abs(delta))}`;
    const totalsRow = `<li class="totals"><span class="mark">total</span><span class="who"></span><span>${finished.length} completed task${finished.length === 1 ? "" : "s"}</span><span class="time">est ${hours(estSum)} · actual ${hours(actSum)} · ${deltaStr}</span></li>`;
    const finishedBlock = finished.length
      ? `<details class="finished"><summary>${finished.length} completed · est ${hours(estSum)} · actual ${hours(actSum)} · ${deltaStr} — show</summary>
           <ul>${totalsRow}${finished.map((item) => itemLine(item, summary.ratio)).join("")}</ul>
         </details>`
      : "";
    return `
    <li class="${phase.status}">
      <h3>${mark(phase.status)}${phase.id}. ${phase.title}</h3>
      <p class="owner">${phase.owner}</p>
      <p class="eta">First estimate ${hours(phase.items.reduce((t, i) => t + (i.firstEstimateMinutes ?? 0), 0))} · remaining now ${hours(left)}</p>
      ${activeBlock}
      ${finishedBlock}
    </li>`;
  }).join("");

  const logEst = data.timeLog.reduce((t, row) => t + row.firstEstimateMinutes, 0);
  const logAct = data.timeLog.reduce((t, row) => t + row.actualMinutes, 0);
  const logDelta = logAct - logEst;
  const totalRow = `<tr class="totalrow">
    <td>Total (${data.timeLog.length} tasks)</td>
    <td></td>
    <td></td>
    <td>${hours(logEst)}</td>
    <td>${hours(logAct)}</td>
    <td class="${logDelta > 0 ? "over" : "under"}">${logDelta > 0 ? "+" : "-"}${hours(Math.abs(logDelta))}</td>
    <td>Calibration factor ${summary.ratio.toFixed(2)}</td>
  </tr>`;
  document.getElementById("log").innerHTML = `
    <thead><tr><th>Task</th><th>Kind</th><th>Done at (IST)</th><th>First est</th><th>Actual</th><th>Delta</th><th>Lesson</th></tr></thead>
    <tbody>${totalRow}${data.timeLog.map((row) => {
      const delta = row.actualMinutes - row.firstEstimateMinutes;
      const over = delta > 0;
      return `<tr>
        <td>${row.task}</td>
        <td>${row.kind}</td>
        <td class="doneat">${row.completedAt ?? "—"}</td>
        <td>${hours(row.firstEstimateMinutes)}</td>
        <td>${hours(row.actualMinutes)}</td>
        <td class="${over ? "over" : "under"}">${over ? "+" : "-"}${hours(Math.abs(delta))}</td>
        <td>${row.lesson}</td>
      </tr>`;
    }).join("")}</tbody>`;

  document.getElementById("founder").innerHTML =
    data.founderAsks.map((item) =>
      `<li class="${item.status}">${item.text}<div class="eta">${labels[item.status] ?? item.status}. Blocks: ${item.blocks}</div></li>`).join("");
  document.getElementById("criteria").innerHTML =
    data.doneCriteria.map((text) => `<li>${text}</li>`).join("");
  document.getElementById("live").innerHTML =
    data.live.map((row) => `<div><dt>${row.label}</dt><dd>${row.value}</dd></div>`).join("");
}

render().catch((error) => {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<p class="safety">Failed to load progress.json: ${error.message}</p>`,
  );
});

setInterval(() => { render().catch(() => {}); }, 30_000);
