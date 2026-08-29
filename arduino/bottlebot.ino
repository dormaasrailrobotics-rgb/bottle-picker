/*
  BottleBot Arduino Firmware (Adafruit Motor Shield v1/v2 + 4-Servo Arm)
  Communicates with Raspberry Pi 5 via USB Serial (115200 or 9600 baud).
  Supports 4 DC Motors (AFMotor) and 4 Servos (Shoulder, Elbow, Gripper, Base),
  Ultrasonic Sensor (Trig 11, Echo 7), and safety watchdog.
  Outputs JSON responses for Pi agent integration.
*/

#include <Servo.h>
#include <AFMotor.h>

// Servo Pin Definitions
const int SHOULDER_PIN = 2;
const int ELBOW_PIN    = 13;
const int GRIPPER_PIN  = 10;
const int BASE_PIN     = 9;

// DC Motor Definitions (Adafruit Motor Shield)
AF_DCMotor motor1(1);
AF_DCMotor motor2(2);
AF_DCMotor motor3(3);
AF_DCMotor motor4(4);

// Ultrasonic Sensor Pins
const int TRIG_PIN = 11;
const int ECHO_PIN = 7;

// Configuration Angles & Ranges
const int SHOULDER_UP      = 40;
const int SHOULDER_FORWARD = 90;
const int SHOULDER_BACK    = 5;
const int SHOULDER_CENTER  = 70;

const int ELBOW_DOWN = 170;
const int ELBOW_UP   = 80;

const int GRIPPER_OPEN  = 100;
const int GRIPPER_CLOSE = 50;

const int BASE_MIN    = 0;
const int BASE_MAX    = 180;
const int BASE_CENTER = 32;

const int MOVE_DELAY = 6;
#define WATCHDOG_TIMEOUT_MS 3000

Servo shoulder, elbow, gripper, base;
int targetGripperClose = GRIPPER_CLOSE;
bool hasItem = false;
bool emergencyStopped = false;
bool safetyLocked = false;
unsigned long lastCommandTime = 0;

void setup() {
  Serial.begin(115200);

  shoulder.attach(SHOULDER_PIN);
  elbow.attach(ELBOW_PIN);
  gripper.attach(GRIPPER_PIN);
  base.attach(BASE_PIN);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  goHome();
  stopCar();
  lastCommandTime = millis();

  Serial.println(F("{\"ok\":true,\"status\":\"ready\",\"message\":\"ROBOT READY - FULL BASE RANGE\"}"));
}

void loop() {
  // Watchdog safety check
  if (!safetyLocked && !emergencyStopped && (millis() - lastCommandTime > WATCHDOG_TIMEOUT_MS)) {
    stopCar();
  }

  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    input.trim();
    if (input.length() > 0) {
      processCommand(input);
    }
  }
}

