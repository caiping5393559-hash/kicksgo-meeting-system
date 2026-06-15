from __future__ import annotations

import base64
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
        },
        {
            "id": "person_boss",
            "real_name": "老板",
            "chinese_name": "我",
            "english_name": "",
            "display_name": "我",
            "region": "美国/中国",
            "business_area": "整体管理、最终决策",
            "attends_weekly": True,
            "needs_weekly_report": False,
            "has_login": True,
            "meeting_aliases": ["我", "老板", "Aaron", "iPhone"],
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
            "meeting_aliases": ["老陈", "Chen"],
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
            "meeting_aliases": ["Ken"],
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
        },
    ]
    return {
        "version": 1,
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
                "created_at": created_at,
                "last_login_at": "",
                "must_change_password": True,
            },
            {
                "id": "user_boss",
                "username": "boss",
                "password_hash": password_hash(boss_pass),
                "role": "manager",
                "status": "active",
                "person_id": "person_boss",
                "created_at": created_at,
                "last_login_at": "",
                "must_change_password": True,
            },
        ],
        "people": people,
        "settings": {
            "meeting_links": [
                {
                    "id": "link_part1",
                    "part": "part1",
                    "title": "第一部分：凯尔直营店周报",
                    "url": "",
                    "meeting_id": "",
                    "password": "",
                    "host": "凯尔/主持人",
                    "notes": "用于凯尔汇报直营店周报。",
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
                "凯尔从2026-06-22中国时间这次周会开始，会前必须填写直营店周报。",
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
                "report_due_note": "凯尔需在会前3-6小时完成直营店周报。",
                "notes": "从这次开始正式执行凯尔会前周报、会后上传两段腾讯会议文字记录。",
                "created_at": created_at,
            },
        ],
        "weekly_reports": [],
        "pre_meeting_notes": [],
        "transcript_uploads": [],
        "action_items": [],
        "audit_logs": [],
    }


