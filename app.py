from __future__ import annotations

import base64
import copy
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import traceback
from datetime import datetime, timezone
from http import cookies
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse


BASE = Path(__file__).resolve().parent
STATIC_DIR = BASE / "static"
DATA_DIR = BASE / "data"
STATE_PATH = DATA_DIR / "state.json"
TRANSCRIPT_DIR = DATA_DIR / "transcripts"

HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", "10000"))
SESSION_COOKIE = "kg_session"
SESSION_SECONDS = 60 * 60 * 24 * 7
SESSION_SECRET = os.environ.get("SESSION_SECRET") or "dev-change-me-kicksgo-weekly-system"
FIREBASE_COLLECTION_PREFIX = os.environ.get("FIREBASE_COLLECTION_PREFIX", "kicksgo_meeting")
AGENCY_OPS_ROLE_ID = "role_us_agency_ops"
MEETING_HOST_ROLE_ID = "role_meeting_host"

AGENDA_REVIEW = "回顾上周会议纪要"
AGENDA_AGENCY = "美国代运营内部评估"
AGENDA_DOMESTIC = "国内货品与采购"
AGENDA_US_WAREHOUSE = "美国仓库与履约"
AGENDA_FINANCE = "财务与利润复盘"
AGENDA_PARTNERS = "其他TikTok店铺与合作方"
AGENDA_TECH = "技术与系统"
AGENDA_DECISION = "本周决策与下周行动项"

ROLE_AGENDA_MAP = {
    "role_us_self_ops": AGENDA_AGENCY,
    "role_us_agency_ops": AGENDA_AGENCY,
    "role_us_warehouse": AGENDA_US_WAREHOUSE,
    "role_sz_warehouse": AGENDA_DOMESTIC,
    "role_sz_product_ops": AGENDA_DOMESTIC,
    "role_sz_finance": AGENDA_FINANCE,
    "role_cn_tech": AGENDA_TECH,
    "role_cn_admin": AGENDA_DECISION,
    "role_meeting_host": AGENDA_DECISION,
    "role_partner_boss": AGENDA_DECISION,
}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def new_id(prefix: str) -> str:
    return f"{prefix}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}_{secrets.token_hex(4)}"


def plain(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): plain(v) for k, v in value.items()}
    if isinstance(value, list):
        return [plain(v) for v in value]
    if isinstance(value, (datetime,)):
        return value.isoformat()
    return value


