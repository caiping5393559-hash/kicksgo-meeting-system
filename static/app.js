const app = {
  user: null,
  person: null,
  data: null,
  publicRoles: [],
  storage: null,
  page: "dashboard",
};

const AGENCY_OPS_ROLE_ID = "role_us_agency_ops";

const pages = [
  ["dashboard", "周会首页"],
  ["meetings", "会议列表"],
  ["report", "美国代运营周报"],
  ["notes", "会前备注"],
  ["transcripts", "会议文字记录"],
  ["actions", "行动项"],
  ["admin", "管理员"],
];

const part2Agenda = [
  ["5分钟", "回顾上周会议纪要", "主持人", "上周行动项、负责人、完成情况、未完成原因。"],
  ["8分钟", "美国代运营内部评估", "你/老陈", "第一部分信息转成内部判断：人、货、流量、内容、价格、仓库。"],
  ["8分钟", "国内货品与采购", "国内采购/运营", "爆款SKU、缺货SKU、补货进度、价格优势、下周直播支持。"],
  ["8分钟", "美国仓库与履约", "美国仓库", "24h发货率、延迟、错发漏发、退件丢件、是否支持爆单。"],
  ["5分钟", "其他TikTok店铺与合作方", "Ken/诺诺", "自营其他店、合作方店铺、继续供货或暂停建议。"],
  ["3分钟", "技术与系统", "国际技术", "系统、数据上传、腾讯会议名称匹配、权限问题。"],
  ["3分钟", "本周决策与下周行动项", "你/老陈", "必须执行、待观察、暂停调整，每项明确负责人和截止日期。"],
];

const reportSections = [
  ["1. 本周经营总览", [
    ["total_gmv", "总GMV"], ["total_orders", "总订单量"], ["aov", "平均客单价"],
    ["trend", "本周趋势", "select", ["增长", "稳定", "下降"]],
    ["core_conclusion", "核心结论", "textarea"],
  ]],
  ["2. 直播表现", [
    ["live_count", "直播次数"], ["live_hours", "直播总时长"], ["live_gmv", "直播GMV"],
    ["live_orders", "直播订单量"], ["avg_viewers", "平均观看人数"], ["peak_viewers", "最高在线人数"],
    ["conversion_rate", "转化率"], ["issue_point", "问题点", "select", ["流量", "转化", "选品", "节奏", "其他"]],
    ["issue_other", "其他问题说明", "textarea"],
  ]],
  ["3. 非直播表现", [
    ["non_live_gmv", "非直播GMV"], ["non_live_orders", "非直播订单量"], ["short_video_pct", "短视频占比"],
    ["organic_pct", "自然流量占比"], ["search_pct", "搜索流量占比"],
    ["non_live_conclusion", "结论", "select", ["强", "中", "弱"]],
  ]],
  ["4. 内容与增长", [
    ["video_count", "本周视频数"], ["viral_video_count", "爆款视频数"], ["avg_views", "平均播放量"],
    ["stable_hit", "是否有稳定爆款", "select", ["是", "否"]],
    ["copyable", "是否可复制", "select", ["是", "否"]],
  ]],
  ["5. 店铺权重指标", [
    ["product_count", "橱窗商品数量"], ["positive_rate", "好评率"], ["dsr", "动态评分DSR"],
    ["store_conversion_rate", "转化率"], ["store_level", "店铺等级"],
    ["weight_status", "权重状态", "select", ["上升", "稳定", "下降"]],
  ]],
  ["6. 活动与流量", [
    ["campaign_applied", "报名活动数"], ["campaign_passed", "通过活动数"], ["campaign_gmv", "活动GMV"],
    ["campaign_effect", "活动效果", "select", ["高", "中", "低"]],
  ]],
  ["7. 供应链与运营问题", [
    ["out_of_stock_skus", "缺货SKU", "textarea"], ["shipment_delay", "发货延迟"], ["wrong_ship_rate", "错发率"],
    ["live_space_issue", "直播场地问题", "textarea"], ["host_issue", "主播问题", "textarea"],
  ]],
  ["8. 达人/联盟", [
    ["commission_sku_count", "佣金SKU数"], ["affiliate_gmv", "达人带货GMV"], ["contacted_creators", "主动建联人数"],
    ["partnered_creators", "合作达人数量"], ["top_creator", "Top达人表现", "textarea"],
  ]],
  ["9. 下周计划", [
    ["must_do", "必须执行", "textarea"], ["optimize_items", "优化项", "textarea"], ["pause_items", "暂停项", "textarea"],
  ]],
  ["10. 管理总结", [
    ["growth_driver", "增长驱动", "textarea"], ["biggest_bottleneck", "最大瓶颈", "textarea"], ["next_key_action", "下周关键动作", "textarea"],
  ]],
];

function qs(selector) {
  return document.querySelector(selector);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function api(path, options = {}) {
  const init = {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
  };
  if (options.body) init.body = JSON.stringify(options.body);
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `请求失败：${res.status}`);
  }
  return data;
}

function personName(id) {
  const person = (app.data?.people || []).find((p) => p.id === id);
  return person ? person.display_name || person.real_name || person.chinese_name || person.english_name || id : id || "";
}

function personById(id) {
  return (app.data?.people || []).find((p) => p.id === id) || null;
}

function businessRoleName(id) {
  const role = (app.data?.business_roles || []).find((r) => r.id === id);
  return role ? role.name || id : id || "";
}

function userBusinessRoleNames(user) {
  const names = (user?.business_role_ids || []).map(businessRoleName).filter(Boolean);
  return names.length ? names.join("、") : "未分配";
}

function hasBusinessRole(roleId, user = app.user) {
  return (user?.business_role_ids || []).includes(roleId);
}

function canViewAgencyReport() {
  return hasBusinessRole(AGENCY_OPS_ROLE_ID);
}

function userDisplayName(user) {
  return personName(user?.person_id) || user?.username || "";
}

function selectedValues(select) {
  return Array.from(select?.selectedOptions || []).map((option) => option.value).filter(Boolean);
}

function checkedValues(root, name) {
  return Array.from(root?.querySelectorAll(`input[name="${name}"]:checked`) || []).map((input) => input.value).filter(Boolean);
}

function upsertById(collection, item) {
  if (!item?.id) return;
  app.data[collection] = app.data[collection] || [];
  const index = app.data[collection].findIndex((entry) => entry.id === item.id);
  if (index >= 0) app.data[collection][index] = item;
  else app.data[collection].unshift(item);
}

function removeById(collection, id) {
  app.data[collection] = (app.data[collection] || []).filter((entry) => entry.id !== id);
}

function checkboxOptions(items, selected = [], name = "business_role_ids", emptyText = "暂无可选项") {
  const selectedSet = new Set(selected || []);
  if (!items.length) return `<span class="muted">${escapeHtml(emptyText)}</span>`;
  return items.map((item) => `
    <label class="check-row">
      <input type="checkbox" name="${escapeHtml(name)}" value="${escapeHtml(item.id)}" ${selectedSet.has(item.id) ? "checked" : ""} />
      <span>${escapeHtml(item.name || item.label || item.username || item.id)}</span>
    </label>
  `).join("");
}

function splitAliasValues(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/[,，\n\r]/);
  const values = [];
  raw.forEach((item) => {
    const text = String(item || "").trim();
    if (text && !values.includes(text)) values.push(text);
  });
  return values;
}

function aliasEditorValues(editor) {
  const hidden = editor?.querySelector('input[type="hidden"]');
  return splitAliasValues(hidden?.value || "");
}

