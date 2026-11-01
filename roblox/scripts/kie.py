"""Minimal client for kie.ai image generation (Nano Banana Pro) used by the art scripts.

Needs KIE_API_KEY in the environment, e.g.
  KIE_API_KEY="$(op read 'op://Robin/Codex Shared API Tokens/KIE_API_KEY')"
"""

import json
import os
import ssl
import sys
import time
import urllib.request
import uuid

from PIL import Image

API = "https://api.kie.ai/api/v1/jobs"
UPLOAD = "https://kieai.redpandaai.co/api/file-stream-upload"
MODEL = "nano-banana-pro"


def ssl_context():
    # python.org builds on macOS ship without system certificates; use certifi when present.
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


SSL = ssl_context()


def api_key():
    key = os.environ.get("KIE_API_KEY")
    if not key:
        sys.exit("Set KIE_API_KEY (for example from 1Password with `op read`).")
    return key


def request(url, key, body=None, headers=None):
    req = urllib.request.Request(url, data=body, headers={"Authorization": f"Bearer {key}", **(headers or {})})
    with urllib.request.urlopen(req, timeout=120, context=SSL) as resp:
        return json.loads(resp.read())


def upload(path, key, upload_path="ice-king"):
    boundary = uuid.uuid4().hex
    parts = []
    for name, value in (("uploadPath", upload_path), ("fileName", f"{uuid.uuid4().hex[:8]}-{path.name}")):
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    parts.append(
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{path.name}"\r\n'
        f"Content-Type: image/png\r\n\r\n".encode() + path.read_bytes() + b"\r\n"
    )
    parts.append(f"--{boundary}--\r\n".encode())
    result = request(UPLOAD, key, b"".join(parts), {"Content-Type": f"multipart/form-data; boundary={boundary}"})
    if not result.get("success") and result.get("code") != 200:
        sys.exit(f"upload failed: {result}")
    return result["data"]["downloadUrl"]


def generate(prompt, image_urls, key):
    body = {
        "model": MODEL,
        "input": {"prompt": prompt, "image_input": image_urls, "aspect_ratio": "1:1", "resolution": "1K", "output_format": "png"},
    }
    created = request(f"{API}/createTask", key, json.dumps(body).encode(), {"Content-Type": "application/json"})
    if created.get("code") != 200:
        sys.exit(f"createTask failed: {created}")
    task = created["data"]["taskId"]
    print(f"  task {task}", flush=True)
    delay = 3
    while True:
        time.sleep(delay)
        info = request(f"{API}/recordInfo?taskId={task}", key)["data"]
        if info["state"] == "success":
            return json.loads(info["resultJson"])["resultUrls"][0]
        if info["state"] == "fail":
            sys.exit(f"generation failed: {info.get('failCode')} {info.get('failMsg')}")
        delay = min(delay + 2, 15)


def download(url, path):
    with urllib.request.urlopen(url, timeout=120, context=SSL) as resp:
        path.write_bytes(resp.read())
    Image.open(path).convert("RGB").save(path)  # normalise to plain RGB PNG