def password_hash(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", str(password).encode("utf-8"), salt.encode("utf-8"), 180_000)
    return f"pbkdf2_sha256${salt}${base64.b64encode(digest).decode('ascii')}"


def verify_password(stored: str, password: str) -> bool:
    try:
        algo, salt, encoded = str(stored or "").split("$", 2)
    except ValueError:
        return False
    if algo != "pbkdf2_sha256":
        return False
    expected = password_hash(password, salt).split("$", 2)[2]
    return hmac.compare_digest(expected, encoded)


def normalize_name(value: str) -> str:
    value = str(value or "").strip().lower()
    value = re.sub(r"[\s\-_()（）【】\[\].,，。:：]+", "", value)
    return value


def split_aliases(value: Any) -> list[str]:
    if isinstance(value, list):
        raw_items = value
    else:
        raw_items = re.split(r"[,，\n\r]+", str(value or ""))
    aliases: list[str] = []
    for item in raw_items:
        alias = str(item or "").strip()
        if alias and alias not in aliases:
            aliases.append(alias)
    return aliases


def is_valid_username(username: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9_.@\-\u4e00-\u9fff]{2,40}", str(username or "")))


def default_business_roles() -> list[dict[str, Any]]:
    return [
        {
            "id": "role_partner_boss",
            "name": "合伙人（boss）",
            "category": "管理层",
            "description": "整体经营判断、资源投入、最终决策。",
        },
        {
            "id": "role_us_self_ops",
            "name": "美国自雇运营",
            "category": "美国运营",
            "description": "美国本地直营店运营、直播执行、现场协调。",
        },
        {
            "id": "role_us_agency_ops",
            "name": "美国代运营",
            "category": "美国运营",
            "description": "外部代运营、主播团队、美国本地合作执行。",
        },
        {
            "id": "role_us_warehouse",
            "name": "美国仓库",
            "category": "美国履约",
            "description": "美国仓发货、退件、错发漏发、库存现场问题。",
        },
        {
            "id": "role_sz_warehouse",
            "name": "深圳仓库",
            "category": "深圳供应链",
            "description": "深圳仓库存、打包、出错率、发货准备。",
        },
        {
            "id": "role_sz_product_ops",
            "name": "深圳货品运营",
            "category": "深圳供应链",
            "description": "SKU、价格、补货、货品组合、采购和运营节奏。",
        },
        {
            "id": "role_sz_finance",
            "name": "深圳财务",
            "category": "财务",
            "description": "成本、利润、应收应付、账务核对。",
        },
        {
            "id": "role_cn_tech",
            "name": "国内技术",
            "category": "技术",
            "description": "系统、数据、权限、自动化和会议记录处理。",
        },
        {
            "id": "role_cn_admin",
            "name": "国内行政",
            "category": "行政",
            "description": "会议组织、账号跟进、资料归档和行政协调。",
        },
        {
            "id": "role_meeting_host",
            "name": "会议主持人",
            "category": "会议管理",
            "description": "主持周会流程、控制议题顺序、推动结论和行动项收口。",
            "aliases": ["主持人", "周会主持人"],
        },
    ]


def default_state() -> dict[str, Any]:
    created_at = now_iso()
    admin_pass = os.environ.get("DEFAULT_ADMIN_PASSWORD", "Kicksgo-Admin-2026!")
    boss_pass = os.environ.get("DEFAULT_BOSS_PASSWORD", "Kicksgo-Boss-2026!")
    people = [
        {
            "id": "person_admin",
            "real_name": "系统管理员",
            "chinese_name": "管理员",
            "english_name": "Admin",
            "display_name": "管理员",
            "region": "管理",
            "business_area": "系统账号、人员权限、会议记录",
            "attends_weekly": True,
            "needs_weekly_report": False,
            "has_login": True,
            "meeting_aliases": ["Admin", "管理员"],
            "mention_aliases": ["系统管理员", "管理员"],
        },
        {
            "id": "person_boss",
            "real_name": "蔡平",
            "chinese_name": "蔡平",
            "english_name": "",
            "display_name": "蔡平",
            "region": "美国/中国",
            "business_area": "整体管理、最终决策",
            "attends_weekly": True,
            "needs_weekly_report": False,
            "has_login": True,
            "meeting_aliases": ["蔡平", "我", "老板", "Aaron", "iPhone", "蔡平 诺诺"],
            "mention_aliases": ["蔡平", "我", "老板", "合伙人", "Boss", "Aaron"],
        },
        {
            "id": "person_chen",
            "real_name": "老陈",
            "chinese_name": "老陈",
            "english_name": "Chen",
            "display_name": "老陈",
            "region": "中国",
            "business_area": "管理判断、优先级、资源协调",
            "attends_weekly": True,
            "needs_weekly_report": False,
            "has_login": False,
            "meeting_aliases": ["老陈", "Chen", "人生如戏"],
            "mention_aliases": ["老陈", "陈总", "Chen", "人生如戏"],
        },
        {
            "id": "person_kyle",
            "real_name": "凯尔",
            "chinese_name": "凯尔",
            "english_name": "Kyle",
            "display_name": "凯尔",
            "region": "美国",
            "business_area": "TikTok直营店运营、直播团队、达人推进",
            "attends_weekly": True,
            "needs_weekly_report": True,
            "has_login": False,
            "meeting_aliases": ["Kyle", "KYLE", "凯尔"],
            "mention_aliases": ["Kyle", "KYLE", "凯尔"],
        },
        {
            "id": "person_us_warehouse",
            "real_name": "美国仓库",
            "chinese_name": "美国仓库",
            "english_name": "US Warehouse",
            "display_name": "美国仓库",
            "region": "美国",
            "business_area": "发货、履约、错发漏发、退件丢件",
            "attends_weekly": True,
            "needs_weekly_report": False,
            "has_login": False,
            "meeting_aliases": ["US Warehouse", "Warehouse", "美国仓库"],
            "mention_aliases": ["美国仓库", "US Warehouse", "Warehouse"],
        },
        {
            "id": "person_cn_purchase",
            "real_name": "国内采购/运营",
            "chinese_name": "国内采购/运营",
            "english_name": "CN Purchase",
            "display_name": "国内采购/运营",
            "region": "中国",
            "business_area": "SKU、价格、补货、货品运营",
            "attends_weekly": True,
            "needs_weekly_report": False,
            "has_login": False,
            "meeting_aliases": ["国内采购", "国内运营", "CN Purchase"],
            "mention_aliases": ["国内采购", "国内运营", "深圳货品", "深圳货品运营", "CN Purchase"],
        },
        {
            "id": "person_cn_warehouse",
            "real_name": "国内仓库",
            "chinese_name": "国内仓库",
            "english_name": "CN Warehouse",
            "display_name": "国内仓库",
            "region": "中国",
            "business_area": "国内发货准备、库存、出错率",
            "attends_weekly": True,
            "needs_weekly_report": False,
            "has_login": False,
            "meeting_aliases": ["国内仓库", "CN Warehouse"],
            "mention_aliases": ["国内仓库", "深圳仓库", "CN Warehouse"],
        },
        {
            "id": "person_ken",
            "real_name": "Ken",
            "chinese_name": "Ken",
            "english_name": "Ken",
            "display_name": "Ken",
            "region": "",
            "business_area": "运营、合作方、多店问题",
            "attends_weekly": True,
            "needs_weekly_report": False,
            "has_login": False,
            "meeting_aliases": ["Ken", "njj"],
            "mention_aliases": ["Ken", "njj"],
        },
        {
            "id": "person_nono",
            "real_name": "诺诺",
            "chinese_name": "诺诺",
            "english_name": "Nono",
            "display_name": "诺诺",
            "region": "",
            "business_area": "运营、合作方、多店问题",
            "attends_weekly": True,
            "needs_weekly_report": False,
            "has_login": False,
            "meeting_aliases": ["诺诺", "Nono", "NuoNuo"],
            "mention_aliases": ["诺诺", "Nono", "NuoNuo"],
        },
        {
            "id": "person_tech",
            "real_name": "国际技术",
            "chinese_name": "国际技术",
            "english_name": "Tech",
            "display_name": "国际技术",
            "region": "国际",
            "business_area": "系统、数据、权限、会议记录",
            "attends_weekly": True,
            "needs_weekly_report": False,
            "has_login": False,
            "meeting_aliases": ["国际技术", "Tech"],
            "mention_aliases": ["国际技术", "国内技术", "Tech"],
        },
    ]
    return {
        "version": 2,
        "created_at": created_at,
        "updated_at": created_at,
        "users": [
            {
                "id": "user_admin",
                "username": "admin",
                "password_hash": password_hash(admin_pass),
                "role": "admin",
                "status": "active",
                "person_id": "person_admin",
                "business_role_ids": [],
                "created_at": created_at,
                "last_login_at": "",
                "must_change_password": True,
            },
            {
                "id": "user_boss",
                "username": "蔡平",
                "password_hash": password_hash(boss_pass),
                "role": "manager",
                "status": "active",
                "person_id": "person_boss",
                "business_role_ids": ["role_partner_boss", "role_meeting_host"],
                "created_at": created_at,
                "last_login_at": "",
                "must_change_password": True,
            },
        ],
        "people": people,
        "business_roles": default_business_roles(),
        "settings": {
            "meeting_links": [
                {
                    "id": "link_part1",
                    "part": "part1",
                    "title": "第一部分：美国代运营周报",
                    "url": "",
                    "meeting_id": "",
                    "password": "",
                    "host": "美国代运营/主持人",
                    "notes": "用于美国代运营汇报直营店周报。",
                },
                {
                    "id": "link_part2",
                    "part": "part2",
                    "title": "第二部分：内部经营复盘会",
                    "url": "",
                    "meeting_id": "",
                    "password": "",
                    "host": "主持人",
                    "notes": "不需要凯尔参加，回顾上周纪要、内部决策和下周行动项。",
                },
            ],
            "meeting_rules": [
                "所有参会人单独进入腾讯会议，不共用账号。",
                "腾讯会议显示名必须能和系统人员档案匹配。",
                "每周会前填写自己的会前备注。",
                "美国代运营从2026-06-22中国时间这次周会开始，会前必须填写直营店周报。",
            ],
        },
        "meetings": [
            {
                "id": "meeting_20260614",
                "title": "2026-06-14 Kicksgo 周会",
                "status": "已开会",
                "us_date": "2026-06-14",
                "us_time": "20:00",
                "us_timezone": "America/Los_Angeles",
                "cn_date": "2026-06-15",
                "cn_time": "11:00",
                "kyle_report_required": False,
                "notes": "系统第一条历史会议档案；腾讯会议文字记录待导出后上传 Part 1 / Part 2。",
                "created_at": created_at,
            },
            {
                "id": "meeting_20260622",
                "title": "2026-06-22 Kicksgo 周会",
                "status": "待开会",
                "us_date": "2026-06-21",
                "us_time": "20:00",
                "us_timezone": "America/Los_Angeles",
                "cn_date": "2026-06-22",
                "cn_time": "11:00",
                "kyle_report_required": True,
                "report_due_note": "美国代运营需在会前3-6小时完成直营店周报。",
                "notes": "从这次开始正式执行美国代运营会前周报、会后上传两段腾讯会议文字记录。",
                "created_at": created_at,
            },
        ],
        "weekly_reports": [],
        "pre_meeting_notes": [],
        "transcript_uploads": [],
        "action_drafts": [],
        "action_items": [],
        "audit_logs": [],
    }


class Store:
    def __init__(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        TRANSCRIPT_DIR.mkdir(parents=True, exist_ok=True)
        self._firestore = None
        self._firebase_ready = False
        self._state_cache: dict[str, Any] | None = None
        self._try_init_firebase()

    def _try_init_firebase(self) -> None:
        backend = os.environ.get("CLOUD_STORAGE_BACKEND", "").lower()
        enabled = backend == "firebase" or bool(os.environ.get("FIREBASE_PROJECT_ID") or os.environ.get("FIREBASE_SERVICE_ACCOUNT_B64"))
        if not enabled:
            return
        try:
            import firebase_admin
            from firebase_admin import credentials, firestore

            if firebase_admin._apps:
                app = firebase_admin.get_app()
            else:
                info = None
                if os.environ.get("FIREBASE_SERVICE_ACCOUNT_B64"):
                    raw = base64.b64decode(os.environ["FIREBASE_SERVICE_ACCOUNT_B64"]).decode("utf-8")
                    info = json.loads(raw)
                elif os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON"):
                    info = json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT_JSON"])
                options = {"projectId": os.environ.get("FIREBASE_PROJECT_ID")} if os.environ.get("FIREBASE_PROJECT_ID") else None
                if info:
                    app = firebase_admin.initialize_app(credentials.Certificate(info), options=options)
                else:
                    app = firebase_admin.initialize_app(options=options)
            self._firestore = firestore.client(app=app)
            self._firebase_ready = True
        except Exception as exc:
            print(f"Firebase disabled for this run: {exc}")
            self._firestore = None
            self._firebase_ready = False

    def state_ref(self):
        if not self._firestore:
            return None
        return self._firestore.collection(FIREBASE_COLLECTION_PREFIX).document("state")

    def transcript_ref(self, transcript_id: str):
        if not self._firestore:
            return None
        return self._firestore.collection(FIREBASE_COLLECTION_PREFIX).document("transcripts").collection("items").document(transcript_id)

    def load(self) -> dict[str, Any]:
        if self._state_cache is not None:
            return copy.deepcopy(self._state_cache)
        if self._firestore:
            ref = self.state_ref()
            doc = ref.get()
            if doc.exists:
                data = doc.to_dict() or {}
                state = data.get("state") or {}
                self._state_cache = copy.deepcopy(plain(ensure_state(state)))
                return copy.deepcopy(self._state_cache)
            state = default_state()
            self.save(state, "init")
            return state
        if STATE_PATH.exists():
            try:
                state = ensure_state(json.loads(STATE_PATH.read_text(encoding="utf-8")))
                self._state_cache = copy.deepcopy(plain(state))
                return copy.deepcopy(self._state_cache)
            except Exception:
                traceback.print_exc()
        state = default_state()
        self.save(state, "init")
        return state

    def save(self, state: dict[str, Any], reason: str = "save") -> dict[str, Any]:
        state = ensure_state(state)
        state["updated_at"] = now_iso()
        payload = plain(state)
        if self._firestore:
            self.state_ref().set({"state": payload, "updated_at": now_iso(), "reason": reason})
        else:
            STATE_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        self._state_cache = copy.deepcopy(payload)
        return state

    def save_transcript_content(self, transcript_id: str, content: str) -> None:
        if self._firestore:
            self.transcript_ref(transcript_id).set({"content": content, "updated_at": now_iso()})
            return
        (TRANSCRIPT_DIR / f"{transcript_id}.txt").write_text(content, encoding="utf-8")

    def load_transcript_content(self, transcript_id: str) -> str:
        if self._firestore:
            doc = self.transcript_ref(transcript_id).get()
            if not doc.exists:
                return ""
            return str((doc.to_dict() or {}).get("content") or "")
        path = TRANSCRIPT_DIR / f"{transcript_id}.txt"
        if not path.exists():
            return ""
        return path.read_text(encoding="utf-8")

    def status(self) -> dict[str, Any]:
        return {
            "backend": "firebase" if self._firebase_ready else "local_json",
            "firebase_collection_prefix": FIREBASE_COLLECTION_PREFIX,
        }


store = Store()


def ensure_state(state: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(state, dict):
        state = {}
    defaults = default_state()
    for key, value in defaults.items():
        state.setdefault(key, value)
    state["version"] = max(int(state.get("version") or 1), int(defaults.get("version") or 1))
    existing_roles = {role.get("id"): role for role in state.setdefault("business_roles", [])}
    for role in default_business_roles():
        if role["id"] not in existing_roles:
            state["business_roles"].append(role)
        else:
            existing_roles[role["id"]].setdefault("name", role["name"])
            existing_roles[role["id"]].setdefault("category", role["category"])
            existing_roles[role["id"]].setdefault("description", role["description"])
            existing_roles[role["id"]].setdefault("aliases", [])
            for alias in role.get("aliases", []) or []:
                if alias not in existing_roles[role["id"]]["aliases"]:
                    existing_roles[role["id"]]["aliases"].append(alias)
    state.setdefault("settings", {})
    state["settings"].setdefault("meeting_links", defaults["settings"]["meeting_links"])
    state["settings"].setdefault("meeting_rules", defaults["settings"]["meeting_rules"])
    for link in state["settings"].get("meeting_links", []):
        if link.get("id") == "link_part1":
            if "凯尔" in str(link.get("title") or ""):
                link["title"] = "第一部分：美国代运营周报"
            if "凯尔" in str(link.get("host") or ""):
                link["host"] = "美国代运营/主持人"
            if "凯尔" in str(link.get("notes") or ""):
                link["notes"] = "用于美国代运营汇报直营店周报。"
    state["settings"]["meeting_rules"] = [
        str(rule).replace("凯尔从", "美国代运营从").replace("凯尔", "美国代运营")
        for rule in state["settings"].get("meeting_rules", [])
    ]
    for meeting in state.get("meetings", []):
        if "凯尔" in str(meeting.get("report_due_note") or ""):
            meeting["report_due_note"] = str(meeting.get("report_due_note") or "").replace("凯尔", "美国代运营")
        if "凯尔" in str(meeting.get("notes") or ""):
            meeting["notes"] = str(meeting.get("notes") or "").replace("凯尔", "美国代运营")
    state.setdefault("audit_logs", [])
    role_by_person = {
        "person_boss": ["role_partner_boss", "role_meeting_host"],
        "person_kyle": ["role_us_agency_ops"],
        "person_us_warehouse": ["role_us_warehouse"],
        "person_cn_warehouse": ["role_sz_warehouse"],
        "person_cn_purchase": ["role_sz_product_ops"],
        "person_tech": ["role_cn_tech"],
    }
    for user in state.get("users", []):
        if user.get("id") == "user_boss" and str(user.get("username") or "").lower() == "boss":
            user["username"] = "蔡平"
        user.setdefault("status", "pending")
        user.setdefault("role", "member")
        user.setdefault("person_id", "")
        if "business_role_ids" not in user:
            user["business_role_ids"] = role_by_person.get(str(user.get("person_id") or ""), [])
        if not isinstance(user.get("business_role_ids"), list):
            user["business_role_ids"] = []
        user.setdefault("must_change_password", False)
    forced_person_aliases = {
        "person_boss": {"meeting_aliases": ["蔡平 诺诺"], "mention_aliases": []},
        "person_chen": {"meeting_aliases": ["人生如戏"], "mention_aliases": ["人生如戏"]},
        "person_ken": {"meeting_aliases": ["njj"], "mention_aliases": ["njj"]},
    }
    for person in state.get("people", []):
        if person.get("id") == "person_boss":
            if str(person.get("real_name") or "") in {"", "老板"}:
                person["real_name"] = "蔡平"
            if str(person.get("chinese_name") or "") in {"", "我", "老板"}:
                person["chinese_name"] = "蔡平"
            if str(person.get("display_name") or "") in {"", "我", "老板"}:
                person["display_name"] = "蔡平"
        aliases = person.setdefault("meeting_aliases", [])
        if not isinstance(aliases, list):
            person["meeting_aliases"] = []
        mention_aliases = person.setdefault("mention_aliases", [])
        if not isinstance(mention_aliases, list):
            person["mention_aliases"] = []
        for field, values in forced_person_aliases.get(str(person.get("id") or ""), {}).items():
            for value in values:
                if value and value not in person[field]:
                    person[field].append(value)
        if not person.get("manual_aliases"):
            default_person = next((p for p in defaults.get("people", []) if p.get("id") == person.get("id")), None)
            if default_person:
                for field in ["meeting_aliases", "mention_aliases"]:
                    for value in default_person.get(field, []) or []:
                        if value and value not in person[field]:
                            person[field].append(value)
            for value in [
                person.get("real_name"),
                person.get("chinese_name"),
                person.get("english_name"),
                person.get("display_name"),
            ]:
                value = str(value or "").strip()
                if value and value not in person["mention_aliases"]:
                    person["mention_aliases"].append(value)
    return state


def sanitize_user(user: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in user.items() if k != "password_hash"}


def user_by_id(state: dict[str, Any], user_id: str) -> dict[str, Any] | None:
    return next((u for u in state.get("users", []) if u.get("id") == user_id), None)


def person_by_id(state: dict[str, Any], person_id: str) -> dict[str, Any] | None:
    return next((p for p in state.get("people", []) if p.get("id") == person_id), None)


def business_role_by_id(state: dict[str, Any], role_id: str) -> dict[str, Any] | None:
    return next((r for r in state.get("business_roles", []) if r.get("id") == role_id), None)


def agenda_module_for_role(role: dict[str, Any] | None) -> str:
    if not role:
        return AGENDA_DECISION
    role_id = str(role.get("id") or "")
    if role_id in ROLE_AGENDA_MAP:
        return ROLE_AGENDA_MAP[role_id]
    text = " ".join(
        [
            str(role.get("name") or ""),
            str(role.get("category") or ""),
            str(role.get("description") or ""),
            " ".join(str(alias) for alias in role.get("aliases", []) or []),
        ]
    ).lower()
    if re.search(r"美国仓库|us warehouse|履约|物流", text):
        return AGENDA_US_WAREHOUSE
    if re.search(r"财务|利润|成本|账务|应收|应付|回款", text):
        return AGENDA_FINANCE
    if re.search(r"深圳仓库|国内仓库|深圳货品|采购|货品|供应链", text):
        return AGENDA_DOMESTIC
    if re.search(r"技术|系统|数据|自动化", text):
        return AGENDA_TECH
    if re.search(r"代运营|自雇运营|直播|主播|达人", text):
        return AGENDA_AGENCY
    if re.search(r"合作|店铺|tiktok|ken|诺诺|渠道", text):
        return AGENDA_PARTNERS
    if re.search(r"行政|主持|会议|纪要|归档", text):
        return AGENDA_REVIEW
    return AGENDA_DECISION


def agenda_module_for_person(state: dict[str, Any], person_id: str) -> str:
    for account in state.get("users", []):
        if account.get("person_id") != person_id or account.get("status") == "disabled":
            continue
        for role_id in account.get("business_role_ids") or []:
            role = business_role_by_id(state, str(role_id))
            if role:
                return agenda_module_for_role(role)
    return AGENDA_DECISION


def clean_business_role_ids(state: dict[str, Any], values: Any) -> list[str]:
    if not isinstance(values, list):
        values = []
    valid = {str(role.get("id")) for role in state.get("business_roles", [])}
    cleaned: list[str] = []
    for value in values:
        role_id = str(value or "").strip()
        if role_id in valid and role_id not in cleaned:
            cleaned.append(role_id)
    return cleaned


def get_user_person(state: dict[str, Any], user: dict[str, Any]) -> dict[str, Any] | None:
    return person_by_id(state, str(user.get("person_id") or ""))


def is_admin(user: dict[str, Any]) -> bool:
    return user.get("role") == "admin"


def is_manager(user: dict[str, Any]) -> bool:
    return user.get("role") in {"admin", "manager"}


def user_has_business_role(user: dict[str, Any], role_id: str) -> bool:
    return role_id in (user.get("business_role_ids") or [])


def can_manage_actions(user: dict[str, Any]) -> bool:
    return is_manager(user) or user_has_business_role(user, MEETING_HOST_ROLE_ID)


def can_read_transcript_record(user: dict[str, Any], record: dict[str, Any]) -> bool:
    if can_manage_actions(user):
        return True
    return record.get("part") == "part1" and user_has_business_role(user, AGENCY_OPS_ROLE_ID)


def audit(state: dict[str, Any], user: dict[str, Any] | None, action: str, detail: dict[str, Any] | None = None) -> None:
    logs = state.setdefault("audit_logs", [])
    logs.append(
        {
            "id": new_id("log"),
            "at": now_iso(),
            "user_id": user.get("id") if user else "",
            "username": user.get("username") if user else "",
            "action": action,
            "detail": detail or {},
        }
    )
    if len(logs) > 500:
        del logs[:-500]


def sign_session(user_id: str) -> str:
    expires = int(datetime.now(timezone.utc).timestamp()) + SESSION_SECONDS
    payload = f"{user_id}.{expires}"
    sig = hmac.new(SESSION_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f"{payload}.{sig}".encode("utf-8")).decode("ascii")


def verify_session(token: str) -> str:
    try:
        raw = base64.urlsafe_b64decode(token.encode("ascii")).decode("utf-8")
        user_id, expires, sig = raw.rsplit(".", 2)
        payload = f"{user_id}.{expires}"
        expected = hmac.new(SESSION_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, sig):
            return ""
        if int(expires) < int(datetime.now(timezone.utc).timestamp()):
            return ""
        return user_id
    except Exception:
        return ""


def extract_speakers(content: str, state: dict[str, Any]) -> dict[str, Any]:
    alias_map: dict[str, dict[str, Any]] = {}
    mention_aliases: list[tuple[str, dict[str, Any]]] = []
    seen_mention_aliases: set[tuple[str, str]] = set()
    role_aliases: list[tuple[str, dict[str, Any]]] = []
    for person in state.get("people", []):
        speaker_names = [
            person.get("real_name"),
            person.get("chinese_name"),
            person.get("english_name"),
            person.get("display_name"),
            *(person.get("meeting_aliases") or []),
        ]
        for name in speaker_names:
            key = normalize_name(str(name or ""))
            if key:
                alias_map[key] = person
        for name in [
            person.get("real_name"),
            person.get("chinese_name"),
            person.get("english_name"),
            person.get("display_name"),
            *(person.get("mention_aliases") or []),
        ]:
            alias = str(name or "").strip()
            key = normalize_name(alias)
            dedupe_key = (str(person.get("id") or ""), key)
            if len(key) >= 2 and key not in {"me", "wo", "boss"} and dedupe_key not in seen_mention_aliases:
                seen_mention_aliases.add(dedupe_key)
                mention_aliases.append((alias, person))
    seen_role_aliases: set[tuple[str, str]] = set()
    for role in state.get("business_roles", []):
        for alias in [role.get("name"), role.get("category"), *(role.get("aliases") or [])]:
            alias = str(alias or "").strip()
            key = normalize_name(alias)
            dedupe_key = (str(role.get("id") or ""), key)
            if len(key) >= 2 and dedupe_key not in seen_role_aliases:
                seen_role_aliases.add(dedupe_key)
                role_aliases.append((alias, role))

    speakers: dict[str, int] = {}
    patterns = [
        re.compile(r"^(?:\[\d{1,2}:\d{2}(?::\d{2})?\]\s*)?([^：:\n]{1,40})[：:]\s*(?=\S)"),
        re.compile(r"^([^：:\n]{1,40})\s+\d{1,2}:\d{2}(?::\d{2})?\s+"),
        re.compile(r"^\d{1,2}:\d{2}(?::\d{2})?\s+([^：:\n]{1,40})[：:]\s*(?=\S)"),
    ]
    body_lines: list[str] = []
    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue
        body = line
        for pattern in patterns:
            match = pattern.match(line)
            if match:
                name = match.group(1).strip()
                if len(name) <= 40:
                    speakers[name] = speakers.get(name, 0) + 1
                body = line[match.end():].strip()
                break
        if body:
            body_lines.append(body)
    matched = []
    unmatched = []
    for raw, count in sorted(speakers.items(), key=lambda item: (-item[1], item[0])):
        person = alias_map.get(normalize_name(raw))
        if person:
            matched.append({"speaker": raw, "count": count, "person_id": person.get("id"), "person_name": person.get("display_name")})
        else:
            unmatched.append({"speaker": raw, "count": count})

    mentioned: dict[str, dict[str, Any]] = {}
    mentioned_roles: dict[str, dict[str, Any]] = {}
    for body in body_lines:
        matched_people_in_line: set[str] = set()
        for alias, person in mention_aliases:
            normalized = normalize_name(alias)
            if not normalized:
                continue
            if re.search(r"[A-Za-z0-9]", alias):
                hit = bool(re.search(rf"(?<![A-Za-z0-9]){re.escape(alias)}(?![A-Za-z0-9])", body, re.IGNORECASE))
            else:
                hit = alias in body
            if not hit:
                continue
            person_id = str(person.get("id") or "")
            item = mentioned.setdefault(
                person_id,
                {
                    "person_id": person_id,
                    "person_name": person.get("display_name") or person.get("real_name") or person_id,
                    "count": 0,
                    "aliases": [],
                },
            )
            if person_id not in matched_people_in_line:
                item["count"] += 1
                matched_people_in_line.add(person_id)
            if alias not in item["aliases"]:
                item["aliases"].append(alias)
        matched_roles_in_line: set[str] = set()
        for alias, role in role_aliases:
            if re.search(r"[A-Za-z0-9]", alias):
                hit = bool(re.search(rf"(?<![A-Za-z0-9]){re.escape(alias)}(?![A-Za-z0-9])", body, re.IGNORECASE))
            else:
                hit = alias in body
            if not hit:
                continue
            role_id = str(role.get("id") or "")
            item = mentioned_roles.setdefault(
                role_id,
                {
                    "role_id": role_id,
                    "role_name": role.get("name") or role_id,
                    "count": 0,
                    "aliases": [],
                },
            )
            if role_id not in matched_roles_in_line:
                item["count"] += 1
                matched_roles_in_line.add(role_id)
            if alias not in item["aliases"]:
                item["aliases"].append(alias)

    return {
        "matched_speakers": matched,
        "unmatched_speakers": unmatched,
        "mentioned_people": sorted(mentioned.values(), key=lambda item: (-item["count"], item["person_name"])),
        "mentioned_roles": sorted(mentioned_roles.values(), key=lambda item: (-item["count"], item["role_name"])),
    }


def is_part1_end_marker(line: str) -> bool:
    compact = normalize_name(line)
    if not compact:
        return False
    has_end = "结束" in compact or "完了" in compact or "完毕" in compact
    if not has_end:
        return False
    return (
        ("第一部分" in compact and ("凯尔" in compact or "代运营" in compact))
        or ("凯尔" in compact and ("部分" in compact or "环节" in compact or "这段" in compact or "这个" in compact or "的" in compact))
        or ("代运营" in compact and ("部分" in compact or "周报" in compact or "环节" in compact or "这段" in compact))
        or ("part1" in compact and ("凯尔" in compact or "代运营" in compact))
    )


def split_transcript_by_part_marker(content: str) -> tuple[str, str, str]:
    lines = content.splitlines()
    before: list[str] = []
    after: list[str] = []
    marker = ""
    found = False
    for line in lines:
        if not found and is_part1_end_marker(line):
            found = True
            marker = line.strip()
            continue
        if found:
            after.append(line)
        else:
            before.append(line)
    if not found:
        return content, "", ""
    return "\n".join(before).strip(), "\n".join(after).strip(), marker


def build_transcript_record(
    state: dict[str, Any],
    user: dict[str, Any],
    transcript_id: str,
    meeting_id: str,
    part: str,
    filename: str,
    content: str,
    split_marker: str = "",
) -> dict[str, Any]:
    analysis = extract_speakers(content, state)
    return {
        "id": transcript_id,
        "meeting_id": meeting_id,
        "part": part,
        "title": "第一部分：美国代运营周报" if part == "part1" else "第二部分：内部经营复盘",
        "original_filename": filename,
        "char_count": len(content),
        "line_count": len(content.splitlines()),
        "content_preview": content[:300],
        "matched_speakers": analysis["matched_speakers"],
        "unmatched_speakers": analysis["unmatched_speakers"],
        "mentioned_people": analysis["mentioned_people"],
        "mentioned_roles": analysis["mentioned_roles"],
        "split_marker": split_marker,
        "uploaded_by": user.get("id"),
        "uploaded_at": now_iso(),
    }


def person_display_name(person: dict[str, Any] | None) -> str:
    if not person:
        return ""
    return str(
        person.get("display_name")
        or person.get("real_name")
        or person.get("chinese_name")
        or person.get("english_name")
        or person.get("id")
        or ""
    )


def registered_people(state: dict[str, Any]) -> list[dict[str, Any]]:
    people_by_id = {str(person.get("id")): person for person in state.get("people", [])}
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for account in state.get("users", []):
        person_id = str(account.get("person_id") or "")
        if account.get("status") == "disabled" or not person_id or person_id in seen:
            continue
        person = people_by_id.get(person_id)
        if person:
            seen.add(person_id)
            result.append(person)
    return result


def text_has_alias(text: str, alias: str) -> bool:
    alias = str(alias or "").strip()
    if not alias:
        return False
    if re.search(r"[A-Za-z0-9]", alias):
        return bool(re.search(rf"(?<![A-Za-z0-9]){re.escape(alias)}(?![A-Za-z0-9])", text, re.IGNORECASE))
    return alias in text


def person_aliases(person: dict[str, Any]) -> list[str]:
    aliases: list[str] = []
    for value in [
        person.get("real_name"),
        person.get("chinese_name"),
        person.get("english_name"),
        person.get("display_name"),
        *(person.get("meeting_aliases") or []),
        *(person.get("mention_aliases") or []),
    ]:
        alias = str(value or "").strip()
        if alias and alias not in aliases:
            aliases.append(alias)
    return aliases


def match_person_from_text(state: dict[str, Any], text: str) -> dict[str, Any] | None:
    text = str(text or "")
    entries: list[tuple[str, dict[str, Any]]] = []
    stop_aliases = {"我", "俺", "me", "my", "mine", "自己", "大家", "所有人"}
    for person in registered_people(state):
        for alias in person_aliases(person):
            key = normalize_name(alias)
            if not key or key in stop_aliases:
                continue
            if len(key) < 2 and not re.search(r"[A-Za-z0-9]", alias):
                continue
            entries.append((alias, person))
    entries.sort(key=lambda item: len(item[0]), reverse=True)
    for alias, person in entries:
        if text_has_alias(text, alias):
            return person
    return None


def match_speaker_person(state: dict[str, Any], speaker: str) -> dict[str, Any] | None:
    speaker_key = normalize_name(speaker)
    if not speaker_key:
        return None
    for person in registered_people(state):
        for alias in [
            person.get("real_name"),
            person.get("chinese_name"),
            person.get("english_name"),
            person.get("display_name"),
            *(person.get("meeting_aliases") or []),
        ]:
            if normalize_name(str(alias or "")) == speaker_key:
                return person
    return None


def role_owner_person(state: dict[str, Any], role_id: str) -> dict[str, Any] | None:
    for account in state.get("users", []):
        if account.get("status") == "disabled":
            continue
        if role_id not in (account.get("business_role_ids") or []):
            continue
        person = person_by_id(state, str(account.get("person_id") or ""))
        if person:
            return person
    return None


def role_owner_from_text(state: dict[str, Any], text: str) -> tuple[dict[str, Any] | None, str]:
    text = str(text or "")
    for role in state.get("business_roles", []):
        aliases = [role.get("name"), role.get("category"), role.get("description"), *(role.get("aliases") or [])]
        if any(text_has_alias(text, str(alias or "")) for alias in aliases):
            person = role_owner_person(state, str(role.get("id") or ""))
            if person:
                return person, str(role.get("name") or "")

    keyword_roles = [
        ("role_us_warehouse", ["美国仓库", "US warehouse", "USPS", "UPS", "发货", "履约", "丢件", "退件", "错发", "漏发"]),
        ("role_sz_warehouse", ["深圳仓库", "国内仓库", "打包", "国内发货"]),
        ("role_sz_product_ops", ["采购", "补货", "货品", "SKU", "价格", "选品", "断货", "缺货", "爆款"]),
        ("role_sz_finance", ["财务", "利润", "成本", "账", "回款", "付款"]),
        ("role_cn_tech", ["系统", "账号", "权限", "数据", "上传", "自动", "数据库", "网页", "登录", "注册", "绑定"]),
        ("role_us_agency_ops", ["直播", "主播", "达人", "联盟", "短视频", "GMV", "转化", "店铺", "Kyle", "凯尔"]),
        ("role_meeting_host", ["主持", "纪要", "会议流程", "会议链接", "会后"]),
    ]
    for role_id, keywords in keyword_roles:
        if any(text_has_alias(text, keyword) for keyword in keywords):
            role = business_role_by_id(state, role_id)
            person = role_owner_person(state, role_id)
            if person:
                return person, str(role.get("name") if role else role_id)
    return None, ""


def parse_transcript_line(state: dict[str, Any], line: str) -> tuple[str, str, str]:
    line = str(line or "").strip()
    patterns = [
        re.compile(r"^(?:\[\d{1,2}:\d{2}(?::\d{2})?\]\s*)?([^：:\n]{1,40})[：:]\s*(?=\S)"),
        re.compile(r"^([^：:\n]{1,40})\s+\d{1,2}:\d{2}(?::\d{2})?\s+"),
        re.compile(r"^\d{1,2}:\d{2}(?::\d{2})?\s+([^：:\n]{1,40})[：:]\s*(?=\S)"),
    ]
    for pattern in patterns:
        match = pattern.match(line)
        if not match:
            continue
        speaker = match.group(1).strip()
        body = line[match.end():].strip()
        person = match_speaker_person(state, speaker)
        return speaker, str(person.get("id") if person else ""), body or line
    return "", "", line


def looks_like_action_item(text: str) -> bool:
    body = str(text or "").strip()
    if len(body) < 6:
        return False
    if len(body) > 260:
        body = body[:260]
    normalized = body.lower()
    weak_replies = {"好的", "好", "对", "嗯", "可以", "没问题", "ok", "okay", "yes"}
    if normalize_name(body) in {normalize_name(value) for value in weak_replies}:
        return False
    strong_keywords = [
        "行动项", "负责", "跟进", "落实", "下周", "本周", "今天", "明天", "必须",
        "确认", "处理", "解决", "安排", "完成", "推进", "复盘", "截止",
        "todo", "action", "owner", "follow up", "next week", "deadline",
    ]
    if any(keyword in normalized for keyword in strong_keywords):
        return True
    if re.search(r"我来|我负责|我会|我去|我这边|我处理|我跟进|我安排", body):
        return True
    verbs = ["需要", "要", "让", "把", "请", "先", "再", "上传", "整理", "导出", "联系", "补货", "发货", "修改", "创建", "开通", "同步", "检查", "统计"]
    return any(verb in body for verb in verbs) and any(anchor in body for anchor in ["需要", "要", "让", "把", "请", "下周", "本周", "今天", "明天"])


def clean_action_title(text: str) -> str:
    title = re.sub(r"\s+", " ", str(text or "")).strip()
    title = re.sub(r"^(行动项|任务|todo|action)\s*[：:，,]?\s*", "", title, flags=re.IGNORECASE)
    title = re.sub(r"^(然后|那|这个|就是|所以|我们|大家)\s*", "", title)
    title = title.strip(" ，。；;")
    if len(title) > 160:
        title = title[:157].rstrip() + "..."
    return title


def infer_action_owner(state: dict[str, Any], body: str, speaker_person_id: str = "") -> tuple[str, str, str]:
    person = match_person_from_text(state, body)
    if person:
        return str(person.get("id") or ""), person_display_name(person), "会议文字明确提到"
    if speaker_person_id and re.search(r"我来|我负责|我去|我会|我这边|我处理|我跟进|我安排", body):
        person = person_by_id(state, speaker_person_id)
        if person:
            return speaker_person_id, person_display_name(person), "发言人自认负责"
    role_person, role_name = role_owner_from_text(state, body)
    if role_person:
        return str(role_person.get("id") or ""), person_display_name(role_person), f"按业务角色判断：{role_name}"
    return "", "", "待管理员确认"


def infer_action_priority(text: str) -> str:
    body = str(text or "")
    if any(keyword in body for keyword in ["今天", "马上", "立刻", "紧急", "卡住", "必须先"]):
        return "P0-今天处理"
    if any(keyword in body for keyword in ["观察", "看看", "待观察", "待定"]):
        return "P2-观察"
    if any(keyword in body for keyword in ["低优先", "不急"]):
        return "P3-低优先"
    return "P1-本周必须"


def parse_due_date(text: str) -> str:
    raw = str(text or "")
    match = re.search(r"(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})", raw)
    if match:
        year, month, day = (int(match.group(1)), int(match.group(2)), int(match.group(3)))
        return f"{year:04d}-{month:02d}-{day:02d}"
    match = re.search(r"(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?", raw)
    if match:
        year = datetime.now(timezone.utc).year
        month, day = (int(match.group(1)), int(match.group(2)))
        return f"{year:04d}-{month:02d}-{day:02d}"
    match = re.search(r"(20\d{2})-(\d{1,2})-(\d{1,2})", raw)
    if match:
        year, month, day = (int(match.group(1)), int(match.group(2)), int(match.group(3)))
        return f"{year:04d}-{month:02d}-{day:02d}"
    return ""


def extract_action_draft_items(state: dict[str, Any], content: str, part: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw_line in str(content or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        speaker, speaker_person_id, body = parse_transcript_line(state, line)
        if not looks_like_action_item(body):
            continue
        title = clean_action_title(body)
        if len(title) < 6:
            continue
        key = normalize_name(title[:100])
        if not key or key in seen:
            continue
        seen.add(key)
        owner_person_id, owner_text, confidence = infer_action_owner(state, body, speaker_person_id)
        notes = f"来源发言：{speaker or '会议文字'}"
        if confidence:
            notes += f"；负责人判断：{confidence}"
        items.append(
            {
                "id": new_id("draftitem"),
                "title": title,
                "owner_person_id": owner_person_id,
                "owner_text": owner_text,
                "due_date": parse_due_date(body),
                "priority": infer_action_priority(body),
                "status": "未开始",
                "notes": notes,
                "part": part,
                "source_excerpt": body[:220],
                "confidence": confidence,
            }
        )
        if len(items) >= 12:
            break
    return items


def create_action_draft(
    state: dict[str, Any],
    user: dict[str, Any],
    meeting_id: str,
    transcript_id: str,
    part: str,
    content: str,
    filename: str,
) -> dict[str, Any]:
    items = extract_action_draft_items(state, content, part)
    draft = {
        "id": new_id("draft"),
        "meeting_id": meeting_id,
        "transcript_id": transcript_id,
        "part": part,
        "title": "第一部分代运营会议行动项初稿" if part == "part1" else "第二部分内部复盘行动项初稿",
        "source_filename": filename,
        "status": "待管理员确认",
        "items": items,
        "chat": [
            {
                "role": "system",
                "message": f"系统已根据会议文字生成 {len(items)} 条行动项初稿。请管理员或主持人确认负责人、截止日期和优先级后再生成正式行动项。",
                "created_at": now_iso(),
            }
        ],
        "created_by": user.get("id"),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    state.setdefault("action_drafts", []).insert(0, draft)
    return draft


def normalize_draft_item(state: dict[str, Any], item: dict[str, Any], part: str) -> dict[str, Any]:
    owner_person_id = str(item.get("owner_person_id") or "")
    if owner_person_id and not person_by_id(state, owner_person_id):
        owner_person_id = ""
    return {
        "id": str(item.get("id") or new_id("draftitem")),
        "title": clean_action_title(item.get("title") or ""),
        "owner_person_id": owner_person_id,
        "owner_text": str(item.get("owner_text") or ""),
        "due_date": str(item.get("due_date") or ""),
        "priority": str(item.get("priority") or "P1-本周必须"),
        "status": str(item.get("status") or "未开始"),
        "notes": str(item.get("notes") or ""),
        "part": str(item.get("part") or part or "part2"),
        "source_excerpt": str(item.get("source_excerpt") or "")[:300],
        "confidence": str(item.get("confidence") or ""),
    }


def find_action_draft(state: dict[str, Any], draft_id: str) -> dict[str, Any] | None:
    return next((draft for draft in state.get("action_drafts", []) if draft.get("id") == draft_id), None)


def item_number_from_text(text: str) -> int | None:
    match = re.search(r"第\s*(\d{1,2})\s*条", str(text or ""))
    if match:
        return int(match.group(1)) - 1
    zh = {"一": 0, "二": 1, "三": 2, "四": 3, "五": 4, "六": 5, "七": 6, "八": 7, "九": 8, "十": 9}
    match = re.search(r"第\s*([一二三四五六七八九十])\s*条", str(text or ""))
    if match:
        return zh.get(match.group(1))
    return None


def apply_draft_chat_command(state: dict[str, Any], draft: dict[str, Any], message: str) -> str:
    message = str(message or "").strip()
    items = draft.setdefault("items", [])
    index = item_number_from_text(message)
    lower = message.lower()

    if ("新增" in message or "增加" in message or "加一条" in message or "加一个" in message) and "删除" not in message:
        title = re.sub(r"^.*?(新增|增加|加一条|加一个)\s*(行动项|任务)?[：:，,]?\s*", "", message).strip()
        title = re.split(r"负责人|由|给|截止|优先级", title)[0].strip(" ：:，,。")
        if not title:
            title = clean_action_title(message)
        owner_person_id, owner_text, confidence = infer_action_owner(state, message, "")
        items.append(
            {
                "id": new_id("draftitem"),
                "title": clean_action_title(title),
                "owner_person_id": owner_person_id,
                "owner_text": owner_text,
                "due_date": parse_due_date(message),
                "priority": infer_action_priority(message),
                "status": "未开始",
                "notes": f"管理员对话新增；负责人判断：{confidence}",
                "part": draft.get("part") or "part2",
                "source_excerpt": message[:220],
                "confidence": confidence,
            }
        )
        return f"已新增 1 条行动项：{clean_action_title(title)}"

    if index is not None and 0 <= index < len(items):
        item = items[index]
        changes: list[str] = []
        if "删除" in message:
            removed = items.pop(index)
            return f"已删除第 {index + 1} 条：{removed.get('title') or ''}"
        if "负责人" in message or "给" in message or "由" in message:
            person = match_person_from_text(state, message)
            if not person:
                person, _role_name = role_owner_from_text(state, message)
            if person:
                item["owner_person_id"] = str(person.get("id") or "")
                item["owner_text"] = person_display_name(person)
                changes.append(f"负责人改为 {person_display_name(person)}")
        due_date = parse_due_date(message)
        if due_date:
            item["due_date"] = due_date
            changes.append(f"截止日期改为 {due_date}")
        priority = ""
        match = re.search(r"\b(P[0-3])\b", message, re.IGNORECASE)
        if match:
            priority = {"P0": "P0-今天处理", "P1": "P1-本周必须", "P2": "P2-观察", "P3": "P3-低优先"}[match.group(1).upper()]
        elif "优先级" in message:
            priority = infer_action_priority(message)
        if priority:
            item["priority"] = priority
            changes.append(f"优先级改为 {priority}")
        if "事项" in message or "标题" in message or "内容" in message:
            changed = re.split(r"改成|改为|换成", message, maxsplit=1)
            if len(changed) > 1:
                title = clean_action_title(changed[1])
                if title:
                    item["title"] = title
                    changes.append("事项内容已修改")
        if "备注" in message:
            changed = re.split(r"改成|改为|换成|备注", message, maxsplit=1)
            if len(changed) > 1:
                item["notes"] = changed[1].strip(" ：:，,。") or item.get("notes", "")
                changes.append("备注已修改")
        return "；".join(changes) if changes else "我没有识别到具体修改，请用“第1条负责人改成蔡平 / 第2条删除 / 新增一条……”这样的格式，或直接在上方表格修改后保存草稿。"

    if "删除" in message or "负责人" in message or "改成" in message or "改为" in message:
        return "请说明要修改第几条，例如：第1条负责人改成蔡平。也可以直接在上方表格修改后保存草稿。"
    return "我已记录这条修改意见；如果要让我直接修改草稿，请写清楚第几条、改什么。"


class AppHandler(BaseHTTPRequestHandler):
    server_version = "KicksgoMeetingSystem/1.0"

    def do_GET(self) -> None:
        try:
            self.route_get()
        except Exception as exc:
            traceback.print_exc()
            self.send_json({"ok": False, "error": str(exc)}, 500)

    def do_POST(self) -> None:
        try:
            self.route_post()
        except Exception as exc:
            traceback.print_exc()
            self.send_json({"ok": False, "error": str(exc)}, 500)

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"{self.address_string()} - {fmt % args}")

    def route_get(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/api/health":
            self.send_json({"ok": True, "storage": store.status(), "time": now_iso()})
            return
        if path == "/api/public-config":
            state = store.load()
            roles = [
                {
                    "id": role.get("id"),
                    "name": role.get("name"),
                    "category": role.get("category"),
                    "description": role.get("description"),
                    "aliases": role.get("aliases", []),
                }
                for role in state.get("business_roles", [])
            ]
            self.send_json({"ok": True, "business_roles": roles})
            return
        if path == "/api/me":
            state = store.load()
            user = self.current_user(state)
            self.send_json({"ok": True, "user": sanitize_user(user) if user else None, "person": get_user_person(state, user) if user else None})
            return
        if path == "/api/app-data":
            state = store.load()
            user = self.require_user(state)
            data = self.scoped_state(state, user)
            self.send_json({"ok": True, "data": data, "storage": store.status()})
            return
        if path.startswith("/api/transcripts/"):
            state = store.load()
            user = self.require_user(state)
            transcript_id = path.rsplit("/", 1)[-1]
            record = next((t for t in state.get("transcript_uploads", []) if t.get("id") == transcript_id), None)
            if not record:
                self.send_json({"ok": False, "error": "Transcript not found"}, 404)
                return
            if not can_read_transcript_record(user, record):
                self.send_json({"ok": False, "error": "No permission"}, 403)
                return
            self.send_json({"ok": True, "record": record, "content": store.load_transcript_content(transcript_id)})
            return
        self.serve_static(path)

    def route_post(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        payload = self.read_json()
        if path == "/api/register":
            self.handle_register(payload)
            return
        if path == "/api/login":
            self.handle_login(payload)
            return
        if path == "/api/logout":
            self.handle_logout()
            return

        state = store.load()
        user = self.require_user(state)
        if path == "/api/change-password":
            self.handle_change_password(state, user, payload)
            return
        if path == "/api/reports/save":
            self.handle_save_report(state, user, payload)
            return
        if path == "/api/notes/save":
            self.handle_save_note(state, user, payload)
            return
        if path == "/api/notes/delete":
            self.handle_delete_item(state, user, payload, "pre_meeting_notes")
            return
        if path == "/api/transcripts/upload":
            self.handle_upload_transcript(state, user, payload)
            return
        if path == "/api/action-drafts/save":
            self.handle_save_action_draft(state, user, payload)
            return
        if path == "/api/action-drafts/chat":
            self.handle_action_draft_chat(state, user, payload)
            return
        if path == "/api/action-drafts/approve":
            self.handle_approve_action_draft(state, user, payload)
            return
        if path == "/api/actions/save":
            self.handle_save_action(state, user, payload)
            return
        if path == "/api/actions/delete":
            self.handle_delete_item(state, user, payload, "action_items")
            return
        if path.startswith("/api/admin/"):
            if not is_admin(user):
                self.send_json({"ok": False, "error": "Admin only"}, 403)
                return
            self.handle_admin(path, state, user, payload)
            return
        self.send_json({"ok": False, "error": "Not found"}, 404)

    def serve_static(self, request_path: str) -> None:
        if request_path == "/":
            file_path = STATIC_DIR / "index.html"
        else:
            safe_path = request_path.lstrip("/").replace("\\", "/")
            file_path = STATIC_DIR / safe_path
        if not file_path.exists() or not file_path.is_file() or STATIC_DIR not in file_path.resolve().parents and file_path.resolve() != STATIC_DIR:
            file_path = STATIC_DIR / "index.html"
        content = file_path.read_bytes()
        mime = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", f"{mime}; charset=utf-8" if mime.startswith("text/") or mime in {"application/javascript", "application/json"} else mime)
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length") or "0")
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        if not raw:
            return {}
        return json.loads(raw)

    def send_json(self, data: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(plain(data), ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def set_cookie(self, value: str, max_age: int = SESSION_SECONDS) -> None:
        cookie = cookies.SimpleCookie()
        cookie[SESSION_COOKIE] = value
        cookie[SESSION_COOKIE]["path"] = "/"
        cookie[SESSION_COOKIE]["httponly"] = True
        cookie[SESSION_COOKIE]["samesite"] = "Lax"
        cookie[SESSION_COOKIE]["max-age"] = str(max_age)
        if max_age <= 0:
            cookie[SESSION_COOKIE]["expires"] = "Thu, 01 Jan 1970 00:00:00 GMT"
        self.send_header("Set-Cookie", cookie.output(header="").strip())

    def current_user(self, state: dict[str, Any]) -> dict[str, Any] | None:
        raw_cookie = self.headers.get("Cookie") or ""
        parsed = cookies.SimpleCookie(raw_cookie)
        morsel = parsed.get(SESSION_COOKIE)
        if not morsel:
            return None
        user_id = verify_session(morsel.value)
        if not user_id:
            return None
        user = user_by_id(state, user_id)
        if not user or user.get("status") != "active":
            return None
        return user

    def require_user(self, state: dict[str, Any]) -> dict[str, Any]:
        user = self.current_user(state)
        if not user:
            raise PermissionError("Not logged in")
        return user

    def scoped_state(self, state: dict[str, Any], user: dict[str, Any]) -> dict[str, Any]:
        if can_manage_actions(user):
            return {
                "users": [sanitize_user(u) for u in state.get("users", [])],
                "people": state.get("people", []),
                "business_roles": state.get("business_roles", []),
                "settings": state.get("settings", {}),
                "meetings": state.get("meetings", []),
                "weekly_reports": state.get("weekly_reports", []),
                "pre_meeting_notes": state.get("pre_meeting_notes", []),
                "transcript_uploads": state.get("transcript_uploads", []),
                "action_drafts": state.get("action_drafts", []),
                "action_items": state.get("action_items", []),
                "audit_logs": state.get("audit_logs", [])[-80:] if is_admin(user) else [],
            }
        person_id = user.get("person_id")
        agency_person_ids = {
            account.get("person_id")
            for account in state.get("users", [])
            if AGENCY_OPS_ROLE_ID in (account.get("business_role_ids") or []) and account.get("person_id")
        }
        visible_person_ids = {person_id, *agency_person_ids}
        visible_transcripts = [
            record for record in state.get("transcript_uploads", [])
            if can_read_transcript_record(user, record)
        ]
        return {
            "users": [
                sanitize_user(account)
                for account in state.get("users", [])
                if account.get("id") == user.get("id") or account.get("person_id") in agency_person_ids
            ],
            "people": [p for p in state.get("people", []) if p.get("id") in visible_person_ids],
            "business_roles": state.get("business_roles", []),
            "settings": state.get("settings", {}),
            "meetings": state.get("meetings", []),
            "weekly_reports": [
                r for r in state.get("weekly_reports", [])
                if r.get("person_id") == person_id or r.get("person_id") in agency_person_ids
            ],
            "pre_meeting_notes": [n for n in state.get("pre_meeting_notes", []) if n.get("person_id") == person_id],
            "transcript_uploads": visible_transcripts,
            "action_drafts": [],
            "action_items": [a for a in state.get("action_items", []) if a.get("owner_person_id") == person_id],
            "audit_logs": [],
        }

    def handle_register(self, payload: dict[str, Any]) -> None:
        state = store.load()
        username = str(payload.get("username") or "").strip()
        password = str(payload.get("password") or "")
        display_name = str(payload.get("display_name") or username).strip()
        meeting_aliases = split_aliases(payload.get("meeting_aliases"))
        mention_aliases = split_aliases(payload.get("mention_aliases"))
        business_role_ids = clean_business_role_ids(state, payload.get("business_role_ids"))
        if not is_valid_username(username):
            self.send_json({"ok": False, "error": "用户名至少2位，只能包含中文、字母、数字、点、下划线、横线或@"}, 400)
            return
        if len(password) < 6:
            self.send_json({"ok": False, "error": "密码至少6位"}, 400)
            return
        if not meeting_aliases:
            self.send_json({"ok": False, "error": "注册时必须填写腾讯会议参会人名"}, 400)
            return
        if not mention_aliases:
            self.send_json({"ok": False, "error": "注册时必须填写现实姓名、称呼或外号"}, 400)
            return
        if not business_role_ids:
            self.send_json({"ok": False, "error": "注册时必须至少选择一个业务角色，提交后只能由管理员修改"}, 400)
            return
        if any(u.get("username", "").lower() == username.lower() for u in state.get("users", [])):
            self.send_json({"ok": False, "error": "用户名已存在"}, 400)
            return
        person_id = new_id("person")
        user_id = new_id("user")
        person = {
            "id": person_id,
            "real_name": display_name,
            "chinese_name": display_name,
            "english_name": "",
            "display_name": display_name,
            "region": "",
            "business_area": "",
            "attends_weekly": True,
            "needs_weekly_report": False,
            "has_login": True,
            "meeting_aliases": meeting_aliases,
            "mention_aliases": mention_aliases,
            "manual_aliases": True,
        }
        new_user = {
            "id": user_id,
            "username": username,
            "password_hash": password_hash(password),
            "role": "member",
            "status": "active",
            "person_id": person_id,
            "business_role_ids": business_role_ids,
            "created_at": now_iso(),
            "last_login_at": now_iso(),
            "must_change_password": True,
        }
        state["people"].append(person)
        state["users"].append(new_user)
        audit(state, None, "register", {"username": username, "person_id": person_id})
        store.save(state, "register")
        token = sign_session(user_id)
        body = json.dumps(
            {
                "ok": True,
                "message": "注册成功，已自动登录。",
                "user": sanitize_user(new_user),
                "person": person,
                "data": self.scoped_state(state, new_user),
                "storage": store.status(),
            },
            ensure_ascii=False,
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.set_cookie(token)
        self.end_headers()
        self.wfile.write(body)

    def handle_login(self, payload: dict[str, Any]) -> None:
        state = store.load()
        username = str(payload.get("username") or "").strip()
        password = str(payload.get("password") or "")
        user = next((u for u in state.get("users", []) if u.get("username", "").lower() == username.lower()), None)
        if not user or not verify_password(user.get("password_hash", ""), password):
            self.send_json({"ok": False, "error": "用户名或密码错误"}, 401)
            return
        if user.get("status") != "active":
            self.send_json({"ok": False, "error": "账号还未通过审核或已停用"}, 403)
            return
        user["last_login_at"] = now_iso()
        token = sign_session(user["id"])
        body = json.dumps(
            {
                "ok": True,
                "user": sanitize_user(user),
                "person": get_user_person(state, user),
                "data": self.scoped_state(state, user),
                "storage": store.status(),
            },
            ensure_ascii=False,
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.set_cookie(token)
        self.end_headers()
        self.wfile.write(body)

    def handle_logout(self) -> None:
        body = json.dumps({"ok": True}, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.set_cookie("", max_age=0)
        self.end_headers()
        self.wfile.write(body)

    def handle_change_password(self, state: dict[str, Any], user: dict[str, Any], payload: dict[str, Any]) -> None:
        current = str(payload.get("current_password") or "")
        new_password = str(payload.get("new_password") or "")
        if not verify_password(user.get("password_hash", ""), current):
            self.send_json({"ok": False, "error": "当前密码错误"}, 400)
            return
        if len(new_password) < 6:
            self.send_json({"ok": False, "error": "新密码至少6位"}, 400)
            return
        user["password_hash"] = password_hash(new_password)
        user["must_change_password"] = False
        audit(state, user, "change_password")
        store.save(state, "change_password")
        self.send_json({"ok": True})

    def handle_save_report(self, state: dict[str, Any], user: dict[str, Any], payload: dict[str, Any]) -> None:
        meeting_id = str(payload.get("meeting_id") or "")
        person_id = str(payload.get("person_id") or user.get("person_id") or "")
        if not user_has_business_role(user, AGENCY_OPS_ROLE_ID):
            self.send_json({"ok": False, "error": "只有美国代运营角色可以填写或修改周报"}, 403)
            return
        if not is_manager(user) and person_id != user.get("person_id"):
            self.send_json({"ok": False, "error": "No permission"}, 403)
            return
        fields = payload.get("fields") or {}
        existing = next((r for r in state["weekly_reports"] if r.get("meeting_id") == meeting_id and r.get("person_id") == person_id), None)
        if not existing:
            existing = {"id": new_id("report"), "meeting_id": meeting_id, "person_id": person_id, "created_at": now_iso()}
            state["weekly_reports"].append(existing)
        existing.update({"fields": fields, "status": payload.get("status") or "已保存", "updated_at": now_iso(), "updated_by": user.get("id")})
        audit(state, user, "save_report", {"meeting_id": meeting_id, "person_id": person_id})
        store.save(state, "save_report")
        self.send_json({"ok": True, "report": existing})

    def handle_save_note(self, state: dict[str, Any], user: dict[str, Any], payload: dict[str, Any]) -> None:
        note_id = str(payload.get("id") or "")
        meeting_id = str(payload.get("meeting_id") or "")
        person_id = str(payload.get("person_id") or user.get("person_id") or "")
        if not is_manager(user) and person_id != user.get("person_id"):
            person_id = str(user.get("person_id") or "")
        existing = None
        if note_id:
            existing = next((n for n in state["pre_meeting_notes"] if n.get("id") == note_id), None)
        if not existing:
            existing = next(
                (
                    n for n in state["pre_meeting_notes"]
                    if n.get("meeting_id") == meeting_id and n.get("person_id") == person_id
                ),
                None,
            )
        if existing and not is_manager(user) and existing.get("person_id") != user.get("person_id"):
            self.send_json({"ok": False, "error": "No permission"}, 403)
            return
        question = str(payload.get("question") or "").strip()
        if not question:
            self.send_json({"ok": False, "error": "会前备注不能为空"}, 400)
            return
        data = {
            "meeting_id": meeting_id,
            "person_id": person_id,
            "meeting_part": "part2",
            "module": agenda_module_for_person(state, person_id),
            "question": question,
            "support_needed": "",
            "suggestion": "",
            "needs_decision": False,
            "priority": "中",
            "mentioned": False,
            "result": "",
            "updated_at": now_iso(),
            "updated_by": user.get("id"),
        }
        if existing:
            existing.update(data)
            saved = existing
        else:
            saved = {"id": new_id("note"), "created_at": now_iso(), **data}
            state["pre_meeting_notes"].append(saved)
        audit(state, user, "save_note", {"meeting_id": saved["meeting_id"], "note_id": saved["id"]})
        store.save(state, "save_note")
        self.send_json({"ok": True, "note": saved})

    def handle_upload_transcript(self, state: dict[str, Any], user: dict[str, Any], payload: dict[str, Any]) -> None:
        if not can_manage_actions(user):
            self.send_json({"ok": False, "error": "只有管理员或会议主持人可以上传会议文字记录"}, 403)
            return
        content = str(payload.get("content") or "")
        if len(content.strip()) < 10:
            self.send_json({"ok": False, "error": "文字记录内容太短"}, 400)
            return
        meeting_id = str(payload.get("meeting_id") or "")
        filename = str(payload.get("filename") or "")
        selected_part = str(payload.get("part") or "part1")
        part1_content, part2_content, split_marker = split_transcript_by_part_marker(content)
        pieces: list[tuple[str, str]] = []
        if split_marker:
            if len(part1_content.strip()) >= 10:
                pieces.append(("part1", part1_content))
            if len(part2_content.strip()) >= 10:
                pieces.append(("part2", part2_content))
        else:
            pieces.append((selected_part, content))
        records: list[dict[str, Any]] = []
        drafts: list[dict[str, Any]] = []
        for part, part_content in pieces:
            transcript_id = new_id("transcript")
            record = build_transcript_record(
                state=state,
                user=user,
                transcript_id=transcript_id,
                meeting_id=meeting_id,
                part=part,
                filename=filename,
                content=part_content,
                split_marker=split_marker,
            )
            store.save_transcript_content(transcript_id, part_content)
            state["transcript_uploads"].append(record)
            records.append(record)
            drafts.append(create_action_draft(state, user, meeting_id, transcript_id, part, part_content, filename))
        if not records:
            self.send_json({"ok": False, "error": "自动切分后没有可保存的文字内容"}, 400)
            return
        audit(state, user, "upload_transcript", {"meeting_id": meeting_id, "records": [{"part": r["part"], "id": r["id"]} for r in records], "split_marker": split_marker})
        store.save(state, "upload_transcript")
        self.send_json({"ok": True, "record": records[0], "records": records, "action_drafts": drafts, "split_marker": split_marker})

    def handle_save_action_draft(self, state: dict[str, Any], user: dict[str, Any], payload: dict[str, Any]) -> None:
        if not can_manage_actions(user):
            self.send_json({"ok": False, "error": "只有管理员或会议主持人可以修改行动项初稿"}, 403)
            return
        draft = find_action_draft(state, str(payload.get("id") or ""))
        if not draft:
            self.send_json({"ok": False, "error": "行动项初稿不存在"}, 404)
            return
        part = str(payload.get("part") or draft.get("part") or "part2")
        items = payload.get("items") or []
        if not isinstance(items, list):
            self.send_json({"ok": False, "error": "行动项初稿格式错误"}, 400)
            return
        draft["items"] = [normalize_draft_item(state, item, part) for item in items if clean_action_title(item.get("title") or "")]
        draft["part"] = part
        draft["status"] = str(payload.get("status") or draft.get("status") or "待管理员确认")
        draft["updated_at"] = now_iso()
        draft["updated_by"] = user.get("id")
        audit(state, user, "save_action_draft", {"draft_id": draft.get("id"), "item_count": len(draft["items"])})
        store.save(state, "save_action_draft")
        self.send_json({"ok": True, "draft": draft})

    def handle_action_draft_chat(self, state: dict[str, Any], user: dict[str, Any], payload: dict[str, Any]) -> None:
        if not can_manage_actions(user):
            self.send_json({"ok": False, "error": "只有管理员或会议主持人可以修改行动项初稿"}, 403)
            return
        draft = find_action_draft(state, str(payload.get("draft_id") or payload.get("id") or ""))
        if not draft:
            self.send_json({"ok": False, "error": "行动项初稿不存在"}, 404)
            return
        message = str(payload.get("message") or "").strip()
        if not message:
            self.send_json({"ok": False, "error": "请输入修改要求"}, 400)
            return
        draft.setdefault("chat", []).append({"role": "user", "message": message, "created_at": now_iso(), "user_id": user.get("id")})
        reply = apply_draft_chat_command(state, draft, message)
        draft.setdefault("chat", []).append({"role": "assistant", "message": reply, "created_at": now_iso()})
        draft["updated_at"] = now_iso()
        draft["updated_by"] = user.get("id")
        audit(state, user, "chat_action_draft", {"draft_id": draft.get("id")})
        store.save(state, "chat_action_draft")
        self.send_json({"ok": True, "draft": draft, "reply": reply})

    def handle_approve_action_draft(self, state: dict[str, Any], user: dict[str, Any], payload: dict[str, Any]) -> None:
        if not can_manage_actions(user):
            self.send_json({"ok": False, "error": "只有管理员或会议主持人可以确认行动项初稿"}, 403)
            return
        draft = find_action_draft(state, str(payload.get("draft_id") or payload.get("id") or ""))
        if not draft:
            self.send_json({"ok": False, "error": "行动项初稿不存在"}, 404)
            return
        created_actions: list[dict[str, Any]] = []
        for item in draft.get("items", []):
            normalized = normalize_draft_item(state, item, str(draft.get("part") or "part2"))
            if not normalized.get("title"):
                continue
            action = {
                "id": new_id("action"),
                "meeting_id": str(draft.get("meeting_id") or ""),
                "part": normalized.get("part") or draft.get("part") or "part2",
                "title": normalized["title"],
                "owner_person_id": normalized.get("owner_person_id", ""),
                "owner_text": normalized.get("owner_text", ""),
                "due_date": normalized.get("due_date", ""),
                "priority": normalized.get("priority", "P1-本周必须"),
                "status": normalized.get("status", "未开始"),
                "notes": normalized.get("notes", ""),
                "source_draft_id": draft.get("id"),
                "source_transcript_id": draft.get("transcript_id"),
                "created_at": now_iso(),
                "updated_at": now_iso(),
                "created_by": user.get("id"),
                "updated_by": user.get("id"),
            }
            state.setdefault("action_items", []).insert(0, action)
            created_actions.append(action)
        draft["status"] = "已确认生成行动项"
        draft["confirmed_at"] = now_iso()
        draft["confirmed_by"] = user.get("id")
        draft["updated_at"] = now_iso()
        draft.setdefault("chat", []).append(
            {
                "role": "system",
                "message": f"已生成 {len(created_actions)} 条正式行动项，并分发到负责人本周落实行动项目。",
                "created_at": now_iso(),
            }
        )
        audit(state, user, "approve_action_draft", {"draft_id": draft.get("id"), "action_count": len(created_actions)})
        store.save(state, "approve_action_draft")
        self.send_json({"ok": True, "draft": draft, "actions": created_actions})

    def handle_save_action(self, state: dict[str, Any], user: dict[str, Any], payload: dict[str, Any]) -> None:
        if not can_manage_actions(user):
            self.send_json({"ok": False, "error": "只有管理员或会议主持人可以编辑行动项"}, 403)
            return
        item_id = str(payload.get("id") or "")
        existing = next((a for a in state["action_items"] if a.get("id") == item_id), None)
        data = {
            "meeting_id": str(payload.get("meeting_id") or ""),
            "part": str(payload.get("part") or "part2"),
            "title": str(payload.get("title") or ""),
            "owner_person_id": str(payload.get("owner_person_id") or ""),
            "owner_text": str(payload.get("owner_text") or ""),
            "due_date": str(payload.get("due_date") or ""),
            "priority": str(payload.get("priority") or "P1"),
            "status": str(payload.get("status") or "未开始"),
            "notes": str(payload.get("notes") or ""),
            "updated_at": now_iso(),
            "updated_by": user.get("id"),
        }
        if existing:
            existing.update(data)
            saved = existing
        else:
            saved = {"id": new_id("action"), "created_at": now_iso(), **data}
            state["action_items"].append(saved)
        audit(state, user, "save_action", {"meeting_id": saved["meeting_id"], "action_id": saved["id"]})
        store.save(state, "save_action")
        self.send_json({"ok": True, "action": saved})

    def handle_delete_item(self, state: dict[str, Any], user: dict[str, Any], payload: dict[str, Any], collection: str) -> None:
        item_id = str(payload.get("id") or "")
        items = state.get(collection, [])
        item = next((i for i in items if i.get("id") == item_id), None)
        if not item:
            self.send_json({"ok": True})
            return
        if collection == "pre_meeting_notes" and not is_manager(user) and item.get("person_id") != user.get("person_id"):
            self.send_json({"ok": False, "error": "No permission"}, 403)
            return
        if collection == "action_items" and not can_manage_actions(user):
            self.send_json({"ok": False, "error": "No permission"}, 403)
            return
        state[collection] = [i for i in items if i.get("id") != item_id]
        audit(state, user, f"delete_{collection}", {"id": item_id})
        store.save(state, f"delete_{collection}")
        self.send_json({"ok": True})

    def handle_admin(self, path: str, state: dict[str, Any], user: dict[str, Any], payload: dict[str, Any]) -> None:
        if path == "/api/admin/create-user":
            username = str(payload.get("username") or "").strip()
            password = str(payload.get("password") or secrets.token_urlsafe(8))
            if not is_valid_username(username):
                self.send_json({"ok": False, "error": "用户名至少2位，只能包含中文、字母、数字、点、下划线、横线或@"}, 400)
                return
            if any(u.get("username", "").lower() == username.lower() for u in state["users"]):
                self.send_json({"ok": False, "error": "用户名已存在"}, 400)
                return
            user_id = new_id("user")
            person_id = str(payload.get("person_id") or "")
            new_user = {
                "id": user_id,
                "username": username,
                "password_hash": password_hash(password),
                "role": str(payload.get("role") or "member"),
                "status": str(payload.get("status") or "active"),
                "person_id": person_id,
                "business_role_ids": clean_business_role_ids(state, payload.get("business_role_ids")),
                "created_at": now_iso(),
                "last_login_at": "",
                "must_change_password": True,
            }
            state["users"].append(new_user)
            audit(state, user, "admin_create_user", {"username": username})
            store.save(state, "admin_create_user")
            self.send_json({"ok": True, "temporary_password": password, "user": sanitize_user(new_user)})
            return
        if path == "/api/admin/save-user":
            target = user_by_id(state, str(payload.get("id") or ""))
            if not target:
                self.send_json({"ok": False, "error": "用户不存在"}, 404)
                return
            for key in ["role", "status", "person_id"]:
                if key in payload:
                    target[key] = payload.get(key)
            if "business_role_ids" in payload:
                target["business_role_ids"] = clean_business_role_ids(state, payload.get("business_role_ids"))
            audit(state, user, "admin_save_user", {"user_id": target.get("id")})
            store.save(state, "admin_save_user")
            self.send_json({"ok": True, "user": sanitize_user(target)})
            return
        if path == "/api/admin/delete-user":
            target_id = str(payload.get("user_id") or payload.get("id") or "")
            if target_id == user.get("id"):
                self.send_json({"ok": False, "error": "不能删除当前登录的管理员账号"}, 400)
                return
            target = user_by_id(state, target_id)
            if not target:
                self.send_json({"ok": False, "error": "用户不存在"}, 404)
                return
            person_id = str(target.get("person_id") or "")
            state["users"] = [account for account in state.get("users", []) if account.get("id") != target_id]
            if person_id and not any(account.get("person_id") == person_id for account in state.get("users", [])):
                person = person_by_id(state, person_id)
                if person:
                    person["has_login"] = False
            audit(state, user, "admin_delete_user", {"user_id": target_id, "username": target.get("username")})
            store.save(state, "admin_delete_user")
            self.send_json({"ok": True})
            return
        if path == "/api/admin/reset-password":
            target = user_by_id(state, str(payload.get("user_id") or ""))
            if not target:
                self.send_json({"ok": False, "error": "用户不存在"}, 404)
                return
            temp = str(payload.get("temporary_password") or f"KG-{secrets.token_hex(3).upper()}")
            target["password_hash"] = password_hash(temp)
            target["must_change_password"] = True
            target["password_reset_at"] = now_iso()
            audit(state, user, "admin_reset_password", {"user_id": target.get("id")})
            store.save(state, "admin_reset_password")
            self.send_json({"ok": True, "temporary_password": temp})
            return
        if path == "/api/admin/save-person":
            person_id = str(payload.get("id") or "")
            existing = person_by_id(state, person_id)
            data = {
                "real_name": str(payload.get("real_name") or ""),
                "chinese_name": str(payload.get("chinese_name") or ""),
                "english_name": str(payload.get("english_name") or ""),
                "display_name": str(payload.get("display_name") or payload.get("real_name") or ""),
                "region": str(payload.get("region") or ""),
                "business_area": str(payload.get("business_area") or ""),
                "attends_weekly": bool(payload.get("attends_weekly")),
                "needs_weekly_report": bool(payload.get("needs_weekly_report")),
                "has_login": bool(payload.get("has_login")),
                "meeting_aliases": split_aliases(payload.get("meeting_aliases")),
                "mention_aliases": split_aliases(payload.get("mention_aliases")),
                "manual_aliases": True,
            }
            if existing:
                existing.update(data)
                saved = existing
            else:
                saved = {"id": new_id("person"), **data}
                state["people"].append(saved)
            audit(state, user, "admin_save_person", {"person_id": saved["id"]})
            store.save(state, "admin_save_person")
            self.send_json({"ok": True, "person": saved})
            return
        if path == "/api/admin/delete-person":
            person_id = str(payload.get("id") or "")
            state["people"] = [p for p in state["people"] if p.get("id") != person_id]
            for account in state["users"]:
                if account.get("person_id") == person_id:
                    account["person_id"] = ""
            audit(state, user, "admin_delete_person", {"person_id": person_id})
            store.save(state, "admin_delete_person")
            self.send_json({"ok": True})
            return
        if path == "/api/admin/save-business-role":
            role_id = str(payload.get("id") or "")
            existing = business_role_by_id(state, role_id)
            data = {
                "name": str(payload.get("name") or "").strip(),
                "category": str(payload.get("category") or "").strip(),
                "description": str(payload.get("description") or "").strip(),
                "aliases": split_aliases(payload.get("aliases")),
            }
            if not data["name"]:
                self.send_json({"ok": False, "error": "业务角色名称不能为空"}, 400)
                return
            if existing:
                existing.update(data)
                saved = existing
            else:
                saved = {"id": new_id("bizrole"), **data}
                state["business_roles"].append(saved)
            if "user_ids" in payload:
                user_ids = {str(value) for value in payload.get("user_ids", []) if value}
                valid_user_ids = {str(account.get("id")) for account in state.get("users", [])}
                user_ids = user_ids & valid_user_ids
                for account in state.get("users", []):
                    current = [rid for rid in account.get("business_role_ids", []) if rid != saved["id"]]
                    if account.get("id") in user_ids:
                        current.append(saved["id"])
                    account["business_role_ids"] = clean_business_role_ids(state, current)
            else:
                user_ids = None
            audit_detail = {"role_id": saved["id"]}
            if user_ids is not None:
                audit_detail["user_count"] = len(user_ids)
            audit(state, user, "admin_save_business_role", audit_detail)
            store.save(state, "admin_save_business_role")
            self.send_json({"ok": True, "business_role": saved, "users": [sanitize_user(account) for account in state.get("users", [])]})
            return
        if path == "/api/admin/delete-business-role":
            role_id = str(payload.get("id") or "")
            if role_id.startswith("role_"):
                self.send_json({"ok": False, "error": "默认业务角色不能删除，可以直接编辑名称和说明。"}, 400)
                return
            state["business_roles"] = [r for r in state.get("business_roles", []) if r.get("id") != role_id]
            for account in state.get("users", []):
                account["business_role_ids"] = [rid for rid in account.get("business_role_ids", []) if rid != role_id]
            audit(state, user, "admin_delete_business_role", {"role_id": role_id})
            store.save(state, "admin_delete_business_role")
            self.send_json({"ok": True})
            return
        if path == "/api/admin/save-role-users":
            role_id = str(payload.get("role_id") or "")
            if not business_role_by_id(state, role_id):
                self.send_json({"ok": False, "error": "业务角色不存在"}, 404)
                return
            user_ids = {str(value) for value in payload.get("user_ids", []) if value}
            valid_user_ids = {str(account.get("id")) for account in state.get("users", [])}
            user_ids = user_ids & valid_user_ids
            for account in state.get("users", []):
                current = [rid for rid in account.get("business_role_ids", []) if rid != role_id]
                if account.get("id") in user_ids:
                    current.append(role_id)
                account["business_role_ids"] = clean_business_role_ids(state, current)
            audit(state, user, "admin_save_role_users", {"role_id": role_id, "user_count": len(user_ids)})
            store.save(state, "admin_save_role_users")
            self.send_json({"ok": True})
            return
        if path == "/api/admin/save-meeting":
            meeting_id = str(payload.get("id") or "")
            existing = next((m for m in state["meetings"] if m.get("id") == meeting_id), None)
            data = {
                "title": str(payload.get("title") or ""),
                "status": str(payload.get("status") or "待开会"),
                "us_date": str(payload.get("us_date") or ""),
                "us_time": str(payload.get("us_time") or ""),
                "us_timezone": str(payload.get("us_timezone") or "America/Los_Angeles"),
                "cn_date": str(payload.get("cn_date") or ""),
                "cn_time": str(payload.get("cn_time") or ""),
                "kyle_report_required": bool(payload.get("kyle_report_required")),
                "report_due_note": str(payload.get("report_due_note") or ""),
                "notes": str(payload.get("notes") or ""),
                "updated_at": now_iso(),
            }
            if existing:
                existing.update(data)
                saved = existing
            else:
                saved = {"id": new_id("meeting"), "created_at": now_iso(), **data}
                state["meetings"].append(saved)
            audit(state, user, "admin_save_meeting", {"meeting_id": saved["id"]})
            store.save(state, "admin_save_meeting")
            self.send_json({"ok": True, "meeting": saved})
            return
        if path == "/api/admin/save-links":
            links = payload.get("meeting_links") or []
            state.setdefault("settings", {})["meeting_links"] = links
            audit(state, user, "admin_save_links")
            store.save(state, "admin_save_links")
            self.send_json({"ok": True, "meeting_links": links})
            return
        self.send_json({"ok": False, "error": "Admin endpoint not found"}, 404)


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    TRANSCRIPT_DIR.mkdir(parents=True, exist_ok=True)
    store.load()
    server = HTTPServer((HOST, PORT), AppHandler)
    print(f"Kicksgo meeting system running on http://{HOST}:{PORT}")
    print(f"Storage: {store.status()}")
    server.serve_forever()


if __name__ == "__main__":
    main()