function renderAliasEditor(editor) {
  if (!editor) return;
  const values = aliasEditorValues(editor);
  const list = editor.querySelector(".alias-list");
  if (!list) return;
  list.innerHTML = values.length
    ? values.map((value, index) => `
      <span class="alias-chip">
        ${escapeHtml(value)}
        <button type="button" class="alias-remove" data-index="${index}" aria-label="删除 ${escapeHtml(value)}">×</button>
      </span>
    `).join("")
    : '<span class="muted">至少新增一个称呼</span>';
}

function setAliasEditorValues(form, name, values) {
  const editor = form?.querySelector(`.alias-editor[data-alias-name="${name}"]`);
  const hidden = editor?.querySelector(`input[name="${name}"]`);
  if (!editor || !hidden) return;
  hidden.value = splitAliasValues(values).join("\n");
  renderAliasEditor(editor);
}

function getAliasEditorValues(form, name) {
  return aliasEditorValues(form?.querySelector(`.alias-editor[data-alias-name="${name}"]`));
}

function addAliasValue(editor) {
  if (!editor) return;
  const input = editor.querySelector(".alias-input");
  const hidden = editor.querySelector('input[type="hidden"]');
  const values = aliasEditorValues(editor);
  splitAliasValues(input?.value || "").forEach((value) => {
    if (!values.includes(value)) values.push(value);
  });
  if (hidden) hidden.value = values.join("\n");
  if (input) input.value = "";
  renderAliasEditor(editor);
}

function removeAliasValue(editor, index) {
  if (!editor) return;
  const hidden = editor.querySelector('input[type="hidden"]');
  const values = aliasEditorValues(editor);
  values.splice(index, 1);
  if (hidden) hidden.value = values.join("\n");
  renderAliasEditor(editor);
}

function collectPendingAliasInputs(form) {
  form?.querySelectorAll(".alias-editor").forEach(addAliasValue);
}

function initAliasEditors(root = document) {
  root.querySelectorAll(".alias-editor").forEach(renderAliasEditor);
}

function meetingName(id) {
  const meeting = (app.data?.meetings || []).find((m) => m.id === id);
  return meeting ? meeting.title : id || "";
}

function currentMeeting() {
  const meetings = [...(app.data?.meetings || [])];
  return meetings.find((m) => m.status !== "已开会") || meetings[meetings.length - 1] || null;
}

function previousMeeting() {
  const meetings = [...(app.data?.meetings || [])];
  const current = currentMeeting();
  const index = meetings.findIndex((m) => m.id === current?.id);
  return meetings[index - 1] || meetings.find((m) => m.status === "已开会") || null;
}

function meetingStarted(meeting) {
  if (!meeting) return false;
  if (meeting.status === "待开会") return false;
  if (meeting.status === "进行中" || meeting.status === "已开会") return true;
  if (!meeting.us_date) return false;
  const start = new Date(`${meeting.us_date}T${meeting.us_time || "00:00"}:00`);
  return !Number.isNaN(start.getTime()) && Date.now() >= start.getTime();
}

function transcriptMetricText(uploaded, meeting) {
  if (uploaded) return "已上传";
  return meetingStarted(meeting) ? "待上传" : "会后上传";
}

function setTitle(title, subtitle) {
  qs("#pageTitle").textContent = title;
  qs("#pageSubtitle").textContent = subtitle || "";
}

function showMessage(target, text, ok = false) {
  const el = typeof target === "string" ? qs(target) : target;
  if (!el) return;
  el.textContent = text || "";
  el.className = ok ? "message success" : "message error";
}

function renderAuth() {
  qs("#authView").classList.remove("hidden");
  qs("#appView").classList.add("hidden");
  setRegisterVisible(false);
  initAliasEditors(qs("#authView"));
  renderRegisterBusinessRoles();
}

function setRegisterVisible(visible) {
  qs("#registerGate")?.classList.toggle("hidden", visible);
  qs("#registerForm")?.classList.toggle("hidden", !visible);
  if (visible) {
    initAliasEditors(qs("#registerForm"));
    renderRegisterBusinessRoles();
    qs('#registerForm input[name="username"]')?.focus();
  }
}

function renderRegisterBusinessRoles() {
  const box = qs("#registerBusinessRoles");
  if (!box) return;
  if (!app.publicRoles.length) {
    box.innerHTML = `<span class="muted">正在加载业务角色...</span>`;
    return;
  }
  box.innerHTML = checkboxOptions(
    app.publicRoles.map((role) => ({
      id: role.id,
      name: role.name,
    })),
    [],
    "business_role_ids",
    "暂无业务角色"
  );
}

async function loadPublicConfig() {
  try {
    const res = await api("/api/public-config");
    app.publicRoles = res.business_roles || [];
    renderRegisterBusinessRoles();
  } catch (err) {
    const box = qs("#registerBusinessRoles");
    if (box) box.innerHTML = `<span class="muted">业务角色加载失败，请刷新页面</span>`;
  }
}

function renderAppShell() {
  qs("#authView").classList.add("hidden");
  qs("#appView").classList.remove("hidden");
  if (app.page === "report" && !canViewAgencyReport()) app.page = "dashboard";
  const visiblePages = pages.filter(([key]) => {
    if (key === "admin") return app.user?.role === "admin";
    if (key === "report") return canViewAgencyReport();
    return true;
  });
  qs("#nav").innerHTML = visiblePages
    .map(([key, label]) => `<button class="nav-btn ${app.page === key ? "active" : ""}" data-page="${key}">${label}</button>`)
    .join("");
  qs("#currentUserLabel").innerHTML = `${escapeHtml(app.person?.display_name || app.user?.username)}<br><span class="muted">${escapeHtml(app.user?.role || "")} · ${escapeHtml(userBusinessRoleNames(app.user))}</span>`;
  qs("#storageLabel").textContent = app.storage?.backend === "firebase" ? "Firebase 数据库" : "本地测试数据";
  qs("#passwordNotice").classList.toggle("hidden", !app.user?.must_change_password);
  renderPage();
}

function renderPage() {
  const title = pages.find(([key]) => key === app.page)?.[1] || "周会首页";
  setTitle(title, "");
  if (app.page === "report" && !canViewAgencyReport()) app.page = "dashboard";
  if (app.page === "dashboard") renderDashboard();
  if (app.page === "meetings") renderMeetings();
  if (app.page === "report") renderReport();
  if (app.page === "notes") renderNotes();
  if (app.page === "transcripts") renderTranscripts();
  if (app.page === "actions") renderActions();
  if (app.page === "admin") renderAdmin();
  renderAppShellNavOnly();
}

function renderAppShellNavOnly() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === app.page);
  });
}

async function refresh() {
  const res = await api("/api/app-data");
  app.data = res.data;
  app.storage = res.storage;
}

async function loadMe() {
  const res = await api("/api/me");
  app.user = res.user;
  app.person = res.person;
  if (!app.user) {
    renderAuth();
    return;
  }
  await refresh();
  renderAppShell();
}

