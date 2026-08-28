# Project TODO

- [ ] Permanent authenticated BottleBot Command Center hosted on a stable HTTPS URL
- [x] Cyberpunk HUD visual system with deep black, neon pink, electric cyan, glow, technical lines, and corner brackets
- [x] Authenticated operator access and protected robot-control routes
- [x] Database schema for paired robots, pairing tokens, telemetry history, command audit history, and alerts
- [x] Secure Raspberry Pi pairing flow with expiring one-time pairing code
- [x] Outbound authenticated Raspberry Pi agent protocol with no public Pi control port
- [x] Realtime Pi connection heartbeat and disconnect detection
- [x] Live robot connection status and telemetry dashboard
- [x] Authorized live camera relay from the connected Raspberry Pi
- [x] Numbered-bottle detections and target selection in the dashboard
- [x] Camera-question workflow using NVIDIA NIM vision inference
- [x] Guarded drive, arm, gripper, autonomous pick, safety-lock, and emergency-stop controls
- [x] Command acknowledgements and database-backed audit trail
- [x] Natural-language text and browser voice requests through NVIDIA NIM
- [x] Existing allow-list enforcement before Arduino commands
- [x] Owner alerts for Pi disconnect, emergency stop, and hardware fault
- [x] In-app Pi installation, pairing, and persistent-service guide
- [x] Unit tests for pairing, authorization, command allow-list, telemetry, and alerts
- [x] Browser verification of authenticated dashboard and realtime states
- [ ] Final checkpoint before user publishes the permanent website

## Follow-up hardening before publication

- [ ] Publish the WebDev project to a permanent hosted URL and record the production hosting mode
- [x] Send the selected bottle label/number through the dashboard, backend, queue, and Pi agent pick workflow
- [x] Persist agent command acknowledgements by updating the database audit record
- [x] Expand the in-app deployment guide with concrete install, pairing, environment, and systemd commands
- [x] Add Vitest coverage for pairing expiry/use, protected robot procedures, telemetry transitions, and alert creation