void processCommand(String cmd) {
  lastCommandTime = millis();
  String upperCmd = cmd;
  upperCmd.toUpperCase();

  // Full Word / Web API Commands
  if (upperCmd == "ESTOP" || upperCmd == "X") {
    emergencyStopped = true;
    safetyLocked = true;
    stopCar();
    Serial.println(F("{\"ok\":true,\"status\":\"estopped\",\"message\":\"Emergency stop activated\"}"));
    return;
  }

  if (upperCmd == "UNLOCK") {
    emergencyStopped = false;
    safetyLocked = false;
    Serial.println(F("{\"ok\":true,\"status\":\"unlocked\",\"message\":\"Safety lock released\"}"));
    return;
  }

  if (emergencyStopped) {
    Serial.println(F("{\"ok\":false,\"error\":\"Robot is in ESTOP state. Send UNLOCK first.\"}"));
    return;
  }

  // Handle direct angle commands like G90, S40, E120, B90
  if (cmd.length() > 1 && (cmd[0] == 'G' || cmd[0] == 'S' || cmd[0] == 'E' || cmd[0] == 'B') && isDigit(cmd[1])) {
    int angle = cmd.substring(1).toInt();
    angle = constrain(angle, 0, 180);
    if (cmd[0] == 'G') { targetGripperClose = angle; setGripper(angle); }
    else if (cmd[0] == 'S') { smoothMove(shoulder, angle, MOVE_DELAY); }
    else if (cmd[0] == 'E') { smoothMove(elbow, angle, MOVE_DELAY); }
    else if (cmd[0] == 'B') { smoothMove(base, angle, MOVE_DELAY); }
    Serial.println("{\"ok\":true,\"command\":\"" + cmd + "\",\"status\":\"angle_set\"}");
    return;
  }

  // Word Mapping to Actions
  if (upperCmd == "FORWARD") cmd = "F";
  else if (upperCmd == "BACK" || upperCmd == "BACKWARD") cmd = "R";
  else if (upperCmd == "LEFT") cmd = "L";
  else if (upperCmd == "RIGHT") cmd = "r";
  else if (upperCmd == "STOP") cmd = "S";
  else if (upperCmd == "HOME") cmd = "H";
  else if (upperCmd == "OPEN GRIPPER") cmd = "O";
  else if (upperCmd == "CLOSE GRIPPER") cmd = "o";
  else if (upperCmd == "AUTO" || upperCmd.startsWith("PICK")) cmd = "P";

  char c = cmd[0];

  switch (c) {
    case 'F': forward(); Serial.println(F("{\"ok\":true,\"command\":\"FORWARD\",\"status\":\"moving\"}")); break;
    case 'f': forwardSlow(); Serial.println(F("{\"ok\":true,\"command\":\"FORWARD_SLOW\",\"status\":\"moving\"}")); break;
    case 'R': backward(); Serial.println(F("{\"ok\":true,\"command\":\"BACK\",\"status\":\"moving\"}")); break;
    case 'L': left(); Serial.println(F("{\"ok\":true,\"command\":\"LEFT\",\"status\":\"turning\"}")); break;
    case 'r': right(); Serial.println(F("{\"ok\":true,\"command\":\"RIGHT\",\"status\":\"turning\"}")); break;
    case 'S': stopCar(); Serial.println(F("{\"ok\":true,\"command\":\"STOP\",\"status\":\"stopped\"}")); break;

    case 'H': goHome(); Serial.println(F("{\"ok\":true,\"command\":\"HOME\",\"status\":\"homed\"}")); break;
    case 'U': armUp(); Serial.println(F("{\"ok\":true,\"command\":\"ARM_UP\",\"status\":\"ok\"}")); break;
    case 'D': armDown(); Serial.println(F("{\"ok\":true,\"command\":\"ARM_DOWN\",\"status\":\"ok\"}")); break;
    case 'T': armForward(); Serial.println(F("{\"ok\":true,\"command\":\"ARM_FORWARD\",\"status\":\"ok\"}")); break;
    case 'C': armCenter(); Serial.println(F("{\"ok\":true,\"command\":\"ARM_CENTER\",\"status\":\"ok\"}")); break;

    case 'O': openGripper(); Serial.println(F("{\"ok\":true,\"command\":\"OPEN_GRIPPER\",\"status\":\"opened\"}")); break;
    case 'o': closeGripper(); Serial.println(F("{\"ok\":true,\"command\":\"CLOSE_GRIPPER\",\"status\":\"closed\"}")); break;

    case 'N': baseLeft(); Serial.println(F("{\"ok\":true,\"command\":\"BASE_LEFT\",\"status\":\"ok\"}")); break;
    case 'M': baseRight(); Serial.println(F("{\"ok\":true,\"command\":\"BASE_RIGHT\",\"status\":\"ok\"}")); break;
    case 'K': baseCenter(); Serial.println(F("{\"ok\":true,\"command\":\"BASE_CENTER\",\"status\":\"ok\"}")); break;

    case 'P': pickSequence(); Serial.println(F("{\"ok\":true,\"command\":\"PICK\",\"status\":\"picked\"}")); break;
    case 'Q': dropSequence(); Serial.println(F("{\"ok\":true,\"command\":\"DROP\",\"status\":\"dropped\"}")); break;

    case 'Y': {
      float d = measureDistance();
      Serial.print(F("{\"ok\":true,\"command\":\"ULTRASONIC\",\"distance\":"));
      Serial.print(d);
      Serial.println(F("}"));
      break;
    }

    default:
      Serial.println("{\"ok\":false,\"error\":\"Unknown command: " + cmd + "\"}");
      break;
  }
}