function renderDashboard() {
  const meeting = currentMeeting();
  const prev = previousMeeting();
  const links = app.data.settings?.meeting_links || [];
  const reports = app.data.weekly_reports || [];
  const transcripts = app.data.transcript_uploads || [];
  const actions = app.data.action_items || [];
  const notes = app.data.pre_meeting_notes || [];
  const agencyPersonIds = (app.data.users || [])
    .filter((u) => (u.business_role_ids || []).includes(AGENCY_OPS_ROLE_ID))
    .map((u) => u.person_id)
    .filter(Boolean);
  const fallbackKyle = (app.data.people || []).find((p) => p.id === "person_kyle") || {};
  const reportPersonIds = agencyPersonIds.length ? agencyPersonIds : [fallbackKyle.id].filter(Boolean);
  const report = reports.find((r) => r.meeting_id === meeting?.id && reportPersonIds.includes(r.person_id));
  const part1Uploaded = transcripts.some((t) => t.meeting_id === meeting?.id && t.part === "part1");
  const part2Uploaded = transcripts.some((t) => t.meeting_id === meeting?.id && t.part === "part2");
  setTitle("周会首页", "下次会议、两段腾讯会议链接、美国代运营周报状态、文字记录上传状态和第二部分流程。");
  qs("#content").innerHTML = `
    <div class="grid">
      <div class="panel">
        <div class="section-title">
          <div>
            <h2>${escapeHtml(meeting?.title || "暂无会议")}</h2>
            <p class="muted">美国时间 ${escapeHtml(meeting?.us_date || "")} ${escapeHtml(meeting?.us_time || "")} / 中国时间 ${escapeHtml(meeting?.cn_date || "")} ${escapeHtml(meeting?.cn_time || "")}</p>
          </div>
          <span class="tag ${meeting?.status === "已开会" ? "green" : "amber"}">${escapeHtml(meeting?.status || "")}</span>
        </div>
        <div class="metric-row">
          <div class="metric"><span>美国代运营周报</span><strong>${report ? "已保存" : meeting?.kyle_report_required ? "待填写" : "不强制"}</strong></div>
          <div class="metric"><span>第1段文字记录</span><strong>${transcriptMetricText(part1Uploaded, meeting)}</strong></div>
          <div class="metric"><span>第2段文字记录</span><strong>${transcriptMetricText(part2Uploaded, meeting)}</strong></div>
          <div class="metric"><span>会前备注</span><strong>${notes.filter((n) => n.meeting_id === meeting?.id).length} 条</strong></div>
        </div>
        <p class="muted" style="margin-top:12px">${escapeHtml(meeting?.notes || "")}</p>
      </div>

      <div class="grid two">
        <div class="panel">
          <h2>固定腾讯会议链接</h2>
          <div class="link-list">
            ${links.map((link) => `
              <div class="meeting-link">
                <strong>${escapeHtml(link.title)}</strong>
                <div>${link.url ? `<a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.url)}</a>` : '<span class="muted">暂未填写链接</span>'}</div>
                <div class="muted">会议号：${escapeHtml(link.meeting_id || "-")}　密码：${escapeHtml(link.password || "-")}</div>
              </div>
            `).join("")}
          </div>
        </div>
        <div class="panel">
          <h2>上周行动项回顾</h2>
          <div class="table-wrap">
            <table>
              <thead><tr><th>事项</th><th>负责人</th><th>状态</th><th>截止</th></tr></thead>
              <tbody>
                ${actions.filter((a) => a.meeting_id === prev?.id).slice(0, 8).map((a) => `
                  <tr><td>${escapeHtml(a.title)}</td><td>${escapeHtml(personName(a.owner_person_id) || a.owner_text)}</td><td>${escapeHtml(a.status)}</td><td>${escapeHtml(a.due_date)}</td></tr>
                `).join("") || '<tr><td colspan="4" class="muted">暂无上周行动项</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="panel">
        <h2>第二部分：内部经营复盘会流程</h2>
        <div class="agenda">
          ${part2Agenda.map((row) => `
            <div class="agenda-row">
              <span class="tag">${row[0]}</span>
              <div><strong>${escapeHtml(row[1])}</strong><br><span class="muted">${escapeHtml(row[3])}</span></div>
              <span>${escapeHtml(row[2])}</span>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderMeetings() {
  const meeting = currentMeeting();
  const links = app.data.settings?.meeting_links || [];
  const meetings = [...(app.data.meetings || [])];
  setTitle("会议列表", "所有人查看固定腾讯会议链接、当前会议和每周会议档案。");
  qs("#content").innerHTML = `
    <div class="grid">
      <div class="panel">
        <h2>固定腾讯会议链接</h2>
        <div class="link-list">
          ${links.map((link) => `
            <div class="meeting-link">
              <strong>${escapeHtml(link.title)}</strong>
              <div>${link.url ? `<a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.url)}</a>` : '<span class="muted">暂未填写链接</span>'}</div>
              <div class="muted">会议号：${escapeHtml(link.meeting_id || "-")}　密码：${escapeHtml(link.password || "-")}</div>
              <div class="muted">主持人：${escapeHtml(link.host || "-")}　备注：${escapeHtml(link.notes || "-")}</div>
            </div>
          `).join("") || '<div class="muted">暂无固定会议链接</div>'}
        </div>
      </div>

      <div class="panel">
        <div class="section-title">
          <div>
            <h2>当前 / 下次会议</h2>
            <p class="muted">${escapeHtml(meeting?.title || "暂无会议")}</p>
          </div>
          <span class="tag ${meeting?.status === "已开会" ? "green" : "amber"}">${escapeHtml(meeting?.status || "")}</span>
        </div>
        <div class="metric-row">
          <div class="metric"><span>美国时间</span><strong>${escapeHtml(`${meeting?.us_date || "-"} ${meeting?.us_time || ""}`)}</strong></div>
          <div class="metric"><span>中国时间</span><strong>${escapeHtml(`${meeting?.cn_date || "-"} ${meeting?.cn_time || ""}`)}</strong></div>
          <div class="metric"><span>美国代运营周报</span><strong>${meeting?.kyle_report_required ? "必填" : "不强制"}</strong></div>
          <div class="metric"><span>会议状态</span><strong>${escapeHtml(meeting?.status || "-")}</strong></div>
        </div>
        <p class="muted" style="margin-top:12px">${escapeHtml(meeting?.notes || "")}</p>
      </div>

      <div class="panel">
        <h2>每周会议档案</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>标题</th><th>状态</th><th>美国时间</th><th>中国时间</th><th>美国代运营周报</th><th>备注</th></tr></thead>
            <tbody>
              ${meetings.map((m) => `
                <tr>
                  <td>${escapeHtml(m.title)}</td>
                  <td>${escapeHtml(m.status)}</td>
                  <td>${escapeHtml(`${m.us_date || ""} ${m.us_time || ""}`)}</td>
                  <td>${escapeHtml(`${m.cn_date || ""} ${m.cn_time || ""}`)}</td>
                  <td>${m.kyle_report_required ? "必填" : "不强制"}</td>
                  <td>${escapeHtml(m.notes || "")}</td>
                </tr>
              `).join("") || '<tr><td colspan="6" class="muted">暂无会议档案</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderReport() {
  const meeting = currentMeeting();
  const people = app.data.people || [];
  const agencyPersonIds = (app.data.users || [])
    .filter((u) => (u.business_role_ids || []).includes(AGENCY_OPS_ROLE_ID))
    .map((u) => u.person_id)
    .filter(Boolean);
  const fallbackKyle = people.find((p) => p.id === "person_kyle") || people[0] || {};
  const canChoose = ["admin", "manager"].includes(app.user.role);
  const defaultPersonId = app.user.person_id || agencyPersonIds[0] || fallbackKyle.id;
  const selectedPerson = canChoose ? (sessionStorage.getItem("reportPersonId") || defaultPersonId) : app.user.person_id;
  const report = (app.data.weekly_reports || []).find((r) => r.meeting_id === meeting?.id && r.person_id === selectedPerson) || { fields: {} };
  const fields = report.fields || {};
  setTitle("美国代运营周报", "从2026-06-22中国时间这次周会开始，美国代运营会前填写直营店周报。");
  qs("#content").innerHTML = `
    <form id="reportForm" class="grid">
      <div class="panel">
        <div class="toolbar">
          <label>会议<select name="meeting_id">${meetingOptions(meeting?.id)}</select></label>
          ${canChoose ? `<label>填写对象<select name="person_id">${people.map((p) => `<option value="${p.id}" ${p.id === selectedPerson ? "selected" : ""}>${escapeHtml(p.display_name || p.real_name)}</option>`).join("")}</select></label>` : ""}
          <button type="submit">保存周报</button>
          <span id="reportMessage" class="message"></span>
        </div>
      </div>
      ${reportSections.map(([title, items]) => `
        <div class="panel">
          <h2>${escapeHtml(title)}</h2>
          <div class="form-grid">
            ${items.map((item) => fieldHtml(item, fields[item[0]])).join("")}
          </div>
        </div>
      `).join("")}
    </form>
  `;
  qs('select[name="person_id"]')?.addEventListener("change", (event) => {
    sessionStorage.setItem("reportPersonId", event.target.value);
    renderReport();
  });
  qs("#reportForm").addEventListener("submit", saveReport);
}

function fieldHtml(item, value) {
  const [key, label, type, choices] = item;
  const wide = type === "textarea" ? "field-wide" : "";
  if (type === "select") {
    return `<label class="${wide}">${escapeHtml(label)}<select class="input-zone" name="${key}"><option value=""></option>${choices.map((c) => `<option value="${escapeHtml(c)}" ${value === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}</select></label>`;
  }
  if (type === "textarea") {
    return `<label class="${wide}">${escapeHtml(label)}<textarea class="input-zone" name="${key}">${escapeHtml(value || "")}</textarea></label>`;
  }
  return `<label>${escapeHtml(label)}<input class="input-zone" name="${key}" value="${escapeHtml(value || "")}" /></label>`;
}

function meetingOptions(selectedId) {
  return (app.data.meetings || []).map((m) => `<option value="${m.id}" ${m.id === selectedId ? "selected" : ""}>${escapeHtml(m.title)}</option>`).join("");
}

async function saveReport(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const fields = {};
  for (const section of reportSections) {
    for (const item of section[1]) {
      fields[item[0]] = form.get(item[0]) || "";
    }
  }
  try {
    const res = await api("/api/reports/save", {
      method: "POST",
      body: {
        meeting_id: form.get("meeting_id"),
        person_id: form.get("person_id") || app.user.person_id,
        fields,
        status: "已保存",
      },
    });
    upsertById("weekly_reports", res.report);
    showMessage("#reportMessage", "已保存", true);
  } catch (err) {
    showMessage("#reportMessage", err.message);
  }
}

function renderNotes() {
  const meeting = currentMeeting();
  const people = app.data.people || [];
  const canManage = ["admin", "manager"].includes(app.user.role);
  const notes = app.data.pre_meeting_notes || [];
  setTitle("会前备注", "每个人周会前写下本周要提出的问题、需要谁配合、建议怎么处理。");
  qs("#content").innerHTML = `
    <div class="grid">
      <form id="noteForm" class="panel">
        <h2>新增 / 修改备注</h2>
        <input type="hidden" name="id" />
        <div class="form-grid">
          <label>会议<select name="meeting_id">${meetingOptions(meeting?.id)}</select></label>
          ${canManage ? `<label>填写人<select name="person_id">${people.map((p) => `<option value="${p.id}" ${p.id === app.user.person_id ? "selected" : ""}>${escapeHtml(p.display_name || p.real_name)}</option>`).join("")}</select></label>` : ""}
          <label>会议部分<select name="meeting_part"><option value="part1">第一部分：美国代运营周报</option><option value="part2" selected>第二部分：内部复盘</option></select></label>
          <label>模块<select name="module"><option>货品</option><option>仓库</option><option>物流</option><option>直播</option><option>达人</option><option>技术</option><option>合作方</option><option>财务</option><option>其他</option></select></label>
          <label>优先级<select name="priority"><option>高</option><option selected>中</option><option>低</option></select></label>
          <label>需要会议决策<select name="needs_decision"><option value="false">否</option><option value="true">是</option></select></label>
          <label class="field-wide">我要提出的问题<textarea name="question" required></textarea></label>
          <label class="field-wide">我需要谁配合<textarea name="support_needed"></textarea></label>
          <label class="field-wide">我建议的处理方式<textarea name="suggestion"></textarea></label>
          <label>会议中已提到<select name="mentioned"><option value="false">否</option><option value="true">是</option></select></label>
          <label class="field-wide">会后处理结果<textarea name="result"></textarea></label>
        </div>
        <div class="split-actions" style="margin-top:12px">
          <button type="submit">保存备注</button>
          <button type="button" class="plain-btn" id="clearNoteBtn">清空</button>
          <span id="noteMessage" class="message"></span>
        </div>
      </form>
      <div class="panel">
        <h2>本周会前备注</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>填写人</th><th>部分</th><th>模块</th><th>优先级</th><th>问题</th><th>操作</th></tr></thead>
            <tbody>
              ${notes.filter((n) => n.meeting_id === meeting?.id).map((n) => `
                <tr>
                  <td>${escapeHtml(personName(n.person_id))}</td>
                  <td>${n.meeting_part === "part1" ? "第一部分" : "第二部分"}</td>
                  <td>${escapeHtml(n.module)}</td>
                  <td>${escapeHtml(n.priority)}</td>
                  <td>${escapeHtml(n.question)}</td>
                  <td><button class="plain-btn edit-note" data-id="${n.id}">编辑</button></td>
                </tr>
              `).join("") || '<tr><td colspan="6" class="muted">暂无备注</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  qs("#noteForm").addEventListener("submit", saveNote);
  qs("#clearNoteBtn").addEventListener("click", () => qs("#noteForm").reset());
  document.querySelectorAll(".edit-note").forEach((btn) => btn.addEventListener("click", () => fillNote(btn.dataset.id)));
}

function fillNote(id) {
  const note = (app.data.pre_meeting_notes || []).find((n) => n.id === id);
  if (!note) return;
  const form = qs("#noteForm");
  for (const [key, value] of Object.entries(note)) {
    if (form.elements[key]) form.elements[key].value = typeof value === "boolean" ? String(value) : value;
  }
}

async function saveNote(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const body = Object.fromEntries(form.entries());
  body.needs_decision = body.needs_decision === "true";
  body.mentioned = body.mentioned === "true";
  body.person_id = body.person_id || app.user.person_id;
  try {
    const res = await api("/api/notes/save", { method: "POST", body });
    upsertById("pre_meeting_notes", res.note);
    renderNotes();
    setTimeout(() => showMessage("#noteMessage", "已保存备注", true), 0);
  } catch (err) {
    showMessage("#noteMessage", err.message);
  }
}

function renderTranscripts() {
  const meeting = currentMeeting();
  const records = app.data.transcript_uploads || [];
  const canUpload = ["admin", "manager"].includes(app.user.role);
  const subtitle = canUpload
    ? "上传腾讯会议导出的文字记录；如果文字里写到第一部分凯尔/代运营结束，系统会自动拆成两段保存。"
    : "查看当前账号有权限访问的会议纪要。美国代运营角色只能看到第一部分。";
  setTitle("会议文字记录", subtitle);
  qs("#content").innerHTML = `
    <div class="grid">
      ${canUpload ? `
      <form id="transcriptForm" class="panel">
        <h2>上传腾讯会议文字记录</h2>
        <div class="form-grid two">
          <label>会议<select name="meeting_id">${meetingOptions(meeting?.id)}</select></label>
          <label>会议段落<select name="part"><option value="part1">Part 1：美国代运营周报</option><option value="part2">Part 2：内部经营复盘</option></select></label>
          <label>文件名<input name="filename" /></label>
          <label>选择文本文件<input id="transcriptFile" type="file" accept=".txt,.md,.csv,text/plain" /></label>
          <label class="field-wide">文字记录内容<textarea name="content" required></textarea></label>
        </div>
        <div class="split-actions" style="margin-top:12px">
          <button type="submit">上传保存</button>
          <span id="transcriptMessage" class="message"></span>
        </div>
        <p class="hint" style="margin-top:10px">提示：可以上传完整会议文字；出现“第一部分凯尔的结束了”等断点时，会自动把前面保存为 Part 1，后面保存为 Part 2。</p>
      </form>` : ""}
      <div class="panel">
        <h2>${canUpload ? "已上传记录" : "可查看会议纪要"}</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>会议</th><th>段落</th><th>文件</th><th>字数</th><th>说话人匹配</th><th>未匹配说话人</th><th>提到人员</th><th>提到角色</th><th>内容</th><th>时间</th></tr></thead>
            <tbody>
              ${records.map((r) => `
                <tr>
                  <td>${escapeHtml(meetingName(r.meeting_id))}</td>
                  <td>${r.part === "part1" ? "Part 1：美国代运营" : "Part 2：内部复盘"}</td>
                  <td>${escapeHtml(r.original_filename || r.title || "-")}</td>
                  <td>${escapeHtml(r.char_count)}</td>
                  <td>${(r.matched_speakers || []).map((s) => escapeHtml(`${s.speaker}→${s.person_name}`)).join("<br>") || '<span class="muted">-</span>'}</td>
                  <td>${(r.unmatched_speakers || []).map((s) => escapeHtml(s.speaker)).join("<br>") || '<span class="muted">-</span>'}</td>
                  <td>${(r.mentioned_people || []).slice(0, 8).map((p) => escapeHtml(`${p.person_name}（${p.count}）`)).join("<br>") || '<span class="muted">-</span>'}</td>
                  <td>${(r.mentioned_roles || []).slice(0, 8).map((role) => escapeHtml(`${role.role_name}（${role.count}）`)).join("<br>") || '<span class="muted">-</span>'}</td>
                  <td><button class="plain-btn view-transcript" data-id="${escapeHtml(r.id)}">查看</button></td>
                  <td>${escapeHtml(r.uploaded_at || "")}</td>
                </tr>
              `).join("") || '<tr><td colspan="10" class="muted">暂无可查看记录</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <div id="transcriptViewer" class="panel transcript-viewer hidden"></div>
    </div>
  `;
  qs("#transcriptFile")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    qs('#transcriptForm input[name="filename"]').value = file.name;
    qs('#transcriptForm textarea[name="content"]').value = await file.text();
  });
  qs("#transcriptForm")?.addEventListener("submit", saveTranscript);
  document.querySelectorAll(".view-transcript").forEach((btn) => {
    btn.addEventListener("click", () => viewTranscript(btn.dataset.id));
  });
}

async function saveTranscript(event) {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const res = await api("/api/transcripts/upload", { method: "POST", body });
    (res.records || []).forEach((record) => upsertById("transcript_uploads", record));
    renderTranscripts();
    setTimeout(() => showMessage("#transcriptMessage", "已上传保存", true), 0);
  } catch (err) {
    showMessage("#transcriptMessage", err.message);
  }
}

async function viewTranscript(id) {
  const viewer = qs("#transcriptViewer");
  if (!viewer) return;
  viewer.classList.remove("hidden");
  viewer.innerHTML = `<h2>正在读取会议纪要...</h2>`;
  try {
    const res = await api(`/api/transcripts/${encodeURIComponent(id)}`);
    const record = res.record || {};
    const partLabel = record.part === "part1" ? "Part 1：美国代运营周报" : "Part 2：内部经营复盘";
    viewer.innerHTML = `
      <div class="section-title">
        <div>
          <h2>${escapeHtml(partLabel)}</h2>
          <p class="muted">${escapeHtml(meetingName(record.meeting_id))} · ${escapeHtml(record.original_filename || record.title || "")}</p>
        </div>
        <span class="tag">${escapeHtml(record.char_count || 0)} 字</span>
      </div>
      ${record.split_marker ? `<p class="hint">自动断点：${escapeHtml(record.split_marker)}</p>` : ""}
      <pre class="transcript-content">${escapeHtml(res.content || "")}</pre>
    `;
    viewer.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    viewer.innerHTML = `<h2>无法查看</h2><p class="message error">${escapeHtml(err.message)}</p>`;
  }
}

function renderActions() {
  const meeting = currentMeeting();
  const people = app.data.people || [];
  const actions = app.data.action_items || [];
  const canEdit = ["admin", "manager"].includes(app.user.role);
  setTitle("行动项", "每次会议最后必须收口：事项、负责人、截止日期、状态。");
  qs("#content").innerHTML = `
    <div class="grid">
      ${canEdit ? `
      <form id="actionForm" class="panel">
        <h2>新增 / 修改行动项</h2>
        <input type="hidden" name="id" />
        <div class="form-grid">
          <label>会议<select name="meeting_id">${meetingOptions(meeting?.id)}</select></label>
          <label>段落<select name="part"><option value="part1">第一部分</option><option value="part2" selected>第二部分</option></select></label>
          <label>负责人<select name="owner_person_id"><option value="">待定</option>${people.map((p) => `<option value="${p.id}">${escapeHtml(p.display_name || p.real_name)}</option>`).join("")}</select></label>
          <label class="field-wide">事项<input name="title" required /></label>
          <label>截止日期<input name="due_date" type="date" /></label>
          <label>优先级<select name="priority"><option>P0-今天处理</option><option selected>P1-本周必须</option><option>P2-观察</option><option>P3-低优先</option></select></label>
          <label>状态<select name="status"><option>未开始</option><option>进行中</option><option>已完成</option><option>暂停/调整</option></select></label>
          <label>负责人补充<input name="owner_text" /></label>
          <label class="field-wide">备注<textarea name="notes"></textarea></label>
        </div>
        <div class="split-actions" style="margin-top:12px">
          <button type="submit">保存行动项</button>
          <button type="button" class="plain-btn" id="clearActionBtn">清空</button>
          <span id="actionMessage" class="message"></span>
        </div>
      </form>` : ""}
      <div class="panel">
        <h2>行动项列表</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>会议</th><th>事项</th><th>负责人</th><th>优先级</th><th>状态</th><th>截止</th><th>操作</th></tr></thead>
            <tbody>
              ${actions.map((a) => `
                <tr>
                  <td>${escapeHtml(meetingName(a.meeting_id))}</td>
                  <td>${escapeHtml(a.title)}</td>
                  <td>${escapeHtml(personName(a.owner_person_id) || a.owner_text)}</td>
                  <td>${escapeHtml(a.priority)}</td>
                  <td>${escapeHtml(a.status)}</td>
                  <td>${escapeHtml(a.due_date)}</td>
                  <td>${canEdit ? `<button class="plain-btn edit-action" data-id="${a.id}">编辑</button>` : ""}</td>
                </tr>
              `).join("") || '<tr><td colspan="7" class="muted">暂无行动项</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  qs("#actionForm")?.addEventListener("submit", saveAction);
  qs("#clearActionBtn")?.addEventListener("click", () => qs("#actionForm").reset());
  document.querySelectorAll(".edit-action").forEach((btn) => btn.addEventListener("click", () => fillAction(btn.dataset.id)));
}

function fillAction(id) {
  const action = (app.data.action_items || []).find((a) => a.id === id);
  if (!action) return;
  const form = qs("#actionForm");
  for (const [key, value] of Object.entries(action)) {
    if (form.elements[key]) form.elements[key].value = value || "";
  }
}

async function saveAction(event) {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const res = await api("/api/actions/save", { method: "POST", body });
    upsertById("action_items", res.action);
    renderActions();
    setTimeout(() => showMessage("#actionMessage", "已保存行动项", true), 0);
  } catch (err) {
    showMessage("#actionMessage", err.message);
  }
}

function renderAdmin() {
  if (app.user.role !== "admin") {
    qs("#content").innerHTML = `<div class="panel">没有管理员权限。</div>`;
    return;
  }
  setTitle("管理员", "系统权限、人员资料、业务角色职责和腾讯会议名称匹配。");
  const users = app.data.users || [];
  const people = app.data.people || [];
  const businessRoles = app.data.business_roles || [];
  const accountPersonIds = new Set(users.map((u) => u.person_id).filter(Boolean));
  const unboundPeople = people.filter((p) => !accountPersonIds.has(p.id));
  const roleCheckboxes = (selected = []) => checkboxOptions(businessRoles, selected, "business_role_ids", "暂无业务角色");
  const personInfo = (person) => person ? `
    <div class="person-inline">
      <strong>${escapeHtml(person.display_name || person.real_name || person.chinese_name || person.english_name || person.id)}</strong>
      <span>${escapeHtml(person.region || "地区未填")}</span>
      <span>${escapeHtml(person.business_area || "负责业务未填")}</span>
      <span>腾讯会议名：${escapeHtml((person.meeting_aliases || []).join(", ") || "-")}</span>
      <span>现实称呼：${escapeHtml((person.mention_aliases || []).join(", ") || "-")}</span>
      <button type="button" class="plain-btn compact-action edit-person" data-id="${person.id}">编辑人员</button>
    </div>
  ` : '<span class="muted">未绑定人员，待管理员确认</span>';
  const userCheckboxes = (roleId) => checkboxOptions(
    users.map((u) => ({
      id: u.id,
      name: `${u.username}${u.person_id ? ` / ${personName(u.person_id)}` : ""}`,
    })),
    users.filter((u) => (u.business_role_ids || []).includes(roleId)).map((u) => u.id),
    "user_ids",
    "暂无账号"
  );
  qs("#content").innerHTML = `
    <div class="grid">
      <form id="createUserForm" class="panel">
        <h2>管理员创建账号</h2>
        <p class="hint">这里给管理员提前建账号使用；成员自己注册时，用户名建议直接用中文名或平时称呼，业务角色按实际负责内容多选，不确定就选最接近的，管理员后续可以统一调整。</p>
        <div class="form-grid">
          <label>用户名<input name="username" required placeholder="例如：凯尔、老陈、诺诺" /></label>
          <label>临时密码<input name="password" placeholder="不填则自动生成" /></label>
          <label>系统权限<select name="role"><option>member</option><option>manager</option><option>admin</option></select></label>
          <label>状态<select name="status"><option selected>active</option><option>pending</option><option>disabled</option></select></label>
          <label>绑定人员<select name="person_id"><option value="">先不绑定，等注册后再确认</option>${people.map((p) => `<option value="${p.id}">${escapeHtml(p.display_name || p.real_name)}</option>`).join("")}</select></label>
          <div class="alias-label field-wide"><span>业务角色</span><div class="checkbox-grid role-checkboxes">${roleCheckboxes([])}</div></div>
        </div>
        <div class="split-actions" style="margin-top:12px"><button type="submit">创建账号</button><span id="createUserMessage" class="message"></span></div>
      </form>

      <div class="panel">
        <h2>账号权限 / 人员绑定</h2>
        <p class="hint">账号权限、绑定现实人员、人员资料和业务角色集中在这里管理。用户第一次注册后不能自己改业务角色，只能由管理员后台调整。</p>
        ${unboundPeople.length ? `
          <div class="notice-box">
            <strong>未绑定人员提醒</strong>
            <span>当前有 ${unboundPeople.length} 条人员资料还没有绑定账号。这些只是根据现有会议称呼和示例预留的名称匹配资料，不代表最终注册用户名或角色。真实成员注册时按自己的中文名、腾讯会议名和实际职责填写，管理员再在这里确认绑定。</span>
          </div>
        ` : ""}
        <div class="table-wrap">
          <table>
            <thead><tr><th>用户名</th><th>系统权限</th><th>状态</th><th>绑定现实人员</th><th>人员资料</th><th>业务角色</th><th>最后登录</th><th>操作</th></tr></thead>
            <tbody>
              ${users.map((u) => `
                <tr data-user-id="${u.id}">
                  <td>${escapeHtml(u.username)}</td>
                  <td><select class="user-role compact-input"><option ${u.role === "member" ? "selected" : ""}>member</option><option ${u.role === "manager" ? "selected" : ""}>manager</option><option ${u.role === "admin" ? "selected" : ""}>admin</option></select></td>
                  <td><select class="user-status compact-input"><option ${u.status === "pending" ? "selected" : ""}>pending</option><option ${u.status === "active" ? "selected" : ""}>active</option><option ${u.status === "disabled" ? "selected" : ""}>disabled</option></select></td>
                  <td><select class="user-person"><option value="">未绑定</option>${people.map((p) => `<option value="${p.id}" ${u.person_id === p.id ? "selected" : ""}>${escapeHtml(p.display_name || p.real_name)}</option>`).join("")}</select></td>
                  <td>${personInfo(personById(u.person_id))}</td>
                  <td><div class="checkbox-grid role-checkboxes">${roleCheckboxes(u.business_role_ids || [])}</div></td>
                  <td>${escapeHtml(u.last_login_at || "-")}</td>
                  <td class="split-actions">
                    <button class="plain-btn save-user">保存</button>
                    <button class="plain-btn reset-user">重置密码</button>
                    ${u.id === app.user.id ? '<span class="muted">当前账号不能删除</span>' : '<button class="plain-btn danger-text delete-user">删除</button>'}
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        <div id="adminUserMessage" class="message"></div>
      </div>

      <div class="panel">
        <h2>业务角色职责 / 账号绑定</h2>
        <p class="hint">系统已有默认业务角色和默认职责；可以新增角色，也可以修改角色名称、职责、会议说法和绑定账号。默认角色不能删除，自定义新增角色可以删除。</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>业务角色</th><th>职责（可修改）</th><th>会议说法（可修改）</th><th>绑定账号</th><th>操作</th></tr></thead>
            <tbody id="businessRolesTbody">
              ${businessRoles.map((role) => `
                <tr data-role-id="${role.id}">
                  <td><input class="role-name compact-input" value="${escapeHtml(role.name)}" /></td>
                  <td><textarea class="role-description compact-textarea">${escapeHtml(role.description || "")}</textarea></td>
                  <td><textarea class="role-aliases compact-textarea" placeholder="例如：主持人, 周会主持人">${escapeHtml((role.aliases || []).join(", "))}</textarea></td>
                  <td><div class="checkbox-grid user-checkboxes">${userCheckboxes(role.id)}</div></td>
                  <td class="role-action-cell">
                    <div class="split-actions">
                      <button type="button" class="plain-btn save-role-users">保存角色</button>
                      ${role.id.startsWith("role_") ? "" : '<button type="button" class="plain-btn danger-text delete-business-role">删除</button>'}
                    </div>
                    <span class="inline-status role-row-message"></span>
                  </td>
                </tr>
              `).join("") || '<tr class="empty-role-row"><td colspan="5" class="muted">暂无业务角色</td></tr>'}
            </tbody>
          </table>
        </div>
        <div class="table-footer-actions">
          <button type="button" id="addRoleRowBtn" class="plain-btn">新增一行角色</button>
        </div>
        <div id="roleMessage" class="message"></div>
      </div>

      <div id="personModal" class="modal-backdrop hidden" aria-hidden="true">
        <div class="modal-panel">
          <form id="personModalForm">
            <div class="section-title">
              <div>
                <h2>编辑人员资料</h2>
                <p class="muted">维护现实姓名、腾讯会议名和会议文字里的称呼匹配。</p>
              </div>
              <button type="button" class="plain-btn modal-close">关闭</button>
            </div>
            <input type="hidden" name="id" />
            <div class="form-grid">
              <label>显示名称<input name="display_name" required /></label>
              <label>真实姓名<input name="real_name" /></label>
              <label>中文名<input name="chinese_name" /></label>
              <label>英文名<input name="english_name" /></label>
              <label>地区<input name="region" /></label>
              <label>业务负责<textarea name="business_area"></textarea></label>
              <label>参加每周会议<select name="attends_weekly"><option value="true">是</option><option value="false">否</option></select></label>
              <label>需要填周报<select name="needs_weekly_report"><option value="false">否</option><option value="true">是</option></select></label>
              <label>有登录账号<select name="has_login"><option value="false">否</option><option value="true">是</option></select></label>
              <label class="field-wide">腾讯会议参会人名，用逗号或换行分隔<textarea name="meeting_aliases" placeholder="例如：Kyle, KYLE, 凯尔"></textarea></label>
              <div class="alias-label field-wide">
                <span>现实姓名 / 称呼 / 外号</span>
                <div class="alias-editor" data-alias-name="mention_aliases">
                  <input type="hidden" name="mention_aliases" />
                  <div class="alias-list"></div>
                  <div class="alias-entry-row">
                    <input class="alias-input" placeholder="输入一个称呼，例如：陈总" />
                    <button type="button" class="plain-btn alias-add">新增</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="split-actions" style="margin-top:12px">
              <button type="submit">保存人员</button>
              <button type="button" class="plain-btn modal-close">取消</button>
              <span id="personModalMessage" class="message"></span>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
  initAliasEditors(qs("#content"));
  wireAdmin();
}

function wireAdmin() {
  document.querySelectorAll(".save-user").forEach((btn) => btn.addEventListener("click", async () => {
    const row = btn.closest("tr");
    try {
      const res = await api("/api/admin/save-user", {
        method: "POST",
        body: {
          id: row.dataset.userId,
          role: row.querySelector(".user-role").value,
          status: row.querySelector(".user-status").value,
          person_id: row.querySelector(".user-person").value,
          business_role_ids: checkedValues(row, "business_role_ids"),
        },
      });
      upsertById("users", res.user);
      showMessage("#adminUserMessage", "已保存账号", true);
    } catch (err) {
      showMessage("#adminUserMessage", err.message);
    }
  }));
  document.querySelectorAll(".reset-user").forEach((btn) => btn.addEventListener("click", async () => {
    const row = btn.closest("tr");
    try {
      const res = await api("/api/admin/reset-password", { method: "POST", body: { user_id: row.dataset.userId } });
      showMessage("#adminUserMessage", `临时密码：${res.temporary_password}`, true);
    } catch (err) {
      showMessage("#adminUserMessage", err.message);
    }
  }));
  document.querySelectorAll(".delete-user").forEach((btn) => btn.addEventListener("click", async () => {
    const row = btn.closest("tr");
    const username = row.children[0]?.textContent?.trim() || "这个账号";
    if (!confirm(`确定删除用户「${username}」？只会删除登录账号，不会删除人员档案。`)) return;
    try {
      await api("/api/admin/delete-user", { method: "POST", body: { user_id: row.dataset.userId } });
      await refresh();
      renderAdmin();
      setTimeout(() => showMessage("#adminUserMessage", "用户已删除", true), 0);
    } catch (err) {
      showMessage("#adminUserMessage", err.message);
    }
  }));
  qs("#createUserForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    body.business_role_ids = checkedValues(event.currentTarget, "business_role_ids");
    try {
      const res = await api("/api/admin/create-user", { method: "POST", body });
      await refresh();
      renderAdmin();
      setTimeout(() => showMessage("#createUserMessage", `临时密码：${res.temporary_password}`, true), 0);
    } catch (err) {
      showMessage("#createUserMessage", err.message);
    }
  });
  document.querySelectorAll(".save-role-users").forEach((btn) => btn.addEventListener("click", saveRoleUsers));
  qs("#addRoleRowBtn")?.addEventListener("click", addBusinessRoleRow);
  document.querySelectorAll(".delete-business-role").forEach((btn) => btn.addEventListener("click", deleteBusinessRole));
  qs("#personModalForm")?.addEventListener("submit", savePerson);
  document.querySelectorAll(".modal-close").forEach((btn) => btn.addEventListener("click", closePersonModal));
  qs("#personModal")?.addEventListener("click", (event) => {
    if (event.target.id === "personModal") closePersonModal();
  });
  document.querySelectorAll(".edit-person").forEach((btn) => btn.addEventListener("click", () => openPersonModal(btn.dataset.id)));
}

async function saveRoleUsers(event) {
  event.preventDefault();
  const button = event.currentTarget;
  const row = event.currentTarget.closest("tr");
  const roleId = row.dataset.roleId || "";
  const status = row.querySelector(".role-row-message");
  const originalText = button.textContent;
  const userIds = checkedValues(row, "user_ids");
  const aliases = String(row.querySelector(".role-aliases")?.value || "")
    .split(/[,，\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
  const roleName = String(row.querySelector(".role-name")?.value || "").trim();
  if (!roleName) {
    showMessage("#roleMessage", "业务角色名称不能为空");
    if (status) {
      status.textContent = "业务角色名称不能为空";
      status.className = "inline-status role-row-message error";
    }
    return;
  }
  try {
    button.disabled = true;
    button.textContent = "保存中...";
    if (status) {
      status.textContent = `正在保存，已勾选 ${userIds.length} 个账号`;
      status.className = "inline-status role-row-message";
    }
    const res = await api("/api/admin/save-business-role", {
      method: "POST",
      body: {
        id: roleId,
        name: roleName,
        description: row.querySelector(".role-description")?.value || "",
        aliases,
      },
    });
    await api("/api/admin/save-role-users", {
      method: "POST",
      body: {
        role_id: res.business_role.id,
        user_ids: userIds,
      },
    });
    upsertById("business_roles", res.business_role);
    (app.data.users || []).forEach((account) => {
      const current = (account.business_role_ids || []).filter((id) => id !== res.business_role.id);
      if (userIds.includes(account.id)) current.push(res.business_role.id);
      account.business_role_ids = current;
    });
    renderAdmin();
    setTimeout(() => showMessage("#roleMessage", `已保存：${roleName}，绑定 ${userIds.length} 个账号`, true), 0);
  } catch (err) {
    if (status) {
      status.textContent = err.message;
      status.className = "inline-status role-row-message error";
    }
    showMessage("#roleMessage", err.message);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function addBusinessRoleRow() {
  const tbody = qs("#businessRolesTbody");
  if (!tbody) return;
  const existingDraft = tbody.querySelector('tr[data-new-role="true"]');
  if (existingDraft) {
    existingDraft.querySelector(".role-name")?.focus();
    showMessage("#roleMessage", "已经有一行待保存的新角色，先保存或取消后再新增");
    return;
  }
  tbody.querySelector(".empty-role-row")?.remove();
  const users = app.data.users || [];
  const userOptions = checkboxOptions(
    users.map((u) => ({
      id: u.id,
      name: `${u.username}${u.person_id ? ` / ${personName(u.person_id)}` : ""}`,
    })),
    [],
    "user_ids",
    "暂无账号"
  );
  const row = document.createElement("tr");
  row.dataset.roleId = "";
  row.dataset.newRole = "true";
  row.innerHTML = `
    <td><input class="role-name compact-input" placeholder="例如：美国投手、售后客服" /></td>
    <td><textarea class="role-description compact-textarea" placeholder="这个角色主要负责什么业务"></textarea></td>
    <td><textarea class="role-aliases compact-textarea" placeholder="会议里可能怎么叫这个角色，多个用逗号或换行分隔"></textarea></td>
    <td><div class="checkbox-grid user-checkboxes">${userOptions}</div></td>
    <td class="role-action-cell">
      <div class="split-actions">
        <button type="button" class="plain-btn save-role-users">保存角色</button>
        <button type="button" class="plain-btn cancel-new-role">取消</button>
      </div>
      <span class="inline-status role-row-message"></span>
    </td>
  `;
  tbody.appendChild(row);
  row.querySelector(".save-role-users")?.addEventListener("click", saveRoleUsers);
  row.querySelector(".cancel-new-role")?.addEventListener("click", () => row.remove());
  row.querySelector(".role-name")?.focus();
  showMessage("#roleMessage", "已新增一行，填写后点这一行的保存角色", true);
}

async function deleteBusinessRole(event) {
  event.preventDefault();
  const row = event.currentTarget.closest("tr");
  const roleName = String(row.querySelector(".role-name")?.value || "这个角色").trim();
  if (!confirm(`确定删除业务角色「${roleName}」？删除后会同时解除这个角色和账号的绑定。`)) return;
  try {
    await api("/api/admin/delete-business-role", { method: "POST", body: { id: row.dataset.roleId } });
    removeById("business_roles", row.dataset.roleId);
    (app.data.users || []).forEach((account) => {
      account.business_role_ids = (account.business_role_ids || []).filter((id) => id !== row.dataset.roleId);
    });
    renderAdmin();
    setTimeout(() => showMessage("#roleMessage", `已删除业务角色：${roleName}`, true), 0);
  } catch (err) {
    showMessage("#roleMessage", err.message);
  }
}

async function savePerson(event) {
  event.preventDefault();
  collectPendingAliasInputs(event.currentTarget);
  const form = new FormData(event.currentTarget);
  const body = Object.fromEntries(form.entries());
  body.attends_weekly = body.attends_weekly === "true";
  body.needs_weekly_report = body.needs_weekly_report === "true";
  body.has_login = body.has_login === "true";
  body.meeting_aliases = String(body.meeting_aliases || "").split(/[,，\n]/).map((v) => v.trim()).filter(Boolean);
  body.mention_aliases = getAliasEditorValues(event.currentTarget, "mention_aliases");
  try {
    const res = await api("/api/admin/save-person", { method: "POST", body });
    upsertById("people", res.person);
    closePersonModal();
    renderAdmin();
    setTimeout(() => showMessage("#adminUserMessage", "人员资料已保存", true), 0);
  } catch (err) {
    showMessage("#personModalMessage", err.message);
  }
}

function openPersonModal(id) {
  const p = (app.data.people || []).find((item) => item.id === id);
  if (!p) return;
  const modal = qs("#personModal");
  const form = qs("#personModalForm");
  if (!modal || !form) return;
  form.reset();
  showMessage("#personModalMessage", "");
  for (const [key, value] of Object.entries(p)) {
    if (!form.elements[key]) continue;
    form.elements[key].value = Array.isArray(value) ? value.join(", ") : typeof value === "boolean" ? String(value) : value || "";
  }
  setAliasEditorValues(form, "mention_aliases", p.mention_aliases || []);
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  form.elements.display_name?.focus();
}

function closePersonModal() {
  const modal = qs("#personModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

document.addEventListener("click", (event) => {
  const addAlias = event.target.closest(".alias-add");
  if (addAlias) {
    addAliasValue(addAlias.closest(".alias-editor"));
    return;
  }
  const removeAlias = event.target.closest(".alias-remove");
  if (removeAlias) {
    removeAliasValue(removeAlias.closest(".alias-editor"), Number(removeAlias.dataset.index));
    return;
  }
  const nav = event.target.closest(".nav-btn");
  if (nav) {
    app.page = nav.dataset.page;
    renderPage();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !qs("#personModal")?.classList.contains("hidden")) {
    closePersonModal();
    return;
  }
  if (event.key !== "Enter" || !event.target.classList.contains("alias-input")) return;
  event.preventDefault();
  addAliasValue(event.target.closest(".alias-editor"));
});

qs("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    const res = await api("/api/login", { method: "POST", body });
    app.user = res.user;
    app.person = res.person;
    await refresh();
    renderAppShell();
  } catch (err) {
    showMessage("#authMessage", err.message);
  }
});

qs("#showRegisterBtn")?.addEventListener("click", () => {
  showMessage("#authMessage", "");
  setRegisterVisible(true);
});

qs("#hideRegisterBtn")?.addEventListener("click", () => {
  showMessage("#authMessage", "");
  qs("#registerForm")?.reset();
  setAliasEditorValues(qs("#registerForm"), "mention_aliases", []);
  setRegisterVisible(false);
});

qs("#registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    collectPendingAliasInputs(event.currentTarget);
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    body.business_role_ids = checkedValues(event.currentTarget, "business_role_ids");
    if (!body.business_role_ids.length) {
      showMessage("#authMessage", "注册时必须至少选择一个业务角色，提交后只能由管理员修改");
      return;
    }
    const res = await api("/api/register", { method: "POST", body });
    showMessage("#authMessage", res.message || "注册已提交", true);
    event.currentTarget.reset();
    setAliasEditorValues(event.currentTarget, "mention_aliases", []);
    renderRegisterBusinessRoles();
    setRegisterVisible(false);
  } catch (err) {
    showMessage("#authMessage", err.message);
  }
});

qs("#logoutBtn").addEventListener("click", async () => {
  try {
    await api("/api/logout", { method: "POST", body: {} });
  } finally {
    app.user = null;
    app.person = null;
    app.data = null;
    app.page = "dashboard";
    renderAuth();
  }
});

qs("#changePasswordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    await api("/api/change-password", { method: "POST", body });
    await loadMe();
  } catch (err) {
    alert(err.message);
  }
});

loadPublicConfig();
loadMe().catch(() => renderAuth());
