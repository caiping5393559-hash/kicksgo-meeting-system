const app = {
  user: null,
  person: null,
  data: null,
  publicRoles: [],
  storage: null,
  page: "dashboard",
  pendingTranscriptFile: null,
};

const AGENCY_OPS_ROLE_ID = "role_us_agency_ops";
const MEETING_HOST_ROLE_ID = "role_meeting_host";
const CN_ADMIN_ROLE_ID = "role_cn_admin";
const PARTNER_BOSS_ROLE_ID = "role_partner_boss";

const pages = [
  ["dashboard", "周会首页"],
  ["report", "美国代运营每周报表填写"],
  ["meeting_ops", "会议纪要与行动项"],
  ["my_actions", "我的行动项"],
  ["notes", "会前备注"],
  ["admin", "管理员"],
];

const part2Agenda = [
  ["8分钟", "美国代运营内部评估", "全体参会人", "大家一起讨论第一部分代运营周报信息，形成内部判断：人、货、流量、内容、价格、仓库。"],
  ["8分钟", "国内货品与采购", "深圳货品运营 / 深圳仓库", "先讲自己名下行动项状态，再讲会前备注，再讲爆款SKU、缺货SKU、补货进度、价格优势、下周直播支持。"],
  ["8分钟", "美国仓库与履约", "美国仓库", "先讲自己名下行动项状态，再讲会前备注，再讲24h发货率、延迟、错发漏发、退件丢件、是否支持爆单。"],
  ["6分钟", "财务与利润复盘", "深圳财务", "先讲自己名下行动项状态，再讲会前备注，再讲成本、利润、应收应付、回款、账务异常和需要决策事项。"],
  ["5分钟", "其他TikTok店铺与合作方", "美国自雇运营", "先讲自己名下行动项状态，再讲会前备注，再讲自营其他店、合作方店铺、继续供货或暂停建议。"],
  ["3分钟", "技术与系统", "国内技术", "系统开发、数据上传、API对接、权限问题。"],
  ["5分钟", "本周决策与下周行动项", "合伙人 / 会议主持人", "所有合伙人和会议主持人总结当前决策与下周行动项；每项必须明确负责人、截止日期、需要配合人。"],
];

const AGENDA_AGENCY = "美国代运营内部评估";
const AGENDA_DOMESTIC = "国内货品与采购";
const AGENDA_US_WAREHOUSE = "美国仓库与履约";
const AGENDA_FINANCE = "财务与利润复盘";
const AGENDA_PARTNERS = "其他TikTok店铺与合作方";
const AGENDA_TECH = "技术与系统";
const AGENDA_DECISION = "本周决策与下周行动项";

const roleAgendaMap = {
  role_us_self_ops: AGENDA_PARTNERS,
  role_us_agency_ops: AGENDA_AGENCY,
  role_us_warehouse: AGENDA_US_WAREHOUSE,
  role_sz_warehouse: AGENDA_DOMESTIC,
  role_sz_product_ops: AGENDA_DOMESTIC,
  role_sz_finance: AGENDA_FINANCE,
  role_cn_tech: AGENDA_TECH,
  role_meeting_host: AGENDA_DECISION,
  role_partner_boss: AGENDA_DECISION,
};

const reportSections = [
  ["1. 直播数据（周汇总）", [
    ["live_count", "直播次数"], ["live_hours", "直播总时长"], ["live_gmv", "直播GMV / 可归因GMV"],
    ["live_orders", "直播订单量"], ["auction_gmv", "拍卖GMV"], ["buy_now_gmv", "立即购买GMV"],
    ["audience_count", "观众数"], ["exposure_count", "曝光量"], ["product_view_count", "商品浏览量"],
    ["avg_watch_duration", "平均观看时长"], ["live_click_rate", "直播点击率"], ["sku_order_rate", "SKU订单率"],
    ["live_summary", "直播结论/异常说明", "textarea"],
  ]],
  ["2. 非直播数据（周汇总）", [
    ["non_live_gmv", "非直播GMV"], ["non_live_orders", "非直播订单量"], ["short_video_pct", "短视频占比"],
    ["organic_pct", "自然流量占比"], ["search_pct", "搜索流量占比"], ["video_count", "本周视频数"],
    ["viral_video_count", "爆款视频数"], ["avg_views", "平均播放量"], ["affiliate_gmv", "达人带货GMV"],
    ["non_live_conclusion", "非直播增长能力", "select", ["强", "中", "弱"]],
    ["non_live_summary", "非直播结论/异常说明", "textarea"],
  ]],
];

function qs(selector) {
  return document.querySelector(selector);
}

function scrollToPageTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  qs(".main")?.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",", 2)[1] || "");
    reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function isDocxFile(file) {
  return /\.docx$/i.test(file?.name || "");
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

function canFillAgencyReport() {
  return hasBusinessRole(AGENCY_OPS_ROLE_ID);
}

function canViewAgencyReportPage() {
  return canFillAgencyReport() || ["admin", "manager"].includes(app.user?.role) || hasBusinessRole(PARTNER_BOSS_ROLE_ID);
}

function canSelectAgencyReportPerson() {
  return ["admin", "manager"].includes(app.user?.role) || hasBusinessRole(PARTNER_BOSS_ROLE_ID);
}

function canManageActions() {
  return ["admin", "manager"].includes(app.user?.role) || hasBusinessRole(MEETING_HOST_ROLE_ID) || hasBusinessRole(CN_ADMIN_ROLE_ID);
}

function canViewReadingRecords() {
  return ["admin", "manager"].includes(app.user?.role) || hasBusinessRole(MEETING_HOST_ROLE_ID) || hasBusinessRole(PARTNER_BOSS_ROLE_ID);
}

function isAgencyOnlyUser(user = app.user) {
  const roleIds = (user?.business_role_ids || []).filter(Boolean);
  return roleIds.includes(AGENCY_OPS_ROLE_ID) && !roleIds.some((roleId) => roleId !== AGENCY_OPS_ROLE_ID);
}

function canViewRawTranscripts() {
  return canManageActions() || !isAgencyOnlyUser();
}

function canViewTranscripts() {
  return Boolean(app.user);
}

function userDisplayName(user) {
  return personName(user?.person_id) || user?.username || "";
}

function roleAgendaTitle(role) {
  if (!role) return AGENDA_DECISION;
  if (roleAgendaMap[role.id]) return roleAgendaMap[role.id];
  const text = `${role.name || ""} ${role.category || ""} ${role.description || ""} ${(role.aliases || []).join(" ")}`.toLowerCase();
  if (/美国仓库|us warehouse|履约|物流/.test(text)) return AGENDA_US_WAREHOUSE;
  if (/财务|利润|成本|账务|应收|应付|回款/.test(text)) return AGENDA_FINANCE;
  if (/深圳仓库|国内仓库|深圳货品|采购|货品|供应链/.test(text)) return AGENDA_DOMESTIC;
  if (/技术|系统|数据|自动化/.test(text)) return AGENDA_TECH;
  if (/代运营|自雇运营|直播|主播|达人/.test(text)) return AGENDA_AGENCY;
  if (/合作|店铺|tiktok|ken|诺诺|渠道/.test(text)) return AGENDA_PARTNERS;
  if (/行政|纪要|归档/.test(text)) return "";
  return AGENDA_DECISION;
}

function roleIdsForPerson(personId) {
  return (app.data?.users || [])
    .filter((user) => user.person_id === personId && user.status !== "disabled")
    .flatMap((user) => user.business_role_ids || []);
}

function agendaTitleForRoleIds(roleIds = []) {
  const roles = roleIds
    .map((id) => (app.data?.business_roles || []).find((role) => role.id === id))
    .filter(Boolean);
  return roles.length ? roleAgendaTitle(roles[0]) : "";
}

function noteAgendaTitle(note) {
  const known = part2Agenda.map((row) => row[1]);
  if (known.includes(note?.module)) return note.module;
  const byRole = agendaTitleForRoleIds(roleIdsForPerson(note?.person_id));
  if (byRole) return byRole;
  const text = String(note?.module || "");
  if (/仓库|物流|履约/.test(text)) return AGENDA_US_WAREHOUSE;
  if (/财务|利润|成本|账务|应收|应付|回款/.test(text)) return AGENDA_FINANCE;
  if (/货品|采购/.test(text)) return AGENDA_DOMESTIC;
  if (/技术|系统/.test(text)) return AGENDA_TECH;
  if (/合作|店铺|达人/.test(text)) return AGENDA_PARTNERS;
  return AGENDA_DECISION;
}

function agendaRoleBindingsHtml(agendaTitle) {
  if (agendaTitle === AGENDA_AGENCY) {
    return `
      <div class="agenda-role-card">
        <strong>全体参会人</strong>
        <span>共同讨论</span>
      </div>
    `;
  }
  const roles = (app.data?.business_roles || []).filter((role) => roleAgendaTitle(role) === agendaTitle);
  if (!roles.length) return `<span class="muted">暂无对应角色</span>`;
  return roles.map((role) => {
    const boundUsers = (app.data?.users || [])
      .filter((user) => user.status !== "disabled" && (user.business_role_ids || []).includes(role.id))
      .map((user) => userDisplayName(user))
      .filter(Boolean);
    return `
      <div class="agenda-owner-line">
        <strong>${escapeHtml(role.name || role.id)}</strong>
        <span>${escapeHtml(boundUsers.join("、") || "未绑定用户")}</span>
      </div>
    `;
  }).join("");
}

function agendaNotesHtml(agendaTitle, meetingId) {
  const notes = (app.data?.pre_meeting_notes || [])
    .filter((note) => note.meeting_id === meetingId && noteAgendaTitle(note) === agendaTitle && String(note.question || "").trim());
  if (!notes.length) return "";
  const tooltip = notes.map((note) => `${personName(note.person_id) || "未绑定人员"}：${note.question || ""}`).join("\n");
  return `
    <div class="agenda-notes-hover" title="${escapeHtml(tooltip)}">
      <span class="tag amber">会前备注 ${notes.length} 条</span>
      <div class="agenda-notes-popover">
      ${notes.map((note) => `
        <div class="agenda-note">
          <strong>${escapeHtml(personName(note.person_id) || "未绑定人员")}：</strong>
          <p>${escapeHtml(note.question || "")}</p>
        </div>
      `).join("")}
      </div>
    </div>
  `;
}

function registeredPersonOptions(selectedId = "", emptyText = "待定") {
  const users = app.data?.users || [];
  const peopleById = new Map((app.data?.people || []).map((p) => [p.id, p]));
  const seenPersonIds = new Set();
  const options = [];
  users.forEach((user) => {
    if (user.status === "disabled" || !user.person_id || seenPersonIds.has(user.person_id)) return;
    const person = peopleById.get(user.person_id);
    if (!person) return;
    seenPersonIds.add(user.person_id);
    const personLabel = person.display_name || person.real_name || person.chinese_name || person.id;
    const label = user.username && user.username !== personLabel ? `${user.username} / ${personLabel}` : personLabel;
    options.push(`<option value="${escapeHtml(person.id)}" ${person.id === selectedId ? "selected" : ""}>${escapeHtml(label)}</option>`);
  });
  if (selectedId && !seenPersonIds.has(selectedId)) {
    options.push(`<option value="${escapeHtml(selectedId)}" selected>${escapeHtml(personName(selectedId) || selectedId)}（未绑定注册账号）</option>`);
  }
  return `<option value="">${escapeHtml(emptyText)}</option>${options.join("")}`;
}

function ensurePersonSelectValue(select, personId) {
  if (!select || !personId || Array.from(select.options).some((option) => option.value === personId)) return;
  const option = document.createElement("option");
  option.value = personId;
  option.textContent = `${personName(personId) || personId}（未绑定注册账号）`;
  select.appendChild(option);
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

function meetingTimestamp(meeting) {
  if (meeting?.start_at_utc) {
    const startAt = new Date(meeting.start_at_utc).getTime();
    if (!Number.isNaN(startAt)) return startAt;
  }
  if (!meeting?.us_date) return 0;
  const value = new Date(`${meeting.us_date}T${meeting.us_time || "23:59"}:00`).getTime();
  return Number.isNaN(value) ? 0 : value;
}

function sortedMeetingsByTime() {
  return [...(app.data?.meetings || [])].sort((a, b) => {
    const timeA = meetingTimestamp(a);
    const timeB = meetingTimestamp(b);
    if (timeA && timeB && timeA !== timeB) return timeA - timeB;
    if (timeA && !timeB) return -1;
    if (!timeA && timeB) return 1;
    return String(a.title || a.id || "").localeCompare(String(b.title || b.id || ""));
  });
}

function currentMeeting() {
  const meetings = sortedMeetingsByTime();
  const now = Date.now();
  const next = meetings.find((meeting) => meetingTimestamp(meeting) && meetingTimestamp(meeting) >= now);
  if (next) return next;
  return [...meetings].reverse().find((meeting) => meetingTimestamp(meeting)) || meetings[meetings.length - 1] || null;
}

function previousMeeting() {
  const meetings = sortedMeetingsByTime();
  const current = currentMeeting();
  const currentTime = meetingTimestamp(current);
  if (currentTime) {
    const previous = [...meetings].reverse().find((meeting) => meeting.id !== current?.id && meetingTimestamp(meeting) && meetingTimestamp(meeting) < currentTime);
    if (previous) return previous;
  }
  const index = meetings.findIndex((meeting) => meeting.id === current?.id);
  return index > 0 ? meetings[index - 1] : null;
}

function lastOccurredMeeting() {
  const now = Date.now();
  const meetings = sortedMeetingsByTime();
  const past = meetings
    .filter((meeting) => meetingTimestamp(meeting) && meetingTimestamp(meeting) <= now)
    .sort((a, b) => meetingTimestamp(b) - meetingTimestamp(a));
  if (past[0]) return past[0];
  const statusPast = meetings
    .filter((meeting) => meeting.status === "已开会")
    .sort((a, b) => meetingTimestamp(b) - meetingTimestamp(a));
  if (statusPast[0]) return statusPast[0];
  return past[0] || previousMeeting() || currentMeeting();
}

function occurredMeetings() {
  const meetings = sortedMeetingsByTime()
    .filter((meeting) => meetingStarted(meeting))
    .sort((a, b) => meetingTimestamp(b) - meetingTimestamp(a));
  const fallback = lastOccurredMeeting();
  if (!meetings.length && fallback) return [fallback];
  return meetings;
}

function meetingStarted(meeting) {
  if (!meeting) return false;
  if (meeting.status === "待开会") return false;
  if (meeting.status === "进行中" || meeting.status === "已开会") return true;
  const timestamp = meetingTimestamp(meeting);
  return Boolean(timestamp) && Date.now() >= timestamp;
}

function transcriptMetricText(uploaded, meeting) {
  if (uploaded) return "已上传";
  return meetingStarted(meeting) ? "待上传" : "会后上传";
}

function transcriptRecordsFor(meetingId, part) {
  return (app.data.transcript_uploads || [])
    .filter((record) => record.meeting_id === meetingId && record.part === part)
    .sort((a, b) => String(b.uploaded_at || "").localeCompare(String(a.uploaded_at || "")));
}

function latestTranscriptRecord(meetingId, part) {
  return transcriptRecordsFor(meetingId, part)[0] || null;
}

function transcriptMinutesText(record) {
  return record?.minutes_final || record?.minutes_draft || "";
}

function transcriptMinutesStatus(record) {
  if (!record || record.part !== "part1") return "";
  if (record.minutes_status === "final" && record.minutes_final) return "正式纪要";
  if (record.minutes_draft) return "AI草稿";
  return "未生成";
}

function minutesReaders(recordId) {
  const latestByUser = new Map();
  (app.data?.minutes_view_logs || [])
    .filter((log) => log.transcript_id === recordId)
    .forEach((log) => {
      const key = log.user_id || log.person_id || log.username || log.id;
      const current = latestByUser.get(key);
      if (!current || String(log.viewed_at || "") > String(current.viewed_at || "")) {
        latestByUser.set(key, log);
      }
    });
  return [...latestByUser.values()].sort((a, b) => String(b.viewed_at || "").localeCompare(String(a.viewed_at || "")));
}

function minutesReadersHtml(recordId) {
  const readers = minutesReaders(recordId);
  if (!readers.length) return `<p class="muted small-note">暂时还没有人打开查看完整会议纪要。</p>`;
  return `
    <div class="read-log-line">
      <strong>已查看完整纪要：</strong>
      ${readers.map((log) => `<span class="tag">${escapeHtml(personName(log.person_id) || log.username || "未知")} · ${escapeHtml(log.viewed_at || "")}</span>`).join("")}
    </div>
  `;
}

function actionNotesText(action) {
  return action?.notes || [action?.time_type, action?.time_note].filter(Boolean).join("；") || "-";
}

function actionReadStatusRowsHtml() {
  const users = (app.data?.users || []).filter((user) => user.status !== "disabled");
  if (!users.length) return '<tr><td colspan="4" class="muted">暂无账号</td></tr>';
  return users.map((user) => `
    <tr>
      <td>${escapeHtml(user.username || "")}</td>
      <td>${escapeHtml(personName(user.person_id) || "-")}</td>
      <td>${escapeHtml(userBusinessRoleNames(user))}</td>
      <td>${escapeHtml(user.last_my_actions_viewed_at || "未查看")}</td>
    </tr>
  `).join("");
}

function readingRecordsPanelHtml() {
  if (!canViewReadingRecords()) return "";
  return `
    <div class="panel compact-read-panel">
      <h2>阅读记录</h2>
      <p class="hint">管理员、合伙人、会议主持人可查看。用于确认会后是否有人打开完整纪要，以及是否查看过自己的行动项。</p>
      <div class="table-wrap compact-table-wrap">
        <table>
          <thead><tr><th>账号</th><th>人员</th><th>业务角色</th><th>最后查看我的行动项</th></tr></thead>
          <tbody>${actionReadStatusRowsHtml()}</tbody>
        </table>
      </div>
    </div>
  `;
}

function transcriptPartStatusHtml(meetingId, part) {
  const records = transcriptRecordsFor(meetingId, part);
  if (!records.length) return '<span class="tag red">未上传</span>';
  const latest = records[0];
  const status = latest.parse_status === "failed"
    ? '<span class="tag red">需重新上传</span>'
    : part === "part1"
      ? `<span class="tag ${latest.minutes_status === "final" ? "green" : "amber"}">${escapeHtml(transcriptMinutesStatus(latest))}</span>`
      : '<span class="tag green">已上传</span>';
  return `
    ${status}
    <button class="plain-btn view-transcript" data-id="${escapeHtml(latest.id)}">${part === "part1" ? "查看纪要" : "查看最新"}</button>
    <div class="muted">${escapeHtml(latest.original_filename || latest.title || "")}</div>
    ${latest.parse_message ? `<div class="message error">${escapeHtml(latest.parse_message)}</div>` : ""}
  `;
}

function meetingHistoryRows() {
  const meetings = occurredMeetings();
  return meetings.map((meeting) => {
    const records = (app.data.transcript_uploads || []).filter((record) => record.meeting_id === meeting.id);
    const latest = [...records].sort((a, b) => String(b.uploaded_at || "").localeCompare(String(a.uploaded_at || "")))[0];
    return `
      <tr>
        <td>${escapeHtml(meeting.title || meeting.name || meeting.id)}</td>
        <td>${escapeHtml([meeting.us_date, meeting.us_time].filter(Boolean).join(" "))}</td>
        <td>${transcriptPartStatusHtml(meeting.id, "part1")}</td>
        <td>${transcriptPartStatusHtml(meeting.id, "part2")}</td>
        <td>${records.length ? `已处理 / ${escapeHtml(latest?.uploaded_at || "")}` : '<span class="muted">未上传</span>'}</td>
      </tr>
    `;
  }).join("") || '<tr><td colspan="5" class="muted">暂无会议</td></tr>';
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

function markAttention(element, className = "attention-target", timeout = 12000) {
  if (!element) return;
  element.classList.add(className);
  setTimeout(() => element.classList.remove(className), timeout);
}

function focusUploadedTranscript(record) {
  if (!record?.id) return;
  const button = Array.from(document.querySelectorAll(".view-transcript"))
    .find((btn) => btn.dataset.id === record.id);
  if (!button) return;
  const tipText = record.part === "part1" ? "点这里查看会议纪要草稿" : "点这里查看行动项初稿";
  button.parentElement?.querySelector(".inline-action-tip")?.remove();
  const tip = document.createElement("span");
  tip.className = "inline-action-tip";
  tip.textContent = tipText;
  button.insertAdjacentElement("afterend", tip);
  markAttention(button);
  button.focus({ preventScroll: true });
  button.scrollIntoView({ behavior: "smooth", block: "center" });
}

function scrollToDraftForTranscript(record) {
  if (!record?.id) return false;
  const card = Array.from(document.querySelectorAll(".draft-card"))
    .find((item) => item.dataset.transcriptId === record.id);
  if (!card) return false;
  markAttention(card, "attention-panel");
  card.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

function setBusy(button, text = "保存中...") {
  if (!button) return () => {};
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = text;
  return () => {
    button.disabled = false;
    button.textContent = originalText;
  };
}

function submitButton(form) {
  return form?.querySelector('button[type="submit"]');
}

function renderAuth() {
  qs("#authView").classList.remove("hidden");
  qs("#appView").classList.add("hidden");
  setRegisterVisible(false);
  initAliasEditors(qs("#authView"));
  renderRegisterBusinessRoles();
  scrollToPageTop();
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
  const visiblePages = pages.filter(([key]) => {
    if (key === "admin") return app.user?.role === "admin";
    if (key === "report") return canViewAgencyReportPage();
    if (key === "meeting_ops") return canViewTranscripts();
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
  if (app.page === "dashboard") renderDashboard();
  if (app.page === "meetings") renderMeetings();
  if (app.page === "report") renderReport();
  if (app.page === "notes") renderNotes();
  if (app.page === "meeting_ops" || app.page === "transcripts" || app.page === "action_manage") renderMeetingOps();
  if (app.page === "my_actions") renderMyActions();
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
  scrollToPageTop();
}

function agencyReportPersonIds() {
  const ids = (app.data.users || [])
    .filter((u) => (u.business_role_ids || []).includes(AGENCY_OPS_ROLE_ID))
    .map((u) => u.person_id)
    .filter(Boolean);
  if (ids.length) return [...new Set(ids)];
  const fallbackKyle = (app.data.people || []).find((p) => p.id === "person_kyle") || {};
  return fallbackKyle.id ? [fallbackKyle.id] : [];
}

function agencyReports() {
  const reportPersonIds = agencyReportPersonIds();
  return (app.data.weekly_reports || [])
    .filter((report) => reportPersonIds.includes(report.person_id))
    .sort((a, b) => meetingTimestamp((app.data.meetings || []).find((m) => m.id === b.meeting_id)) - meetingTimestamp((app.data.meetings || []).find((m) => m.id === a.meeting_id)));
}

function reportNumericValue(report, key) {
  const metric = Number(report?.metrics?.[key]);
  if (Number.isFinite(metric)) return metric;
  const raw = String(report?.fields?.[key] || "").trim();
  if (!raw) return 0;
  let text = raw
    .replace(/,/g, "")
    .replace(/，/g, "")
    .replace(/\$/g, "")
    .replace(/＄/g, "")
    .replace(/美元|美金|USD|usd/g, "");
  const match = text.match(/[-+]?\d+(?:\.\d+)?/);
  if (!match) return 0;
  let value = Number(match[0]);
  if (!Number.isFinite(value)) return 0;
  const lower = text.toLowerCase();
  if (/\d\s*(k|千)/.test(lower)) value *= 1000;
  else if (/\d\s*(m|million|百万|百萬)/.test(lower)) value *= 1000000;
  else if (/\d\s*(b|billion|十亿|十億)/.test(lower)) value *= 1000000000;
  else if (/\d\s*万/.test(lower)) value *= 10000;
  return value;
}

function autoFillReportTotals(fields) {
  const liveGmv = reportNumericValue({ fields }, "live_gmv");
  const nonLiveGmv = reportNumericValue({ fields }, "non_live_gmv");
  const liveOrders = reportNumericValue({ fields }, "live_orders");
  const nonLiveOrders = reportNumericValue({ fields }, "non_live_orders");
  const totalGmv = liveGmv + nonLiveGmv;
  const totalOrders = liveOrders + nonLiveOrders;
  if (totalGmv > 0) fields.total_gmv = String(Number(totalGmv.toFixed(2)));
  if (totalOrders > 0) fields.total_orders = String(Number(totalOrders.toFixed(2)));
  if (totalGmv > 0 && totalOrders > 0) fields.aov = String(Number((totalGmv / totalOrders).toFixed(2)));
  return fields;
}

function formatCompareMetric(value, prefix = "", suffix = "") {
  if (!Number.isFinite(value) || value === 0) return "-";
  const formatted = value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return `${prefix}${formatted}${suffix}`;
}

function weeklyReportCompareHtml(reports) {
  const rows = reports.slice().reverse().slice(-8);
  if (!rows.length) return `<p class="muted">暂无已保存的美国代运营每周报表，保存后这里会出现对比。</p>`;
  const metrics = [
    ["total_gmv", "总GMV", "$", ""],
    ["total_orders", "总订单量", "", ""],
    ["live_gmv", "直播GMV", "$", ""],
    ["live_orders", "直播订单量", "", ""],
    ["non_live_gmv", "非直播GMV", "$", ""],
    ["non_live_orders", "非直播订单量", "", ""],
    ["auction_gmv", "拍卖GMV", "$", ""],
    ["audience_count", "观众数", "", ""],
    ["exposure_count", "曝光量", "", ""],
    ["live_click_rate", "直播点击率", "", "%"],
    ["sku_order_rate", "SKU订单率", "", "%"],
    ["avg_watch_duration", "平均观看时长", "", "秒"],
    ["affiliate_gmv", "达人GMV", "$", ""],
  ];
  return `
    <div class="compare-grid">
      ${metrics.map(([key, label, prefix, suffix]) => {
        const max = Math.max(...rows.map((report) => reportNumericValue(report, key)), 1);
        return `
          <div class="compare-card">
            <h3>${escapeHtml(label)}</h3>
            ${rows.map((report) => {
              const value = reportNumericValue(report, key);
              const pct = Math.max(3, Math.round((value / max) * 100));
              return `
                <div class="compare-row">
                  <span>${escapeHtml(meetingName(report.meeting_id).replace(" Kicksgo 周会", ""))}</span>
                  <div class="compare-bar"><i style="width:${pct}%"></i></div>
                  <strong>${escapeHtml(formatCompareMetric(value, prefix, suffix))}</strong>
                </div>
              `;
            }).join("")}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function agencyReportHistoryHtml(reports) {
  if (!reports.length) return `<tr><td colspan="5" class="muted">暂无历史报表</td></tr>`;
  return reports.map((report) => `
    <tr>
      <td>${escapeHtml(meetingName(report.meeting_id))}</td>
      <td>${escapeHtml(personName(report.person_id))}</td>
      <td>${escapeHtml(report.fields?.total_gmv || "-")}</td>
      <td>${escapeHtml(report.updated_at || report.created_at || "")}</td>
      <td><button type="button" class="plain-btn open-agency-report" data-meeting-id="${escapeHtml(report.meeting_id || "")}" data-person-id="${escapeHtml(report.person_id || "")}">查看</button></td>
    </tr>
  `).join("");
}

function previousPart1MinutesHtml(previousMeetingRecord) {
  const record = previousMeetingRecord ? latestTranscriptRecord(previousMeetingRecord.id, "part1") : null;
  const minutes = transcriptMinutesText(record);
  if (!record) {
    return `<p class="muted">上周第一段会议文字还没有上传，上传后这里会显示 AI 会议纪要。</p>`;
  }
  return `
    <div class="section-title compact-section-title">
      <span class="tag ${record.minutes_status === "final" ? "green" : "amber"}">${escapeHtml(transcriptMinutesStatus(record))}</span>
      <button type="button" class="plain-btn view-transcript" data-id="${escapeHtml(record.id)}">打开纪要</button>
    </div>
    <pre class="minutes-preview">${escapeHtml(minutes || "已上传，但还没有生成纪要。")}</pre>
    ${minutesReadersHtml(record.id)}
  `;
}

function part1MinutesHistory() {
  const recordsByMeeting = new Map();
  (app.data.transcript_uploads || [])
    .filter((record) => record.part === "part1" && transcriptMinutesText(record))
    .forEach((record) => {
      const existing = recordsByMeeting.get(record.meeting_id);
      if (!existing || String(record.uploaded_at || "") > String(existing.uploaded_at || "")) {
        recordsByMeeting.set(record.meeting_id, record);
      }
    });
  return [...recordsByMeeting.values()]
    .map((record) => ({
      record,
      meeting: (app.data.meetings || []).find((meeting) => meeting.id === record.meeting_id),
    }))
    .filter((item) => item.meeting && (item.meeting.status === "已开会" || meetingTimestamp(item.meeting) <= Date.now()))
    .sort((a, b) => meetingTimestamp(b.meeting) - meetingTimestamp(a.meeting));
}

function part1MinutesHistoryHtml() {
  const rows = part1MinutesHistory();
  if (!rows.length) return `<p class="muted">暂无历史第一段会议纪要。</p>`;
  return `
    <details class="compact-archive minutes-history" open>
      <summary>历史第一段会议纪要</summary>
      <div class="table-wrap compact-table-wrap">
        <table>
          <thead><tr><th>会议</th><th>纪要状态</th><th>查看人数</th><th>更新时间</th><th>操作</th></tr></thead>
          <tbody>
            ${rows.map(({ meeting, record }) => `
              <tr>
                <td>${escapeHtml(meeting.title || meeting.name || meeting.id)}</td>
                <td><span class="tag ${record.minutes_status === "final" ? "green" : "amber"}">${escapeHtml(transcriptMinutesStatus(record))}</span></td>
                <td>${minutesReaders(record.id).length} 人</td>
                <td>${escapeHtml(record.minutes_updated_at || record.uploaded_at || "")}</td>
                <td><button type="button" class="plain-btn view-transcript" data-id="${escapeHtml(record.id)}">查看纪要</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </details>
  `;
}

function fallbackMeetingLinks(links = []) {
  const existing = Array.isArray(links) ? links.filter(Boolean) : [];
  const primary = existing.find((link) => link.id === "link_weekly") || existing[0];
  if (primary) {
    return [{
      ...primary,
      id: primary.id || "link_weekly",
      part: "full",
      title: primary.title || "Kicksgo 每周腾讯会议",
      notes: primary.notes || "会员会议，一次开完整场周会。系统上传一次完整文字记录后自动拆分纪要和行动项。",
    }];
  }
  return [
    { id: "link_weekly", part: "full", title: "Kicksgo 每周腾讯会议", url: "", meeting_id: "", password: "", host: "会议主持人", notes: "会员会议，一次开完整场周会。系统上传一次完整文字记录后自动拆分纪要和行动项。" },
  ];
}

function meetingLinksDisplayHtml(links = []) {
  return `
    <div class="link-list dashboard-links compact-dashboard-links">
      ${fallbackMeetingLinks(links).map((link) => `
        <div class="meeting-link compact-meeting-link">
          <strong>${escapeHtml(link.title)}</strong>
          <div>${link.url ? `<a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.url)}</a>` : '<span class="muted">暂未填写链接</span>'}</div>
          <div class="muted">会议号：${escapeHtml(link.meeting_id || "-")}　密码：${escapeHtml(link.password || "-")}</div>
          ${link.host || link.notes ? `<div class="muted">主持/备注：${escapeHtml([link.host, link.notes].filter(Boolean).join("；"))}</div>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function meetingLinksEditFormHtml(links = []) {
  const safeLinks = fallbackMeetingLinks(links);
  return `
    <form id="dashboardMeetingLinksForm" class="meeting-links-form">
      ${safeLinks.map((link, index) => `
        <div class="meeting-link-edit" data-index="${index}" data-id="${escapeHtml(link.id || "")}" data-part="${escapeHtml(link.part || "")}">
          <h3>${escapeHtml(link.title || `会议链接 ${index + 1}`)}</h3>
          <div class="form-grid two">
            <label>标题<input class="link-title" value="${escapeHtml(link.title || "")}" /></label>
            <label>主持/负责人<input class="link-host" value="${escapeHtml(link.host || "")}" /></label>
            <label class="field-wide">腾讯会议链接<input class="link-url" value="${escapeHtml(link.url || "")}" placeholder="https://meeting.tencent.com/..." /></label>
            <label>会议号<input class="link-meeting-id" value="${escapeHtml(link.meeting_id || "")}" /></label>
            <label>密码<input class="link-password" value="${escapeHtml(link.password || "")}" /></label>
            <label class="field-wide">备注<textarea class="link-notes">${escapeHtml(link.notes || "")}</textarea></label>
          </div>
        </div>
      `).join("")}
      <div class="split-actions" style="margin-top:12px">
        <button type="submit">保存腾讯会议设置</button>
        <span id="meetingLinksMessage" class="message"></span>
      </div>
    </form>
  `;
}

function compactMeetingArchiveHtml() {
  const meetings = [...(app.data.meetings || [])]
    .sort((a, b) => meetingTimestamp(b) - meetingTimestamp(a))
    .slice(0, 6);
  return `
    <details class="compact-archive">
      <summary>每周会议档案</summary>
      <div class="table-wrap compact-table-wrap">
        <table>
          <thead><tr><th>会议</th><th>状态</th><th>美国时间</th><th>中国时间</th></tr></thead>
          <tbody>
            ${meetings.map((m) => `
              <tr>
                <td>${escapeHtml(m.title || m.name || m.id)}</td>
                <td>${escapeHtml(m.status || "-")}</td>
                <td>${escapeHtml([m.us_date, m.us_time].filter(Boolean).join(" ") || "-")}</td>
                <td>${escapeHtml([m.cn_date, m.cn_time].filter(Boolean).join(" ") || "-")}</td>
              </tr>
            `).join("") || '<tr><td colspan="4" class="muted">暂无会议档案</td></tr>'}
          </tbody>
        </table>
      </div>
    </details>
  `;
}

function dashboardMeetingLinksHtml(links = []) {
  const safeLinks = fallbackMeetingLinks(links);
  return `
    <div class="meeting-dashboard-block">
      ${meetingLinksDisplayHtml(safeLinks)}
      <div class="split-actions compact-dashboard-actions">
        ${canManageActions() ? '<button type="button" class="plain-btn" id="openMeetingLinksModal">设置腾讯会议</button>' : ""}
        <span id="dashboardMeetingStatus" class="message"></span>
      </div>
      ${compactMeetingArchiveHtml()}
    </div>
    ${canManageActions() ? `
      <div id="meetingLinksModal" class="modal-backdrop hidden" aria-hidden="true">
        <div class="modal-panel meeting-links-modal">
          <div class="section-title">
            <div>
              <h2>腾讯会议设置</h2>
              <p class="muted">这里只维护固定会议链接、会议号和密码。保存后首页只显示简版信息。</p>
            </div>
            <button type="button" class="plain-btn" id="closeMeetingLinksModal">关闭</button>
          </div>
          ${meetingLinksEditFormHtml(safeLinks)}
        </div>
      </div>
    ` : ""}
  `;
}

function renderDashboard() {
  const meeting = currentMeeting();
  const prev = previousMeeting();
  const links = app.data.settings?.meeting_links || [];
  const reports = app.data.weekly_reports || [];
  const actions = app.data.action_items || [];
  const reportPersonIds = agencyReportPersonIds();
  const historyReports = agencyReports();
  const report = reports.find((r) => r.meeting_id === meeting?.id && reportPersonIds.includes(r.person_id));
  const reportStatus = report ? "已填写" : meeting?.kyle_report_required ? "待填写" : "不强制";
  const reportAction = report
    ? `<button type="button" class="plain-btn metric-action open-agency-report" data-meeting-id="${escapeHtml(meeting?.id || "")}" data-person-id="${escapeHtml(report.person_id || "")}">查看</button>`
    : canFillAgencyReport()
      ? `<button type="button" class="plain-btn metric-action open-agency-report" data-meeting-id="${escapeHtml(meeting?.id || "")}" data-person-id="${escapeHtml(app.user?.person_id || "")}">去填写</button>`
      : "";
  const previousActions = actions.filter((a) => a.meeting_id === prev?.id);
  setTitle("周会首页", "腾讯会议设置、美国代运营周会、内部经营复盘流程。");
  qs("#content").innerHTML = `
    <div class="grid">
      <div class="panel">
        <div class="section-title">
          <div>
            <h2>一、腾讯会议设置和显示</h2>
            <p class="muted">只显示会议入口；需要修改时点设置按钮。</p>
          </div>
          <span class="tag ${meeting?.status === "已开会" ? "green" : "amber"}">${escapeHtml(meeting?.status || "")}</span>
        </div>
        <div class="meeting-compact-meta">
          <strong>${escapeHtml(meeting?.title || "暂无会议")}</strong>
          <span>美国时间 ${escapeHtml(meeting?.us_date || "")} ${escapeHtml(meeting?.us_time || "")} / 中国时间 ${escapeHtml(meeting?.cn_date || "")} ${escapeHtml(meeting?.cn_time || "")}</span>
        </div>
        ${dashboardMeetingLinksHtml(links)}
        <p class="muted" style="margin-top:12px">${escapeHtml(meeting?.notes || "")}</p>
      </div>

      <div class="panel">
        <div class="section-title">
          <div>
            <h2>二、美国代运营周会</h2>
            <p class="muted">第一段会议围绕美国代运营每周报表和上周第一段会议纪要展开。</p>
          </div>
        </div>
        <div class="agency-weekly-stack">
          <div class="stack-section">
            <h3>上周第一段会议纪要</h3>
            ${previousPart1MinutesHtml(prev)}
            ${part1MinutesHistoryHtml()}
          </div>
          <div class="stack-section">
            <h3>美国代运营每周报表</h3>
            <div class="metric-row two-metrics">
              <div class="metric"><span>本周填写状态</span><strong>${reportStatus}</strong>${reportAction}</div>
              <div class="metric"><span>历史报表</span><strong>${historyReports.length} 份</strong></div>
            </div>
            <div class="table-wrap compact-table-wrap">
              <table>
                <thead><tr><th>会议</th><th>填写人</th><th>GMV</th><th>更新时间</th><th>操作</th></tr></thead>
                <tbody>${agencyReportHistoryHtml(historyReports)}</tbody>
              </table>
            </div>
            <div class="split-actions report-compare-actions">
              <button type="button" class="plain-btn" id="toggleWeeklyCompare">每周对比</button>
            </div>
            <div id="agencyReportCompare" class="compare-panel hidden">
              <h3>美国代运营每周报表对比</h3>
              ${weeklyReportCompareHtml(historyReports)}
            </div>
          </div>
        </div>
        <div id="transcriptViewer" class="panel transcript-viewer nested-viewer hidden"></div>
      </div>

      ${readingRecordsPanelHtml()}

      <div class="panel">
        <h2>三、内部经营复盘会流程</h2>
        <div class="agenda-action-reference">
          <h3>上周行动项状态参考</h3>
          <p class="hint">放在第二部分流程里看。各业务板块发言时先讲自己名下行动项状态：是否完成；未完成什么时候完成、需要谁配合。主持人最后统一总结。</p>
          <div class="table-wrap">
            <table>
              <thead><tr><th>事项</th><th>负责人</th><th>状态</th><th>截止</th></tr></thead>
              <tbody>
                ${previousActions.slice(0, 10).map((a) => `
                  <tr><td>${escapeHtml(a.title)}</td><td>${escapeHtml(personName(a.owner_person_id) || a.owner_text)}</td><td>${escapeHtml(a.status)}</td><td>${escapeHtml(a.due_date)}</td></tr>
                `).join("") || '<tr><td colspan="4" class="muted">暂无上周行动项</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
        <div class="agenda">
          ${part2Agenda.map((row) => `
            <div class="agenda-row">
              <span class="tag">${row[0]}</span>
              <div>
                <strong>${escapeHtml(row[1])}</strong><br>
                <span class="muted">${escapeHtml(row[3])}</span>
                ${agendaNotesHtml(row[1], meeting?.id)}
              </div>
              <div class="agenda-owner">${agendaRoleBindingsHtml(row[1])}</div>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
  document.querySelectorAll(".open-agency-report").forEach((btn) => {
    btn.addEventListener("click", () => openAgencyReport(btn.dataset.meetingId, btn.dataset.personId));
  });
  qs("#openMeetingLinksModal")?.addEventListener("click", openMeetingLinksModal);
  qs("#closeMeetingLinksModal")?.addEventListener("click", closeMeetingLinksModal);
  qs("#dashboardMeetingLinksForm")?.addEventListener("submit", saveDashboardMeetingLinks);
  document.querySelectorAll(".view-transcript").forEach((btn) => {
    btn.addEventListener("click", () => viewTranscript(btn.dataset.id));
  });
  qs("#toggleWeeklyCompare")?.addEventListener("click", () => {
    qs("#agencyReportCompare")?.classList.toggle("hidden");
  });
}

function openMeetingLinksModal() {
  const modal = qs("#meetingLinksModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeMeetingLinksModal() {
  const modal = qs("#meetingLinksModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

async function saveDashboardMeetingLinks(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = submitButton(form);
  const done = setBusy(button, "保存中...");
  showMessage("#meetingLinksMessage", "正在保存腾讯会议设置...", true);
  const meeting_links = Array.from(form.querySelectorAll(".meeting-link-edit")).map((row) => ({
    id: row.dataset.id || "",
    part: row.dataset.part || "",
    title: row.querySelector(".link-title")?.value || "",
    url: row.querySelector(".link-url")?.value || "",
    meeting_id: row.querySelector(".link-meeting-id")?.value || "",
    password: row.querySelector(".link-password")?.value || "",
    host: row.querySelector(".link-host")?.value || "",
    notes: row.querySelector(".link-notes")?.value || "",
  }));
  try {
    const res = await api("/api/meeting-links/save", { method: "POST", body: { meeting_links } });
    app.data.settings = app.data.settings || {};
    app.data.settings.meeting_links = res.meeting_links || meeting_links;
    closeMeetingLinksModal();
    renderDashboard();
    setTimeout(() => showMessage("#dashboardMeetingStatus", "腾讯会议设置已保存", true), 0);
  } catch (err) {
    showMessage("#meetingLinksMessage", err.message);
  } finally {
    done();
  }
}

function renderMeetings() {
  app.page = "dashboard";
  renderDashboard();
}

function openAgencyReport(meetingId = "", personId = "") {
  if (meetingId) sessionStorage.setItem("reportMeetingId", meetingId);
  if (personId) sessionStorage.setItem("reportPersonId", personId);
  app.page = "report";
  renderPage();
  scrollToPageTop();
}

function renderReport() {
  const storedMeetingId = sessionStorage.getItem("reportMeetingId") || "";
  const meeting = (app.data.meetings || []).find((item) => item.id === storedMeetingId) || currentMeeting();
  const people = app.data.people || [];
  const users = app.data.users || [];
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const agencyUsers = users.filter((u) => (
    u.status !== "disabled" &&
    u.person_id &&
    (u.business_role_ids || []).includes(AGENCY_OPS_ROLE_ID)
  ));
  const agencyPersonIds = agencyUsers.map((u) => u.person_id).filter(Boolean);
  const reportPeople = [];
  const seenReportPersonIds = new Set();
  agencyUsers.forEach((user) => {
    const person = peopleById.get(user.person_id);
    if (!person || seenReportPersonIds.has(person.id)) return;
    seenReportPersonIds.add(person.id);
    reportPeople.push({ person, user });
  });
  const reportPersonIds = new Set(reportPeople.map((item) => item.person.id));
  const canEditReport = canFillAgencyReport();
  const canChoose = canSelectAgencyReportPerson();
  const defaultPersonId = agencyPersonIds[0] || "";
  const storedPersonId = sessionStorage.getItem("reportPersonId") || "";
  const selectedPerson = canChoose
    ? (reportPersonIds.has(storedPersonId) ? storedPersonId : defaultPersonId)
    : (canEditReport ? app.user.person_id : defaultPersonId);
  const report = (app.data.weekly_reports || []).find((r) => r.meeting_id === meeting?.id && r.person_id === selectedPerson) || { fields: {} };
  const fields = report.fields || {};
  setTitle("美国代运营每周报表", canEditReport ? "只填写直播和非直播周汇总数据；总GMV、总订单量和平均客单价由系统自动叠加。" : "查看美国代运营完成后的直播和非直播周汇总数据。");
  qs("#content").innerHTML = `
    <form id="reportForm" class="grid">
      <div class="panel">
        <div class="toolbar">
          <label>会议<select name="meeting_id">${meetingOptions(meeting?.id)}</select></label>
          ${canChoose ? `<label>填写对象<select name="person_id">${reportPeople.length ? reportPeople.map(({ person, user }) => {
            const personLabel = person.display_name || person.real_name || person.chinese_name || person.id;
            const label = user?.username && user.username !== personLabel ? `${personLabel} / ${user.username}` : personLabel;
            return `<option value="${person.id}" ${person.id === selectedPerson ? "selected" : ""}>${escapeHtml(label)}</option>`;
          }).join("") : '<option value="">暂无已绑定美国代运营</option>'}</select></label>` : ""}
          ${canEditReport ? '<button type="submit">保存周报</button>' : '<span class="tag">只读查看</span>'}
          <span id="reportMessage" class="message"></span>
        </div>
        ${!canEditReport ? '<p class="hint">只有业务角色为“美国代运营”的账号可以填写或修改；其他账号只能查看已保存内容。</p>' : ""}
      </div>
      ${reportSections.map(([title, items]) => `
        <div class="panel">
          <h2>${escapeHtml(title)}</h2>
          <div class="form-grid">
            ${items.map((item) => fieldHtml(item, fields[item[0]], !canEditReport)).join("")}
          </div>
        </div>
      `).join("")}
    </form>
  `;
  qs('select[name="person_id"]')?.addEventListener("change", (event) => {
    sessionStorage.setItem("reportPersonId", event.target.value);
    renderReport();
  });
  qs('select[name="meeting_id"]')?.addEventListener("change", (event) => {
    sessionStorage.setItem("reportMeetingId", event.target.value);
    renderReport();
  });
  if (canEditReport) qs("#reportForm").addEventListener("submit", saveReport);
}

function fieldHtml(item, value, readonly = false) {
  const [key, label, type, choices] = item;
  const wide = type === "textarea" ? "field-wide" : "";
  const disabled = readonly ? "disabled" : "";
  if (type === "select") {
    return `<label class="${wide}">${escapeHtml(label)}<select class="input-zone" name="${key}" ${disabled}><option value=""></option>${choices.map((c) => `<option value="${escapeHtml(c)}" ${value === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}</select></label>`;
  }
  if (type === "textarea") {
    return `<label class="${wide}">${escapeHtml(label)}<textarea class="input-zone" name="${key}" ${disabled}>${escapeHtml(value || "")}</textarea></label>`;
  }
  return `<label>${escapeHtml(label)}<input class="input-zone" name="${key}" value="${escapeHtml(value || "")}" ${disabled} /></label>`;
}

function meetingOptions(selectedId, meetings = app.data.meetings || []) {
  return (meetings || []).map((m) => `<option value="${escapeHtml(m.id)}" ${m.id === selectedId ? "selected" : ""}>${escapeHtml(m.title)}</option>`).join("");
}

async function saveReport(event) {
  event.preventDefault();
  if (!canFillAgencyReport()) {
    showMessage("#reportMessage", "只有美国代运营角色可以填写或修改周报");
    return;
  }
  const done = setBusy(submitButton(event.currentTarget));
  showMessage("#reportMessage", "保存中...", true);
  const form = new FormData(event.currentTarget);
  const fields = {};
  for (const section of reportSections) {
    for (const item of section[1]) {
      fields[item[0]] = form.get(item[0]) || "";
    }
  }
  autoFillReportTotals(fields);
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
  } finally {
    done();
  }
}

function renderNotes() {
  const meeting = currentMeeting();
  const notes = app.data.pre_meeting_notes || [];
  const ownNote = notes.find((note) => note.meeting_id === meeting?.id && note.person_id === app.user.person_id) || {};
  setTitle("会前备注", "每个人只需要提前写下本周例会上想提出的问题，会上再讨论负责人和解决方式。");
  qs("#content").innerHTML = `
    <div class="grid">
      <form id="noteForm" class="panel simple-note-form">
        <div class="section-title">
          <div>
            <h2>${escapeHtml(meeting?.title || "当前周会")}</h2>
            <p class="muted">美国时间 ${escapeHtml(meeting?.us_date || "")} ${escapeHtml(meeting?.us_time || "")} / 中国时间 ${escapeHtml(meeting?.cn_date || "")} ${escapeHtml(meeting?.cn_time || "")}</p>
          </div>
          <span class="tag">${escapeHtml(userBusinessRoleNames(app.user))}</span>
        </div>
        <input type="hidden" name="id" value="${escapeHtml(ownNote.id || "")}" />
        <input type="hidden" name="meeting_id" value="${escapeHtml(meeting?.id || "")}" />
        <label>我想在会上提出的问题<textarea name="question" required placeholder="只写你要上会提的问题。负责人、解决方式和行动项，会上讨论后再定。">${escapeHtml(ownNote.question || "")}</textarea></label>
        <div class="split-actions" style="margin-top:12px">
          <button type="submit">保存备注</button>
          <span id="noteMessage" class="message"></span>
        </div>
      </form>
      <div class="panel">
        <h2>显示位置</h2>
        <p class="hint">保存后的内容会出现在周会首页“内部经营复盘会流程”对应业务角色行里，鼠标移到“会前备注”标签上可以查看填写人和完整内容。</p>
      </div>
    </div>
  `;
  qs("#noteForm").addEventListener("submit", saveNote);
}

async function saveNote(event) {
  event.preventDefault();
  const done = setBusy(submitButton(event.currentTarget));
  showMessage("#noteMessage", "保存中...", true);
  const form = new FormData(event.currentTarget);
  const body = Object.fromEntries(form.entries());
  body.person_id = body.person_id || app.user.person_id;
  try {
    const res = await api("/api/notes/save", { method: "POST", body });
    upsertById("pre_meeting_notes", res.note);
    renderNotes();
    setTimeout(() => showMessage("#noteMessage", "已保存备注", true), 0);
  } catch (err) {
    showMessage("#noteMessage", err.message);
  } finally {
    done();
  }
}

function renderMeetingOps() {
  const uploadMeeting = lastOccurredMeeting();
  const records = app.data.transcript_uploads || [];
  const canUpload = canManageActions();
  const canRaw = canViewRawTranscripts();
  const actionDrafts = (app.data.action_drafts || []).filter((draft) => draft.part !== "part1");
  const actions = app.data.action_items || [];
  const subtitle = canUpload
    ? "上传一次完整会议文字后，系统自动生成第一部分纪要草稿和第二部分行动项初稿。"
    : "查看当前账号有权限访问的会议纪要；美国代运营角色只能打开第一部分纪要。";
  setTitle("会议纪要与行动项", subtitle);
  qs("#content").innerHTML = `
    <div class="grid">
      ${canUpload ? `
      <form id="transcriptForm" class="panel compact-upload-panel">
        <h2>上传完整腾讯会议文字记录</h2>
        <p class="compact-upload-hint">默认选最近一次已开会议。现在只需要上传一次完整文字；系统会自动生成第一部分纪要草稿和第二部分行动项初稿。同一会议再次上传会覆盖旧版。</p>
        <div class="form-grid two compact-upload-grid">
          <label>会议<select name="meeting_id">${meetingOptions(uploadMeeting?.id, occurredMeetings())}</select></label>
          <input type="hidden" name="part" value="full" />
          <label>文件名<input name="filename" /></label>
          <label>选择文件<input id="transcriptFile" type="file" accept=".txt,.md,.csv,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" /></label>
          <label class="field-wide">文字记录内容<textarea class="compact-upload-textarea" name="content" required></textarea></label>
        </div>
        <div class="split-actions" style="margin-top:12px">
          <button type="submit">上传保存</button>
          <span id="transcriptMessage" class="message"></span>
        </div>
      </form>` : ""}
      <div class="panel">
        <h2>每周会议文字记录归档</h2>
        <p class="muted">这里只显示已经开过的会议；每周只上传一次完整会议文字，系统内部拆分为纪要和行动项结果。</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>会议</th><th>美国时间</th><th>第一部分纪要</th><th>第二部分行动项</th><th>处理状态</th></tr></thead>
            <tbody>${meetingHistoryRows()}</tbody>
          </table>
        </div>
      </div>
      <div class="panel">
        <h2>${canRaw ? "已上传记录" : "可查看会议纪要"}</h2>
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
                  <td><button class="plain-btn view-transcript" data-id="${escapeHtml(r.id)}">${r.part === "part1" ? "查看纪要" : "查看"}</button></td>
                  <td>${escapeHtml(r.uploaded_at || "")}</td>
                </tr>
              `).join("") || '<tr><td colspan="10" class="muted">暂无可查看记录</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <div id="transcriptViewer" class="panel transcript-viewer hidden"></div>
      ${canManageActions() ? `
        <div class="panel">
          <h2>第二段行动项管理</h2>
          <p class="hint">第二段会议文字上传后会生成行动项初版。可以逐行新增、修改、删除；点击“保存正式发布”后会分发到责任人的“我的行动项”。发布后仍然可以继续修改，再次点击“保存正式发布”会更新责任人行动项，不会重复生成。</p>
        </div>
        ${renderActionDrafts(actionDrafts)}
        <div class="panel">
          <h2>已发布行动项</h2>
          <p class="hint">正式行动项的内容从上方对应草稿修改，再点“保存正式发布”同步更新到负责人。这里保留删除入口，避免两套地方同时改造成混乱。</p>
          <div class="table-wrap published-action-table">
            <table>
              <colgroup>
                <col class="published-col-meeting" />
                <col class="published-col-title" />
                <col class="published-col-owner" />
                <col class="published-col-priority" />
                <col class="published-col-status" />
                <col class="published-col-due" />
                <col class="published-col-notes" />
                <col class="published-col-actions" />
              </colgroup>
              <thead><tr><th>会议</th><th>事项</th><th>负责人</th><th>优先级</th><th>状态</th><th>截止</th><th>说明/时间判断</th><th>操作</th></tr></thead>
              <tbody>
                ${actionRowsHtml(actions, true) || '<tr><td colspan="8" class="muted">暂无行动项</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      ` : ""}
    </div>
  `;
  qs("#transcriptFile")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    qs('#transcriptForm input[name="filename"]').value = file.name;
    if (isDocxFile(file)) {
      app.pendingTranscriptFile = { name: file.name, base64: await fileToBase64(file) };
      qs('#transcriptForm textarea[name="content"]').value = "已选择 Word 会议文字记录文件，提交后系统会自动提取文字。";
    } else {
      app.pendingTranscriptFile = null;
      qs('#transcriptForm textarea[name="content"]').value = await file.text();
    }
  });
  qs("#transcriptForm")?.addEventListener("submit", saveTranscript);
  document.querySelectorAll(".view-transcript").forEach((btn) => {
    btn.addEventListener("click", () => viewTranscript(btn.dataset.id));
  });
  wireActionManagement();
}

async function saveTranscript(event) {
  event.preventDefault();
  const done = setBusy(submitButton(event.currentTarget), "上传中...");
  showMessage("#transcriptMessage", "上传保存中...", true);
  const body = Object.fromEntries(new FormData(event.currentTarget).entries());
  if (app.pendingTranscriptFile?.base64 && app.pendingTranscriptFile.name === body.filename) {
    body.file_base64 = app.pendingTranscriptFile.base64;
  }
  try {
    const res = await api("/api/transcripts/upload", { method: "POST", body });
    app.pendingTranscriptFile = null;
    (res.records || []).forEach((record) => {
      const removedDraftIds = (app.data.action_drafts || [])
        .filter((old) => old.meeting_id === record.meeting_id && old.part === record.part)
        .map((old) => old.id)
        .filter(Boolean);
      app.data.transcript_uploads = (app.data.transcript_uploads || [])
        .filter((old) => !(old.meeting_id === record.meeting_id && old.part === record.part));
      app.data.action_drafts = (app.data.action_drafts || [])
        .filter((old) => !(old.meeting_id === record.meeting_id && old.part === record.part));
      if (removedDraftIds.length) {
        app.data.action_items = (app.data.action_items || [])
          .filter((item) => !removedDraftIds.includes(item.source_draft_id));
      }
      upsertById("transcript_uploads", record);
    });
    (res.action_drafts || []).forEach((draft) => {
      upsertById("action_drafts", draft);
    });
    const draftItemCount = (res.action_drafts || []).reduce((sum, draft) => sum + (draft.items || []).length, 0);
    const savedParts = [];
    if ((res.records || []).some((record) => record.part === "part1")) savedParts.push("已生成第一部分 AI 会议纪要草稿");
    if (draftItemCount) savedParts.push(`已生成第二部分 ${draftItemCount} 条行动项初稿`);
    if (res.split_marker) savedParts.push(`自动断点：${res.split_marker}`);
    if (res.split_warning) savedParts.push(res.split_warning);
    if ((res.replaced || []).length) savedParts.push("本周旧版处理结果已覆盖");
    const targetRecord = (res.records || []).find((record) => record.part === "part1") || (res.records || [])[0];
    renderMeetingOps();
    setTimeout(() => {
      showMessage("#transcriptMessage", savedParts.join("；") || "已上传保存", true);
      focusUploadedTranscript(targetRecord);
    }, 0);
  } catch (err) {
    showMessage("#transcriptMessage", err.message);
  } finally {
    done();
  }
}

async function viewTranscript(id) {
  const viewer = qs("#transcriptViewer");
  if (!viewer) return;
  viewer.classList.remove("hidden");
  viewer.innerHTML = `<h2>正在读取会议纪要...</h2>`;
  try {
    const res = await api(`/api/transcripts/${encodeURIComponent(id)}`);
    if (res.view_log) upsertById("minutes_view_logs", res.view_log);
    const record = res.record || {};
    const partLabel = record.part === "part1" ? "Part 1：美国代运营每周报表" : "Part 2：内部经营复盘";
    const minutes = transcriptMinutesText(record);
    const canEditMinutes = canManageActions() && record.part === "part1";
    const rawContent = res.content || "";
    viewer.innerHTML = `
      <div class="section-title">
        <div>
          <h2>${escapeHtml(partLabel)}</h2>
          <p class="muted">${escapeHtml(meetingName(record.meeting_id))} · ${escapeHtml(record.original_filename || record.title || "")}</p>
        </div>
        <span class="tag">${escapeHtml(record.char_count || 0)} 字</span>
      </div>
      ${record.split_marker ? `<p class="hint">自动断点：${escapeHtml(record.split_marker)}</p>` : ""}
      ${record.part === "part1" ? `
        <div class="minutes-box">
          <div class="section-title compact-section-title">
            <h3>第一段会议纪要</h3>
            <span class="tag ${record.minutes_status === "final" ? "green" : "amber"}">${escapeHtml(transcriptMinutesStatus(record))}</span>
          </div>
          ${canEditMinutes ? `
            <textarea id="minutesText" class="minutes-editor">${escapeHtml(minutes || "")}</textarea>
            <div class="split-actions" style="margin-top:10px">
              <button type="button" class="save-minutes" data-id="${escapeHtml(record.id)}">保存正式纪要</button>
              <span id="minutesMessage" class="message"></span>
            </div>
          ` : `<pre class="minutes-preview">${escapeHtml(minutes || "暂未生成会议纪要。")}</pre>`}
        </div>
      ` : ""}
      ${rawContent ? `
        <h3>${record.part === "part1" ? "原始会议文字" : "会议文字记录"}</h3>
        <pre class="transcript-content">${escapeHtml(rawContent)}</pre>
      ` : record.part === "part1" ? '<p class="hint">当前账号只能查看第一段会议纪要，原始会议文字仅管理员、会议主持人和国内行政可见。</p>' : ""}
    `;
    viewer.querySelector(".save-minutes")?.addEventListener("click", () => saveTranscriptMinutes(record.id));
    if (record.part === "part2" && scrollToDraftForTranscript(record)) {
      return;
    }
    const target = viewer.querySelector(".minutes-box") || viewer;
    markAttention(target, "attention-panel");
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    viewer.innerHTML = `<h2>无法查看</h2><p class="message error">${escapeHtml(err.message)}</p>`;
  }
}

async function saveTranscriptMinutes(id) {
  const textarea = qs("#minutesText");
  if (!textarea) return;
  const button = qs(".save-minutes");
  const done = setBusy(button, "保存中...");
  showMessage("#minutesMessage", "正在保存正式纪要...", true);
  try {
    const res = await api("/api/transcripts/minutes/save", {
      method: "POST",
      body: { transcript_id: id, minutes: textarea.value },
    });
    upsertById("transcript_uploads", res.record);
    await viewTranscript(id);
    showMessage("#minutesMessage", "正式纪要已保存", true);
  } catch (err) {
    showMessage("#minutesMessage", err.message);
  } finally {
    done();
  }
}

function actionPriorityOptions(selected = "P1-本周必须") {
  return ["P0-今天处理", "P1-本周必须", "P2-观察", "P3-低优先"]
    .map((value) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`)
    .join("");
}

function actionStatusOptions(selected = "未开始") {
  return ["未开始", "进行中", "已完成", "暂停/调整"]
    .map((value) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`)
    .join("");
}

function draftItemRowHtml(item = {}, index = 0) {
  return `
    <tr data-item-id="${escapeHtml(item.id || "")}">
      <td class="row-index">${index + 1}</td>
      <td><textarea class="draft-title compact-textarea">${escapeHtml(item.title || "")}</textarea></td>
      <td><select class="draft-owner">${registeredPersonOptions(item.owner_person_id || "", "待定")}</select></td>
      <td><select class="draft-priority compact-input">${actionPriorityOptions(item.priority || "P1-本周必须")}</select></td>
      <td><input class="draft-due" type="date" value="${escapeHtml(item.due_date || "")}" /></td>
      <td><select class="draft-status compact-input">${actionStatusOptions(item.status || "未开始")}</select></td>
      <td><textarea class="draft-notes compact-textarea">${escapeHtml(item.notes || "")}</textarea></td>
      <td>
        <div class="draft-row-actions">
          <button type="button" class="plain-btn save-draft-row">修改</button>
          <button type="button" class="plain-btn danger-text remove-draft-row">删除</button>
        </div>
      </td>
    </tr>
  `;
}

function emptyActionDraft() {
  const meeting = currentMeeting();
  return {
    id: "",
    title: "新增会议行动项初稿",
    meeting_id: meeting?.id || "",
    part: "part2",
    source_filename: "手动新增",
    status: "待填写",
    items: [],
  };
}

function renderActionDrafts(drafts) {
  if (!drafts.length) {
    drafts = [emptyActionDraft()];
  }
  return drafts.map((draft) => `
    <div class="panel draft-card" data-draft-id="${escapeHtml(draft.id)}" data-transcript-id="${escapeHtml(draft.transcript_id || "")}" data-meeting-id="${escapeHtml(draft.meeting_id || "")}" data-part="${escapeHtml(draft.part || "part2")}">
      <div class="section-title">
        <div>
          <h2>${escapeHtml(draft.title || "会议行动项初稿")}</h2>
          <p class="muted">${escapeHtml(meetingName(draft.meeting_id))} · ${draft.part === "part1" ? "第一部分" : "第二部分"} · ${escapeHtml(draft.source_filename || "")}</p>
        </div>
        <span class="tag ${draft.status === "已确认生成行动项" ? "green" : "amber"}">${escapeHtml(draft.status || "待管理员确认")}</span>
      </div>
      <div class="table-wrap draft-table">
        <table>
          <colgroup>
            <col class="draft-col-index" />
            <col class="draft-col-title" />
            <col class="draft-col-owner" />
            <col class="draft-col-priority" />
            <col class="draft-col-due" />
            <col class="draft-col-status" />
            <col class="draft-col-notes" />
            <col class="draft-col-actions" />
          </colgroup>
          <thead><tr><th>#</th><th>事项</th><th>负责人</th><th>优先级</th><th>截止</th><th>状态</th><th>说明/时间判断</th><th>操作</th></tr></thead>
          <tbody>${(draft.items || []).map((item, index) => draftItemRowHtml(item, index)).join("") || '<tr><td colspan="8" class="muted">系统未识别到明确行动项，可以手动新增一行。</td></tr>'}</tbody>
        </table>
      </div>
      <div class="draft-actions">
        <button type="button" class="plain-btn add-draft-row">新增一行</button>
        <button type="button" class="plain-btn save-draft">保存当前修改</button>
        <button type="button" class="approve-draft">保存正式发布</button>
        <span class="message draft-message"></span>
      </div>
    </div>
  `).join("");
}

function actionRowsHtml(items, canEdit = false) {
  return items.map((a) => canEdit ? publishedActionRowHtml(a) : `
    <tr>
      <td>${escapeHtml(meetingName(a.meeting_id))}</td>
      <td>${escapeHtml(a.title)}</td>
      <td>${escapeHtml(personName(a.owner_person_id) || a.owner_text)}</td>
      <td>${escapeHtml(a.priority)}</td>
      <td>${escapeHtml(a.status)}</td>
      <td>${escapeHtml(a.due_date)}</td>
      <td><div class="action-note-cell">${escapeHtml(actionNotesText(a))}</div></td>
    </tr>
  `).join("");
}

function publishedActionRowHtml(a) {
  const draftButton = a.source_draft_id
    ? `<button type="button" class="plain-btn jump-source-draft" data-draft-id="${escapeHtml(a.source_draft_id)}">改草稿</button>`
    : "";
  return `
    <tr class="published-action-row" data-id="${escapeHtml(a.id || "")}">
      <td>${escapeHtml(meetingName(a.meeting_id))}</td>
      <td>${escapeHtml(a.title || "")}</td>
      <td>${escapeHtml(personName(a.owner_person_id) || a.owner_text || "待定")}</td>
      <td>${escapeHtml(a.priority || "")}</td>
      <td>${escapeHtml(a.status || "")}</td>
      <td>${escapeHtml(a.due_date || "")}</td>
      <td><div class="action-note-cell">${escapeHtml(actionNotesText(a))}</div></td>
      <td>
        <div class="draft-row-actions">
          ${draftButton}
          <button type="button" class="plain-btn danger-text delete-action" data-id="${escapeHtml(a.id || "")}">删除</button>
        </div>
      </td>
    </tr>
  `;
}

function renderActionManage() {
  renderMeetingOps();
}

function wireActionManagement() {
  if (!canManageActions()) return;
  document.querySelectorAll(".save-draft").forEach((btn) => btn.addEventListener("click", () => saveActionDraft(btn)));
  document.querySelectorAll(".approve-draft").forEach((btn) => btn.addEventListener("click", () => approveActionDraft(btn)));
  document.querySelectorAll(".save-draft-row").forEach((btn) => btn.addEventListener("click", () => saveDraftRow(btn)));
  document.querySelectorAll(".add-draft-row").forEach((btn) => btn.addEventListener("click", () => addDraftRow(btn)));
  document.querySelectorAll(".remove-draft-row").forEach((btn) => btn.addEventListener("click", () => removeDraftRow(btn)));
  document.querySelectorAll(".save-published-action").forEach((btn) => btn.addEventListener("click", () => savePublishedAction(btn)));
  document.querySelectorAll(".delete-action").forEach((btn) => btn.addEventListener("click", () => deleteAction(btn.dataset.id)));
  document.querySelectorAll(".jump-source-draft").forEach((btn) => btn.addEventListener("click", () => jumpToSourceDraft(btn.dataset.draftId)));
}

function renderActionManageLegacy() {
  if (!canManageActions()) {
    app.page = "my_actions";
    renderPage();
    return;
  }
  const actions = app.data.action_items || [];
  const drafts = (app.data.action_drafts || []).filter((draft) => draft.status !== "已确认生成行动项" && draft.part !== "part1");
  setTitle("行动项管理", "只有管理员、会议主持人、国内行政可以管理行动项；第二段会议文字会生成行动项初稿。");
  qs("#content").innerHTML = `
    <div class="grid">
      ${renderActionDrafts(drafts)}
      <div class="panel">
        <h2>正式行动项列表</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>会议</th><th>事项</th><th>负责人</th><th>优先级</th><th>状态</th><th>截止</th><th>说明/时间判断</th><th>操作</th></tr></thead>
            <tbody>
              ${actionRowsHtml(actions, true) || '<tr><td colspan="8" class="muted">暂无行动项</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  wireActionManagement();
}

function renderMyActions() {
  const mine = (app.data.action_items || []).filter((a) => a.owner_person_id === app.user?.person_id);
  const openItems = mine.filter((a) => a.status !== "已完成");
  const historyItems = mine.filter((a) => a.status === "已完成");
  setTitle("我的行动项", "查看本周自己负责的行动项，以及历史已经完成或归档的行动项。");
  qs("#content").innerHTML = `
    <div class="grid">
      <div class="panel">
        <h2>本周自己责任行动项</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>会议</th><th>事项</th><th>负责人</th><th>优先级</th><th>状态</th><th>截止</th><th>说明/时间判断</th></tr></thead>
            <tbody>${actionRowsHtml(openItems, false) || '<tr><td colspan="7" class="muted">暂无本周待落实行动项</td></tr>'}</tbody>
          </table>
        </div>
      </div>
      <div class="panel">
        <h2>历史自己责任行动项</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>会议</th><th>事项</th><th>负责人</th><th>优先级</th><th>状态</th><th>截止</th><th>说明/时间判断</th></tr></thead>
            <tbody>${actionRowsHtml(historyItems, false) || '<tr><td colspan="7" class="muted">暂无历史行动项</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  markMyActionsViewed();
}

async function markMyActionsViewed() {
  try {
    const res = await api("/api/actions/mark-viewed", { method: "POST", body: {} });
    if (res.user) {
      app.user = res.user;
      upsertById("users", res.user);
      renderAppShellNavOnly();
    }
  } catch (_err) {
    // 查看时间只是管理留痕，失败不影响用户查看行动项。
  }
}

function draftCardFromButton(button) {
  return button.closest(".draft-card");
}

function draftPayloadFromCard(card) {
  const items = Array.from(card?.querySelectorAll("tbody tr") || [])
    .map((row) => {
      const title = row.querySelector(".draft-title")?.value?.trim() || "";
      if (!title) return null;
      const ownerSelect = row.querySelector(".draft-owner");
      return {
        id: row.dataset.itemId || "",
        title,
        owner_person_id: ownerSelect?.value || "",
        owner_text: ownerSelect?.selectedOptions?.[0]?.textContent || "",
        priority: row.querySelector(".draft-priority")?.value || "P1-本周必须",
        due_date: row.querySelector(".draft-due")?.value || "",
        status: row.querySelector(".draft-status")?.value || "未开始",
        notes: row.querySelector(".draft-notes")?.value || "",
      };
    })
    .filter(Boolean);
  return {
    id: card?.dataset.draftId || "",
    meeting_id: card?.dataset.meetingId || currentMeeting()?.id || "",
    part: card?.dataset.part || "part2",
    items,
  };
}

function showDraftCardMessage(card, text, ok = false) {
  showMessage(card?.querySelector(".draft-message"), text, ok);
}

function showDraftMessage(draftId, text, ok = false) {
  const card = document.querySelector(`.draft-card[data-draft-id="${CSS.escape(draftId)}"]`);
  const message = card?.querySelector(".draft-message");
  showMessage(message, text, ok);
}

function renumberDraftRows(card) {
  card?.querySelectorAll("tbody tr").forEach((row, index) => {
    const cell = row.querySelector(".row-index");
    if (cell) cell.textContent = String(index + 1);
  });
}

function addDraftRow(button) {
  const card = draftCardFromButton(button);
  const tbody = card?.querySelector("tbody");
  if (!tbody) return;
  if (tbody.querySelector("td[colspan]")) tbody.innerHTML = "";
  const index = tbody.querySelectorAll("tr").length;
  tbody.insertAdjacentHTML("beforeend", draftItemRowHtml({}, index));
  const row = tbody.querySelector("tr:last-child");
  row?.querySelector(".save-draft-row")?.addEventListener("click", (event) => saveDraftRow(event.currentTarget));
  row?.querySelector(".remove-draft-row")?.addEventListener("click", (event) => removeDraftRow(event.currentTarget));
  row?.querySelector(".draft-title")?.focus();
}

async function removeDraftRow(button) {
  const card = draftCardFromButton(button);
  button.closest("tr")?.remove();
  renumberDraftRows(card);
  if (!card?.dataset.draftId) {
    showDraftCardMessage(card, "该行已删除，新增初稿尚未保存。", true);
    return;
  }
  await saveActionDraftFromCard(card, button, "删除中...", "该行已删除");
}

async function saveActionDraft(button, busyText = "保存中...", successText = "草稿已保存") {
  const card = draftCardFromButton(button);
  await saveActionDraftFromCard(card, button, busyText, successText);
}

async function saveActionDraftFromCard(card, button, busyText = "保存中...", successText = "草稿已保存") {
  const draftId = card?.dataset.draftId || "";
  const done = setBusy(button, busyText);
  showDraftCardMessage(card, "保存草稿中...", true);
  try {
    const res = await api("/api/action-drafts/save", { method: "POST", body: draftPayloadFromCard(card) });
    upsertById("action_drafts", res.draft);
    renderMeetingOps();
    setTimeout(() => showDraftMessage(res.draft?.id || draftId, successText, true), 0);
  } catch (err) {
    showDraftCardMessage(card, err.message);
  } finally {
    done();
  }
}

async function saveDraftRow(button) {
  await saveActionDraft(button, "保存中...", "该行修改已保存");
}

function jumpToSourceDraft(draftId) {
  if (!draftId) return;
  const card = document.querySelector(`.draft-card[data-draft-id="${CSS.escape(draftId)}"]`);
  if (!card) {
    alert("没有找到对应草稿，可能这条行动项是手动创建的。");
    return;
  }
  markAttention(card, "attention-panel");
  card.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function approveActionDraft(button) {
  const card = draftCardFromButton(button);
  const draftId = card?.dataset.draftId || "";
  if (!confirm("确认保存并发布正式行动项？发布后会分发或更新到负责人“我的行动项”里。")) return;
  const done = setBusy(button, "发布中...");
  showDraftCardMessage(card, "正在保存并发布正式行动项...", true);
  try {
    const saved = await api("/api/action-drafts/save", { method: "POST", body: draftPayloadFromCard(card) });
    upsertById("action_drafts", saved.draft);
    const targetDraftId = saved.draft?.id || draftId;
    const res = await api("/api/action-drafts/approve", { method: "POST", body: { draft_id: targetDraftId } });
    upsertById("action_drafts", res.draft);
    (res.actions || []).forEach((action) => upsertById("action_items", action));
    renderMeetingOps();
    setTimeout(() => showDraftMessage(res.draft?.id || targetDraftId, `已保存正式发布 ${res.actions?.length || 0} 条行动项`, true), 0);
  } catch (err) {
    showDraftCardMessage(card, err.message);
  } finally {
    done();
  }
}

async function savePublishedAction(button) {
  const row = button.closest(".published-action-row");
  if (!row) return;
  const ownerSelect = row.querySelector(".published-action-owner");
  const done = setBusy(button, "保存中...");
  try {
    const res = await api("/api/actions/save", {
      method: "POST",
      body: {
        id: row.dataset.id || "",
        meeting_id: row.dataset.meetingId || "",
        part: row.dataset.part || "part2",
        title: row.querySelector(".published-action-title")?.value || "",
        owner_person_id: ownerSelect?.value || "",
        owner_text: ownerSelect?.selectedOptions?.[0]?.textContent || "",
        priority: row.querySelector(".published-action-priority")?.value || "P1-本周必须",
        status: row.querySelector(".published-action-status")?.value || "未开始",
        due_date: row.querySelector(".published-action-due")?.value || "",
        notes: row.querySelector(".published-action-notes")?.value || "",
      },
    });
    upsertById("action_items", res.action);
    renderMeetingOps();
    setTimeout(() => {
      const savedRow = document.querySelector(`.published-action-row[data-id="${CSS.escape(res.action?.id || "")}"]`);
      if (savedRow) {
        savedRow.classList.add("attention-panel");
        savedRow.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 0);
  } catch (err) {
    alert(err.message);
  } finally {
    done();
  }
}

async function deleteAction(id) {
  if (!id || !confirm("确认删除这条正式行动项？")) return;
  try {
    await api("/api/actions/delete", { method: "POST", body: { id } });
    app.data.action_items = (app.data.action_items || []).filter((item) => item.id !== id);
    renderMeetingOps();
  } catch (err) {
    alert(err.message);
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
      <div class="panel">
        <h2>第一部分任务</h2>
        <p class="hint">美国代运营角色负责填写；管理员和其他成员可进入查看已完成周报。</p>
        <button type="button" class="plain-btn go-report-page">查看美国代运营每周报表</button>
      </div>

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
            <thead><tr><th>用户名</th><th>系统权限</th><th>状态</th><th>绑定现实人员</th><th>人员资料</th><th>业务角色</th><th>最后登录</th><th>最后查看行动项</th><th>操作</th></tr></thead>
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
                  <td>${escapeHtml(u.last_my_actions_viewed_at || "-")}</td>
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
    const done = setBusy(btn);
    showMessage("#adminUserMessage", "保存账号中...", true);
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
    } finally {
      done();
    }
  }));
  document.querySelectorAll(".reset-user").forEach((btn) => btn.addEventListener("click", async () => {
    const row = btn.closest("tr");
    const done = setBusy(btn, "重置中...");
    showMessage("#adminUserMessage", "重置密码中...", true);
    try {
      const res = await api("/api/admin/reset-password", { method: "POST", body: { user_id: row.dataset.userId } });
      showMessage("#adminUserMessage", `临时密码：${res.temporary_password}`, true);
    } catch (err) {
      showMessage("#adminUserMessage", err.message);
    } finally {
      done();
    }
  }));
  document.querySelectorAll(".delete-user").forEach((btn) => btn.addEventListener("click", async () => {
    const row = btn.closest("tr");
    const username = row.children[0]?.textContent?.trim() || "这个账号";
    if (!confirm(`确定删除用户「${username}」？只会删除登录账号，不会删除人员档案。`)) return;
    const deletedUser = (app.data.users || []).find((account) => account.id === row.dataset.userId);
    const done = setBusy(btn, "删除中...");
    showMessage("#adminUserMessage", "删除账号中...", true);
    try {
      await api("/api/admin/delete-user", { method: "POST", body: { user_id: row.dataset.userId } });
      removeById("users", row.dataset.userId);
      if (deletedUser?.person_id && !(app.data.users || []).some((account) => account.person_id === deletedUser.person_id)) {
        const person = personById(deletedUser.person_id);
        if (person) person.has_login = false;
      }
      renderAdmin();
      setTimeout(() => showMessage("#adminUserMessage", "用户已删除", true), 0);
    } catch (err) {
      showMessage("#adminUserMessage", err.message);
      done();
    }
  }));
  qs("#createUserForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const done = setBusy(submitButton(event.currentTarget), "创建中...");
    showMessage("#createUserMessage", "创建账号中...", true);
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    body.business_role_ids = checkedValues(event.currentTarget, "business_role_ids");
    try {
      const res = await api("/api/admin/create-user", { method: "POST", body });
      upsertById("users", res.user);
      renderAdmin();
      setTimeout(() => showMessage("#createUserMessage", `临时密码：${res.temporary_password}`, true), 0);
    } catch (err) {
      showMessage("#createUserMessage", err.message);
    } finally {
      done();
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
  document.querySelectorAll(".go-report-page").forEach((btn) => btn.addEventListener("click", () => {
    app.page = "report";
    renderPage();
  }));
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
        user_ids: userIds,
      },
    });
    upsertById("business_roles", res.business_role);
    if (res.users) {
      app.data.users = res.users;
    } else {
      (app.data.users || []).forEach((account) => {
        const current = (account.business_role_ids || []).filter((id) => id !== res.business_role.id);
        if (userIds.includes(account.id)) current.push(res.business_role.id);
        account.business_role_ids = current;
      });
    }
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
  const button = event.currentTarget;
  const row = event.currentTarget.closest("tr");
  const roleName = String(row.querySelector(".role-name")?.value || "这个角色").trim();
  if (!confirm(`确定删除业务角色「${roleName}」？删除后会同时解除这个角色和账号的绑定。`)) return;
  const done = setBusy(button, "删除中...");
  showMessage("#roleMessage", "删除角色中...", true);
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
    done();
  }
}

async function savePerson(event) {
  event.preventDefault();
  const done = setBusy(submitButton(event.currentTarget));
  showMessage("#personModalMessage", "保存人员中...", true);
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
  } finally {
    done();
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
    if (app.page === "report") {
      sessionStorage.removeItem("reportMeetingId");
      sessionStorage.removeItem("reportPersonId");
    }
    renderPage();
    scrollToPageTop();
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
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const originalText = button?.textContent || "登录";
  try {
    if (button) {
      button.disabled = true;
      button.textContent = "登录中...";
    }
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    const res = await api("/api/login", { method: "POST", body });
    app.user = res.user;
    app.person = res.person;
    if (res.data) {
      app.data = res.data;
      app.storage = res.storage;
    } else {
      await refresh();
    }
    renderAppShell();
    scrollToPageTop();
  } catch (err) {
    showMessage("#authMessage", err.message);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
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
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const originalText = button?.textContent || "提交注册";
  try {
    if (button) {
      button.disabled = true;
      button.textContent = "注册中...";
    }
    collectPendingAliasInputs(event.currentTarget);
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    body.business_role_ids = checkedValues(event.currentTarget, "business_role_ids");
    if (!body.business_role_ids.length) {
      showMessage("#authMessage", "注册时必须至少选择一个业务角色，提交后只能由管理员修改");
      return;
    }
    const res = await api("/api/register", { method: "POST", body });
    if (res.user) {
      app.user = res.user;
      app.person = res.person;
      app.data = res.data;
      app.storage = res.storage;
      app.page = "dashboard";
      event.currentTarget.reset();
      setAliasEditorValues(event.currentTarget, "mention_aliases", []);
      setRegisterVisible(false);
      renderAppShell();
      scrollToPageTop();
      return;
    }
    showMessage("#authMessage", res.message || "注册已提交", true);
  } catch (err) {
    showMessage("#authMessage", err.message);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
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
    scrollToPageTop();
  }
});

qs("#changePasswordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const done = setBusy(submitButton(event.currentTarget), "修改中...");
  try {
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    await api("/api/change-password", { method: "POST", body });
    await loadMe();
  } catch (err) {
    alert(err.message);
  } finally {
    done();
  }
});

loadPublicConfig();
loadMe().catch(() => renderAuth());
