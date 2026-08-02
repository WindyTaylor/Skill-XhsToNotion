import base64
import sys
from pathlib import Path
from types import SimpleNamespace

PROGRAM_DIR = Path(__file__).resolve().parents[1] / "program"
sys.path.insert(0, str(PROGRAM_DIR))

from manage_server import ManagementConsoleHandler  # noqa: E402


def make_handler(auth_config, host="127.0.0.1", authorization=""):
    handler = object.__new__(ManagementConsoleHandler)
    handler.server = SimpleNamespace(auth_config=auth_config)
    handler.headers = {"Host": host}
    if authorization:
        handler.headers["Authorization"] = authorization
    return handler


def basic_auth(username, password):
    token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
    return f"Basic {token}"


def test_local_request_allowed_without_password():
    handler = make_handler({"enabled": False, "username": "admin", "password": ""})
    assert handler.is_authorized("/")


def test_public_host_blocked_without_password():
    handler = make_handler(
        {"enabled": False, "username": "admin", "password": ""},
        host="xhs.example.com",
    )
    assert not handler.is_authorized("/")


def test_basic_auth_required_for_public_host_when_password_is_set():
    auth_config = {"enabled": True, "username": "admin", "password": "secret"}
    assert not make_handler(auth_config, host="xhs.example.com").is_authorized("/")
    assert make_handler(
        auth_config,
        host="xhs.example.com",
        authorization=basic_auth("admin", "secret"),
    ).is_authorized("/")
