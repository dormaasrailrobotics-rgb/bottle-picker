#!/usr/bin/env python3
"""BottleBot Raspberry Pi outbound agent.

The agent never opens a listening control port. It makes outbound HTTPS requests
from the Pi to the hosted Command Center and bridges approved commands to the
Arduino over the local serial connection.
Also includes auto-discovery for USB webcam and USB serial, error reporting for AI self-healing,
and CLI test tools (`test-camera` and `test-serial`).
"""
import base64
import glob
import json
import os
import sys
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


def find_serial_port():
    if "SERIAL_PORT" in os.environ:
        return os.environ["SERIAL_PORT"]
    ports = glob.glob("/dev/ttyACM*") + glob.glob("/dev/ttyUSB*")
    return ports[0] if ports else "/dev/ttyACM0"


def find_camera_index():
    if "CAMERA_INDEX" in os.environ:
        return int(os.environ["CAMERA_INDEX"])
    for idx in range(4):
        cap = cv2.VideoCapture(idx) if cv2 else None
        if cap is not None and cap.isOpened():
            cap.release()
            return idx
    return 0


def serial_command(arduino, command, label=None):
    if arduino is None:
        return {"ok": False, "error": "Arduino serial is unavailable or disconnected"}
    wire_command = f"PICK {label}" if command == "PICK" and label else command
    try:
        arduino.write((wire_command + "\n").encode())
        line = arduino.readline().decode(errors="replace").strip()
        if not line:
            return {"ok": False, "error": "Arduino acknowledgement timeout"}
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            return {"ok": False, "raw": line, "error": "Invalid JSON response from Arduino"}
    except Exception as exc:
        return {"ok": False, "error": f"Serial communication exception: {exc}"}


def pair(site_url, code, name):
    response = requests.post(site_url.rstrip('/') + '/api/agent/pair', json={'code': code, 'name': name}, timeout=20)
    response.raise_for_status()
    data = response.json()
    if not data.get('token'):
        raise SystemExit(data.get('error', 'Pairing failed'))
    CONFIG.parent.mkdir(parents=True, exist_ok=True)
    existing = CONFIG.read_text() if CONFIG.exists() else ''
    lines = [line for line in existing.splitlines() if not line.startswith(('BOTTLEBOT_SITE_URL=', 'BOTTLEBOT_AGENT_TOKEN='))]
    lines += [f'BOTTLEBOT_SITE_URL={site_url.rstrip("/")}', f'BOTTLEBOT_AGENT_TOKEN={data["token"]}']
    CONFIG.write_text('\n'.join(lines) + '\n')
    CONFIG.chmod(0o600)
    print(f"Paired robot {data.get('name', 'BottleBot')} as id {data.get('robotId')}. Token saved to {CONFIG}.")


def test_camera():
    if cv2 is None:
        print("Error: OpenCV (cv2) is not installed in Python environment.")
        sys.exit(1)
    idx = find_camera_index()
    print(f"Testing webcam hardware at index {idx}...")
    cap = cv2.VideoCapture(idx)
    if not cap.isOpened():
        print(f"Error: Could not open camera device at index {idx}.")
        sys.exit(1)
    ret, frame = cap.read()
    cap.release()
    if ret and frame is not None:
        h, w, c = frame.shape
        print(f"Success! Captured frame: {w}x{h} with {c} color channels.")
    else:
        print("Error: Camera opened but failed to capture a frame.")
        sys.exit(1)


def test_serial():
    if serial is None:
        print("Error: PySerial is not installed in Python environment.")
        sys.exit(1)
    port = find_serial_port()
    print(f"Testing Arduino USB serial connection on port {port} at 115200 baud...")
    try:
        dev = serial.Serial(port, 115200, timeout=2)
        time.sleep(1.5)
        dev.write(b"HOME\n")
        res = dev.readline().decode(errors="replace").strip()
        dev.close()
        print(f"Response from Arduino: {res}")
    except Exception as exc:
        print(f"Error connecting to serial port {port}: {exc}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='action')
    pair_parser = sub.add_parser('pair')
    pair_parser.add_argument('--url', required=True)
    pair_parser.add_argument('--code', required=True)
    pair_parser.add_argument('--name', default='BottleBot Pi')
    sub.add_parser('test-camera')
    sub.add_parser('test-serial')

    args = parser.parse_args()
    if args.action == 'pair':
        pair(args.url, args.code, args.name)
        return
    elif args.action == 'test-camera':
        test_camera()
        return
    elif args.action == 'test-serial':
        test_serial()
        return

    load_env()
    url = require("BOTTLEBOT_SITE_URL").rstrip("/")
    token = require("BOTTLEBOT_AGENT_TOKEN")

    serial_port = find_serial_port()
    camera_index = find_camera_index()
    interval = float(os.environ.get("AGENT_INTERVAL_SECONDS", "0.8"))

    arduino = None
    if serial is not None:
        try:
            arduino = serial.Serial(serial_port, 115200, timeout=1)
        except Exception as err:
            print(f"Serial init warning: {err}")

    camera = None
    if cv2 is not None:
        try:
            camera = cv2.VideoCapture(camera_index)
            if not camera.isOpened():
                camera.release()
                camera = None
        except Exception as err:
            print(f"Camera init warning: {err}")

    print(f"BottleBot agent active. Server={url}; camera={'ready' if camera else 'offline'} ({camera_index}); serial={'ready' if arduino else 'offline'} ({serial_port})")

    last_serial_err = None
    while True:
        fault_msg = None
        if arduino is None and serial is not None:
            try:
                arduino = serial.Serial(serial_port, 115200, timeout=1)
                last_serial_err = None
            except Exception as err:
                fault_msg = f"Arduino USB serial port ({serial_port}) unavailable: {err}"
                if fault_msg != last_serial_err:
                    print(fault_msg)
                    last_serial_err = fault_msg

        telemetry = {
            "safetyLocked": True,
            "cameraConnected": camera is not None,
            "arduinoConnected": arduino is not None,
            "serialPort": serial_port,
            "cameraIndex": camera_index,
            "timestamp": time.time(),
            "fault": fault_msg
        }

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
                        call("POST", f"{url}/api/agent/frame", token, {
                            "jpegBase64": base64.b64encode(encoded.tobytes()).decode(),
                            "detections": []
                        })
        except Exception as exc:
            print(f"BottleBot agent loop warning: {exc}")
        time.sleep(interval)


if __name__ == "__main__":
    main()
