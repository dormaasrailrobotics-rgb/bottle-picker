#!/usr/bin/env python3
"""BottleBot Raspberry Pi outbound agent.

The agent never opens a listening control port. It makes outbound HTTPS requests
from the Pi to the hosted Command Center and bridges approved commands to the
Arduino over the local serial connection.
"""
import base64
import json
import os
import time
import argparse
from pathlib import Path

import requests

try:
    import cv2
except ImportError:
    cv2 = None
try:
    import serial
except ImportError:
    serial = None

CONFIG = Path(os.environ.get("BOTTLEBOT_ENV", "/etc/bottlebot/agent.env"))

def load_env():
    if CONFIG.exists():
        for raw in CONFIG.read_text().splitlines():
            if raw.strip() and not raw.lstrip().startswith("#") and "=" in raw:
                key, value = raw.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip())


def require(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing {name} in {CONFIG}")
    return value


def call(method, url, token, payload=None):
    response = requests.request(method, url, headers={"Authorization": f"Bearer {token}"}, json=payload, timeout=15)
    response.raise_for_status()
    return response.json()


def serial_command(arduino, command, label=None):
    if arduino is None:
        return {"ok": False, "error": "Arduino serial is unavailable"}
    wire_command = f"PICK {label}" if command == "PICK" and label else command
    arduino.write((wire_command + "\n").encode())
    line = arduino.readline().decode(errors="replace").strip()
    try:
        return json.loads(line) if line else {"ok": False, "error": "Arduino acknowledgement timeout"}
    except json.JSONDecodeError:
        return {"ok": False, "raw": line}


def pair(site_url, code, name):
    response = requests.post(site_url.rstrip('/') + '/api/agent/pair', json={'code': code, 'name': name}, timeout=20)
    response.raise_for_status()
    data = response.json()
    if not data.get('token'): raise SystemExit(data.get('error', 'Pairing failed'))
    CONFIG.parent.mkdir(parents=True, exist_ok=True)
    existing = CONFIG.read_text() if CONFIG.exists() else ''
    lines = [line for line in existing.splitlines() if not line.startswith(('BOTTLEBOT_SITE_URL=', 'BOTTLEBOT_AGENT_TOKEN='))]
    lines += [f'BOTTLEBOT_SITE_URL={site_url.rstrip("/")}', f'BOTTLEBOT_AGENT_TOKEN={data["token"]}']
    CONFIG.write_text('\n'.join(lines) + '\n'); CONFIG.chmod(0o600)
    print(f"Paired robot {data.get('name', 'BottleBot')} as id {data.get('robotId')}. Token saved to {CONFIG}.")


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='action')
    pair_parser = sub.add_parser('pair'); pair_parser.add_argument('--url', required=True); pair_parser.add_argument('--code', required=True); pair_parser.add_argument('--name', default='BottleBot Pi')
    args = parser.parse_args()
    if args.action == 'pair':
        pair(args.url, args.code, args.name); return
    load_env()
    url = require("BOTTLEBOT_SITE_URL").rstrip("/")
    token = require("BOTTLEBOT_AGENT_TOKEN")
    serial_port = os.environ.get("SERIAL_PORT", "/dev/ttyACM0")
    camera_index = int(os.environ.get("CAMERA_INDEX", "0"))
    interval = float(os.environ.get("AGENT_INTERVAL_SECONDS", "0.8"))
    arduino = serial.Serial(serial_port, 115200, timeout=1) if serial else None
    camera = cv2.VideoCapture(camera_index) if cv2 else None
    if camera is not None and not camera.isOpened():
        camera.release(); camera = None
    print(f"BottleBot agent connected outbound to {url}; camera={'ready' if camera else 'offline'}; serial={'ready' if arduino else 'offline'}")
    while True:
        telemetry = {"safetyLocked": True, "cameraConnected": camera is not None, "arduinoConnected": arduino is not None, "timestamp": time.time()}
        try:
            call("POST", f"{url}/api/agent/heartbeat", token, telemetry)
            commands = call("GET", f"{url}/api/agent/commands", token).get("commands", [])
            for item in commands:
                result = serial_command(arduino, item["command"], item.get("label"))
                call("POST", f"{url}/api/agent/ack", token, {"commandId": item["id"], "result": result})
            if camera is not None:
                ok, frame = camera.read()
                if ok:
                    ok, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 72])
                    if ok:
                        call("POST", f"{url}/api/agent/frame", token, {"jpegBase64": base64.b64encode(encoded.tobytes()).decode(), "detections": []})
        except Exception as exc:
            print(f"BottleBot agent retry: {exc}")
        time.sleep(interval)


if __name__ == "__main__":
    main()