class Store:
    def __init__(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        TRANSCRIPT_DIR.mkdir(parents=True, exist_ok=True)
        self._firestore = None
        self._firebase_ready = False
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
        if self._firestore:
            ref = self.state_ref()
            doc = ref.get()
            if doc.exists:
                data = doc.to_dict() or {}
                state = data.get("state") or {}
                return ensure_state(state)
            state = default_state()
            self.save(state, "init")
            return state
        if STATE_PATH.exists():
            try:
                return ensure_state(json.loads(STATE_PATH.read_text(encoding="utf-8")))
            except Exception:
                traceback.print_exc()
        state = default_state()
        self.save(state, "init")
        return state

    def save(self, state: dict[str, Any], reason: str = "save") -> dict[str, Any]:
        state = ensure_state(state)
        state["updated_at"] = now_iso()
        if self._firestore:
            self.state_ref().set({"state": plain(state), "updated_at": now_iso(), "reason": reason})
        else:
            STATE_PATH.write_text(json.dumps(plain(state), ensure_ascii=False, indent=2), encoding="utf-8")
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
    state.setdefault("settings", {})
    state["settings"].setdefault("meeting_links", defaults["settings"]["meeting_links"])
    state["settings"].setdefault("meeting_rules", defaults["settings"]["meeting_rules"])
    state.setdefault("audit_logs", [])
    for user in state.get("users", []):
        user.setdefault("status", "pending")
        user.setdefault("role", "member")
        user.setdefault("person_id", "")
        user.setdefault("must_change_password", False)
    return state


def sanitize_user(user: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in user.items() if k != "password_hash"}


def user_by_id(state: dict[str, Any], user_id: str) -> dict[str, Any] | None:
    return next((u for u in state.get("users", []) if u.get("id") == user_id), None)


def person_by_id(state: dict[str, Any], person_id: str) -> dict[str, Any] | None:
    return next((p for p in state.get("people", []) if p.get("id") == person_id), None)


def get_user_person(state: dict[str, Any], user: dict[str, Any]) -> dict[str, Any] | None:
    return person_by_id(state, str(user.get("person_id") or ""))


def is_admin(user: dict[str, Any]) -> bool:
    return user.get("role") == "admin"


def is_manager(user: dict[str, Any]) -> bool:
    return user.get("role") in {"admin", "manager"}


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
    for person in state.get("people", []):
        names = [
            person.get("real_name"),
            person.get("chinese_name"),
            person.get("english_name"),
            person.get("display_name"),
            *(person.get("meeting_aliases") or []),
        ]
        for name in names:
            key = normalize_name(str(name or ""))
            if key:
                alias_map[key] = person

    speakers: dict[str, int] = {}
    patterns = [
        re.compile(r"^(?:\[\d{1,2}:\d{2}(?::\d{2})?\]\s*)?([^：:\n]{1,40})[：:]\s*\S"),
        re.compile(r"^([^：:\n]{1,40})\s+\d{1,2}:\d{2}(?::\d{2})?\s+"),
        re.compile(r"^\d{1,2}:\d{2}(?::\d{2})?\s+([^：:\n]{1,40})[：:]\s*\S"),
    ]
    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue
        for pattern in patterns:
            match = pattern.match(line)
            if match:
                name = match.group(1).strip()
                if len(name) <= 40:
                    speakers[name] = speakers.get(name, 0) + 1
                break
    matched = []
    unmatched = []
    for raw, count in sorted(speakers.items(), key=lambda item: (-item[1], item[0])):
        person = alias_map.get(normalize_name(raw))
        if person:
            matched.append({"speaker": raw, "count": count, "person_id": person.get("id"), "person_name": person.get("display_name")})
        else:
            unmatched.append({"speaker": raw, "count": count})
    return {"matched_speakers": matched, "unmatched_speakers": unmatched}


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
            if not is_manager(user):
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
            self.set_cookie("", max_age=0)
            self.send_json({"ok": True})
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
        if is_manager(user):
            return {
                "users": [sanitize_user(u) for u in state.get("users", [])],
                "people": state.get("people", []),
                "settings": state.get("settings", {}),
                "meetings": state.get("meetings", []),
                "weekly_reports": state.get("weekly_reports", []),
                "pre_meeting_notes": state.get("pre_meeting_notes", []),
                "transcript_uploads": state.get("transcript_uploads", []),
                "action_items": state.get("action_items", []),
                "audit_logs": state.get("audit_logs", [])[-80:] if is_admin(user) else [],
            }
        person_id = user.get("person_id")
        return {
            "users": [sanitize_user(user)],
            "people": [p for p in state.get("people", []) if p.get("id") == person_id],
            "settings": state.get("settings", {}),
            "meetings": state.get("meetings", []),
            "weekly_reports": [r for r in state.get("weekly_reports", []) if r.get("person_id") == person_id],
            "pre_meeting_notes": [n for n in state.get("pre_meeting_notes", []) if n.get("person_id") == person_id],
            "transcript_uploads": [],
            "action_items": [a for a in state.get("action_items", []) if a.get("owner_person_id") in {"", person_id}],
            "audit_logs": [],
        }

    def handle_register(self, payload: dict[str, Any]) -> None:
        state = store.load()
        username = str(payload.get("username") or "").strip()
        password = str(payload.get("password") or "")
        display_name = str(payload.get("display_name") or username).strip()
        if not re.match(r"^[A-Za-z0-9_.@-]{3,40}$", username):
            self.send_json({"ok": False, "error": "用户名至少3位，只能包含字母、数字、点、下划线、横线或@"}, 400)
            return
        if len(password) < 6:
            self.send_json({"ok": False, "error": "密码至少6位"}, 400)
            return
        if any(u.get("username", "").lower() == username.lower() for u in state.get("users", [])):
            self.send_json({"ok": False, "error": "用户名已存在"}, 400)
            return
        person_id = new_id("person")
        user_id = new_id("user")
        state["people"].append(
            {
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
                "meeting_aliases": [display_name, username],
            }
        )
        state["users"].append(
            {
                "id": user_id,
                "username": username,
                "password_hash": password_hash(password),
                "role": "member",
                "status": "pending",
                "person_id": person_id,
                "created_at": now_iso(),
                "last_login_at": "",
                "must_change_password": False,
            }
        )
        audit(state, None, "register", {"username": username, "person_id": person_id})
        store.save(state, "register")
        self.send_json({"ok": True, "message": "注册已提交，等待管理员审核。"})

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
        audit(state, user, "login")
        store.save(state, "login")
        token = sign_session(user["id"])
        body = json.dumps({"ok": True, "user": sanitize_user(user), "person": get_user_person(state, user)}, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.set_cookie(token)
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
        existing = next((n for n in state["pre_meeting_notes"] if n.get("id") == note_id), None)
        person_id = str(payload.get("person_id") or user.get("person_id") or "")
        if existing and not is_manager(user) and existing.get("person_id") != user.get("person_id"):
            self.send_json({"ok": False, "error": "No permission"}, 403)
            return
        if not is_manager(user) and person_id != user.get("person_id"):
            person_id = str(user.get("person_id") or "")
        data = {
            "meeting_id": str(payload.get("meeting_id") or ""),
            "person_id": person_id,
            "meeting_part": str(payload.get("meeting_part") or "part2"),
            "module": str(payload.get("module") or ""),
            "question": str(payload.get("question") or ""),
            "support_needed": str(payload.get("support_needed") or ""),
            "suggestion": str(payload.get("suggestion") or ""),
            "needs_decision": bool(payload.get("needs_decision")),
            "priority": str(payload.get("priority") or "中"),
            "mentioned": bool(payload.get("mentioned")),
            "result": str(payload.get("result") or ""),
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
        if not is_manager(user):
            self.send_json({"ok": False, "error": "Only manager/admin can upload transcripts"}, 403)
            return
        content = str(payload.get("content") or "")
        if len(content.strip()) < 10:
            self.send_json({"ok": False, "error": "文字记录内容太短"}, 400)
            return
        transcript_id = new_id("transcript")
        analysis = extract_speakers(content, state)
        record = {
            "id": transcript_id,
            "meeting_id": str(payload.get("meeting_id") or ""),
            "part": str(payload.get("part") or "part1"),
            "title": str(payload.get("title") or ""),
            "original_filename": str(payload.get("filename") or ""),
            "char_count": len(content),
            "line_count": len(content.splitlines()),
            "content_preview": content[:300],
            "matched_speakers": analysis["matched_speakers"],
            "unmatched_speakers": analysis["unmatched_speakers"],
            "uploaded_by": user.get("id"),
            "uploaded_at": now_iso(),
        }
        store.save_transcript_content(transcript_id, content)
        state["transcript_uploads"].append(record)
        audit(state, user, "upload_transcript", {"meeting_id": record["meeting_id"], "part": record["part"], "id": transcript_id})
        store.save(state, "upload_transcript")
        self.send_json({"ok": True, "record": record})

    def handle_save_action(self, state: dict[str, Any], user: dict[str, Any], payload: dict[str, Any]) -> None:
        if not is_manager(user):
            self.send_json({"ok": False, "error": "Only manager/admin can edit action items"}, 403)
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
        if collection == "action_items" and not is_manager(user):
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
            if not username or any(u.get("username", "").lower() == username.lower() for u in state["users"]):
                self.send_json({"ok": False, "error": "用户名为空或已存在"}, 400)
                return
            user_id = new_id("user")
            person_id = str(payload.get("person_id") or "")
            state["users"].append(
                {
                    "id": user_id,
                    "username": username,
                    "password_hash": password_hash(password),
                    "role": str(payload.get("role") or "member"),
                    "status": str(payload.get("status") or "active"),
                    "person_id": person_id,
                    "created_at": now_iso(),
                    "last_login_at": "",
                    "must_change_password": True,
                }
            )
            audit(state, user, "admin_create_user", {"username": username})
            store.save(state, "admin_create_user")
            self.send_json({"ok": True, "temporary_password": password})
            return
        if path == "/api/admin/save-user":
            target = user_by_id(state, str(payload.get("id") or ""))
            if not target:
                self.send_json({"ok": False, "error": "用户不存在"}, 404)
                return
            for key in ["role", "status", "person_id"]:
                if key in payload:
                    target[key] = payload.get(key)
            audit(state, user, "admin_save_user", {"user_id": target.get("id")})
            store.save(state, "admin_save_user")
            self.send_json({"ok": True, "user": sanitize_user(target)})
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
                "meeting_aliases": payload.get("meeting_aliases") or [],
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