void smoothMove(Servo &s, int target, int d) {
  int cur = s.read();
  int step = (target > cur) ? 1 : -1;
  while (cur != target) {
    cur += step;
    s.write(cur);
    delay(d);
    if ((step > 0 && cur > target) || (step < 0 && cur < target)) cur = target;
  }
}

void setGripper(int angle) {
  angle = constrain(angle, 0, 180);
  int cur = gripper.read();
  int step = (angle > cur) ? 1 : -1;
  while (cur != angle) {
    cur += step;
    gripper.write(cur);
    delay(10);
    if ((step > 0 && cur > angle) || (step < 0 && cur < angle)) cur = angle;
  }
}

void forward()     { setMotors(FORWARD, 180); }
void forwardSlow() { setMotors(FORWARD, 110); }
void backward()    { setMotors(BACKWARD, 180); }
void left()        { turnMotors(BACKWARD, FORWARD, 160); }
void right()       { turnMotors(FORWARD, BACKWARD, 160); }
void stopCar()     { setMotors(RELEASE, 0); }

void setMotors(int dir, int spd) {
  motor1.run(dir); motor2.run(dir); motor3.run(dir); motor4.run(dir);
  motor1.setSpeed(spd); motor2.setSpeed(spd); motor3.setSpeed(spd); motor4.setSpeed(spd);
}

void turnMotors(int d1, int d2, int spd) {
  motor1.run(d1); motor2.run(d1); motor3.run(d2); motor4.run(d2);
  motor1.setSpeed(spd); motor2.setSpeed(spd); motor3.setSpeed(spd); motor4.setSpeed(spd);
}

float measureDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  if (duration == 0) return 999.0;
  return duration * 0.034 / 2.0;
}

void goHome() {
  smoothMove(base, BASE_CENTER, MOVE_DELAY);
  smoothMove(shoulder, SHOULDER_CENTER, MOVE_DELAY);
  smoothMove(elbow, ELBOW_UP, MOVE_DELAY);
  openGripper();
  hasItem = false;
}

void armUp()      { smoothMove(shoulder, SHOULDER_UP, MOVE_DELAY); }
void armDown()    {
  smoothMove(shoulder, SHOULDER_FORWARD, MOVE_DELAY);
  smoothMove(elbow, ELBOW_DOWN, MOVE_DELAY);
}
void armForward() { smoothMove(shoulder, SHOULDER_FORWARD, MOVE_DELAY); }
void armCenter()  {
  smoothMove(shoulder, SHOULDER_CENTER, MOVE_DELAY);
  smoothMove(elbow, ELBOW_UP, MOVE_DELAY);
}

void openGripper()  { setGripper(GRIPPER_OPEN); }
void closeGripper() { setGripper(GRIPPER_CLOSE); }

void baseLeft()   { smoothMove(base, BASE_MIN, MOVE_DELAY); }
void baseRight()  { smoothMove(base, BASE_MAX, MOVE_DELAY); }
void baseCenter() { smoothMove(base, BASE_CENTER, MOVE_DELAY); }

void pickSequence() {
  if (hasItem) return;
  openGripper();
  delay(200);
  smoothMove(shoulder, SHOULDER_FORWARD, MOVE_DELAY);
  delay(120);
  smoothMove(elbow, ELBOW_DOWN, MOVE_DELAY);
  delay(280);
  setGripper(targetGripperClose);
  delay(350);
  hasItem = true;
  smoothMove(elbow, ELBOW_UP, MOVE_DELAY);
  delay(120);
  smoothMove(shoulder, SHOULDER_BACK, MOVE_DELAY);
}

void dropSequence() {
  if (!hasItem) return;
  smoothMove(shoulder, SHOULDER_UP, MOVE_DELAY);
  delay(120);
  smoothMove(shoulder, SHOULDER_FORWARD, MOVE_DELAY);
  delay(120);
  smoothMove(elbow, ELBOW_DOWN, MOVE_DELAY);
  delay(220);
  openGripper();
  delay(280);
  hasItem = false;
  smoothMove(elbow, ELBOW_UP, MOVE_DELAY);
  delay(120);
  smoothMove(shoulder, SHOULDER_CENTER, MOVE_DELAY);
}
