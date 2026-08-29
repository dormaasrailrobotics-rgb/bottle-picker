# BottleBot Command Center

**BottleBot Command Center** is a real-world, production-ready web application and control system designed to run on a **Raspberry Pi 5** connected to an **Arduino microcontroller** via USB serial and a **USB Webcam**.

It provides real-time robot control over a local Wi-Fi / Ethernet network (`0.0.0.0`), a dedicated **USB Webcam Test Bench** page, natural language text/voice AI chat with vision awareness, and **Autonomous AI Diagnostics & Self-Healing**.

---

## 🌟 Key Features

1. **Real Hardware Communication**:
   - Outbound Raspberry Pi agent (`pi_agent/agent.py`) bridges Web App commands to Arduino via USB serial (`/dev/ttyACM*` or `/dev/ttyUSB*`).
   - Arduino C++ sketch (`arduino/bottlebot.ino`) directly controls motor drivers (L298N / SmartDrive) and gripper servos with a 2-second safety watchdog.
2. **Local Network Hosting**:
   - Server binds to `0.0.0.0` on port `3000` (configurable), allowing any device (smartphones, tablets, PCs) on the Pi's local network to access the web app.
3. **Dedicated USB Webcam Test UI (`/camera-test`)**:
   - Test USB webcam stream feeds, capture snapshots, select stream resolutions, and run vision AI diagnostics directly from the browser.
4. **AI Vision & Voice Interface**:
   - Powered by **NVIDIA NIM** (`meta/llama-3.3-70b-instruct` and `nvidia/nemotron-nano-12b-v2-vl`).
   - Supports natural language text commands, browser voice-to-text input, and image vision prompts on live camera frames.
5. **Autonomous AI Diagnostics & Self-Healing**:
   - Automatically detects system hardware faults or serial disconnects, analyzes error logs, and attempts safe recovery actions (e.g., `STOP`, `UNLOCK`, `HOME`) or alerts the operator.

---

## 📁 Repository Structure

```
├── arduino/
│   └── bottlebot.ino          # Production Arduino firmware (Serial @ 115200 baud)
├── pi_agent/
│   └── agent.py               # Outbound Python agent for Raspberry Pi 5
├── client/                     # React + Vite Cyberpunk HUD interface
│   └── src/pages/
│       ├── Home.tsx           # Main Command Center dashboard
│       └── WebcamTest.tsx     # USB Webcam test bench page
├── server/                     # Node.js + Express + tRPC API
│   ├── _core/index.ts         # Server entry point (binds to 0.0.0.0)
│   ├── bottlebot.ts           # Core robot state & safety allow-list
│   ├── nvidia.ts              # NVIDIA NIM AI integration & self-healing
│   └── routers.ts             # tRPC API router
└── package.json               # Node.js dependencies & scripts
```

---

## 🚀 Quick Start Guide

### 1. Arduino Setup
1. Connect your Arduino board to your computer via USB.
2. Open `arduino/bottlebot.ino` in the **Arduino IDE**.
3. Install the default `Servo` library if needed.
4. Select your Arduino Board and Port, then click **Upload**.
5. Connect the Arduino to one of the **Raspberry Pi 5 USB ports**.

#### Pin Configuration:
- `MOTOR_LEFT_PWM`: Pin 5
- `MOTOR_LEFT_DIR`: Pin 4
- `MOTOR_RIGHT_PWM`: Pin 6
- `MOTOR_RIGHT_DIR`: Pin 7
- `SERVO_GRIPPER_PIN`: Pin 9
- `ESTOP_INTERRUPT_PIN`: Pin 2 (Pull-up input for physical emergency stop button)

---

### 2. Raspberry Pi 5 Setup

#### A. Install Server Dependencies & Start App
```bash
# Clone the repository on your Raspberry Pi 5
git clone https://github.com/your-repo/bottlebot-command-center.git
cd bottlebot-command-center

# Install Node dependencies
pnpm install

# Build for production
pnpm build

# Start the server (binds to 0.0.0.0:3000)
pnpm start
```
*You can now open `http://<raspberry-pi-ip>:3000` from any phone or computer connected to the same Wi-Fi network.*

---

#### B. Setup Python Agent on Raspberry Pi 5
```bash
# Install Python virtual environment and dependencies
sudo apt update && sudo apt install -y python3-venv python3-pip python3-opencv
python3 -m venv .venv
source .venv/bin/activate
pip install requests pyserial opencv-python

# Test hardware devices (optional)
python pi_agent/agent.py test-serial   # Tests Arduino USB serial
python pi_agent/agent.py test-camera   # Tests USB webcam frame capture

# Pair the Pi agent with the Web App
# 1. Open the Web App (http://<pi-ip>:3000) and click "Generate Code" under "Pair a Raspberry Pi"
# 2. Run the pair command:
python pi_agent/agent.py pair --url http://localhost:3000 --code YOUR-10-MIN-CODE

# Start the agent daemon
python pi_agent/agent.py
```

---

## 🛠 Command Allow-List (Safety First)

For hardware safety, only approved actions are permitted to execute on the physical robot:
- `FORWARD`, `BACK`, `LEFT`, `RIGHT`
- `STOP`, `ESTOP` (Emergency Stop)
- `UNLOCK` (Releases safety lock after E-STOP or reboot)
- `HOME` (Resets motors and opens gripper)
- `OPEN GRIPPER`, `CLOSE GRIPPER`
- `AUTO`, `PICK`

---

## 🧪 Testing

Run system checks and test suites:
```bash
# Run TypeScript compilation check
pnpm check

# Run Vitest unit & integration test suite
pnpm test
```

---

## 📄 License
MIT License. Free for open-source and personal robotics projects.
