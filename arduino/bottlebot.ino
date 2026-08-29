/*
  BottleBot Arduino Firmware
  Communicates with Raspberry Pi 5 via USB Serial (115200 baud).
  Controls DC Motor Driver (L298N / SmartDrive / Dual H-Bridge) and Gripper Servos.
  Includes safety watchdog timer, physical E-STOP interrupt, and JSON status acknowledgements.
*/

#include <Servo.h>

// Pin Definitions
#define MOTOR_LEFT_PWM 5
#define MOTOR_LEFT_DIR 4
#define MOTOR_RIGHT_PWM 6
#define MOTOR_RIGHT_DIR 7
#define SERVO_GRIPPER_PIN 9
#define ESTOP_INTERRUPT_PIN 2

// Configuration
#define SERIAL_BAUD 115200
#define WATCHDOG_TIMEOUT_MS 2000
#define GRIPPER_OPEN_ANGLE 120
#define GRIPPER_CLOSE_ANGLE 30

Servo gripperServo;
volatile bool emergencyStopped = false;
bool safetyLocked = true;
unsigned long lastCommandTime = 0;

void handleEStopInterrupt() {
  emergencyStopped = true;
  analogWrite(MOTOR_LEFT_PWM, 0);
  analogWrite(MOTOR_RIGHT_PWM, 0);
}

void setup() {
  Serial.begin(SERIAL_BAUD);

  pinMode(MOTOR_LEFT_PWM, OUTPUT);
  pinMode(MOTOR_LEFT_DIR, OUTPUT);
  pinMode(MOTOR_RIGHT_PWM, OUTPUT);
  pinMode(MOTOR_RIGHT_DIR, OUTPUT);
  pinMode(ESTOP_INTERRUPT_PIN, INPUT_PULLUP);

  attachInterrupt(digitalPinToInterrupt(ESTOP_INTERRUPT_PIN), handleEStopInterrupt, FALLING);

  gripperServo.attach(SERVO_GRIPPER_PIN);
  gripperServo.write(GRIPPER_OPEN_ANGLE);

  stopMotors();
  lastCommandTime = millis();
}

void stopMotors() {
  analogWrite(MOTOR_LEFT_PWM, 0);
  analogWrite(MOTOR_RIGHT_PWM, 0);
  digitalWrite(MOTOR_LEFT_DIR, LOW);
  digitalWrite(MOTOR_RIGHT_DIR, LOW);
}

void setMotors(int leftSpeed, int rightSpeed) {
  if (emergencyStopped || safetyLocked) {
    stopMotors();
    return;
  }

  // Left Motor
  if (leftSpeed >= 0) {
    digitalWrite(MOTOR_LEFT_DIR, HIGH);
    analogWrite(MOTOR_LEFT_PWM, min(leftSpeed, 255));
  } else {
    digitalWrite(MOTOR_LEFT_DIR, LOW);
    analogWrite(MOTOR_LEFT_PWM, min(-leftSpeed, 255));
  }

  // Right Motor
  if (rightSpeed >= 0) {
    digitalWrite(MOTOR_RIGHT_DIR, HIGH);
    analogWrite(MOTOR_RIGHT_PWM, min(rightSpeed, 255));
  } else {
    digitalWrite(MOTOR_RIGHT_DIR, LOW);
    analogWrite(MOTOR_RIGHT_PWM, min(-rightSpeed, 255));
  }
}

void processCommand(String cmd) {
  cmd.trim();
  cmd.toUpperCase();
  lastCommandTime = millis();

  if (cmd == "ESTOP") {
    emergencyStopped = true;
    safetyLocked = true;
    stopMotors();
    Serial.println("{\"ok\":true,\"status\":\"estopped\",\"message\":\"Emergency stop activated\"}");
    return;
  }

  if (cmd == "UNLOCK") {
    emergencyStopped = false;
    safetyLocked = false;
    Serial.println("{\"ok\":true,\"status\":\"unlocked\",\"message\":\"Safety lock released\"}");
    return;
  }

  if (emergencyStopped) {
    Serial.println("{\"ok\":false,\"error\":\"Robot is in ESTOP state. Send UNLOCK first.\"}");
    return;
  }

  if (safetyLocked && cmd != "STOP" && cmd != "HOME") {
    Serial.println("{\"ok\":false,\"error\":\"Safety lock active. Send UNLOCK to enable movement.\"}");
    return;
  }

  if (cmd == "FORWARD") {
    setMotors(180, 180);
    Serial.println("{\"ok\":true,\"command\":\"FORWARD\",\"status\":\"moving\"}");
  } else if (cmd == "BACK") {
    setMotors(-180, -180);
    Serial.println("{\"ok\":true,\"command\":\"BACK\",\"status\":\"moving\"}");
  } else if (cmd == "LEFT") {
    setMotors(-150, 150);
    Serial.println("{\"ok\":true,\"command\":\"LEFT\",\"status\":\"turning\"}");
  } else if (cmd == "RIGHT") {
    setMotors(150, -150);
    Serial.println("{\"ok\":true,\"command\":\"RIGHT\",\"status\":\"turning\"}");
  } else if (cmd == "STOP") {
    stopMotors();
    Serial.println("{\"ok\":true,\"command\":\"STOP\",\"status\":\"stopped\"}");
  } else if (cmd == "HOME") {
    stopMotors();
    gripperServo.write(GRIPPER_OPEN_ANGLE);
    Serial.println("{\"ok\":true,\"command\":\"HOME\",\"status\":\"homed\"}");
  } else if (cmd == "OPEN GRIPPER") {
    gripperServo.write(GRIPPER_OPEN_ANGLE);
    Serial.println("{\"ok\":true,\"command\":\"OPEN GRIPPER\",\"status\":\"opened\"}");
  } else if (cmd == "CLOSE GRIPPER") {
    gripperServo.write(GRIPPER_CLOSE_ANGLE);
    Serial.println("{\"ok\":true,\"command\":\"CLOSE GRIPPER\",\"status\":\"closed\"}");
  } else if (cmd.startsWith("PICK")) {
    // Autonomous Pick routine sequence
    gripperServo.write(GRIPPER_OPEN_ANGLE);
    delay(300);
    setMotors(120, 120);
    delay(600);
    stopMotors();
    gripperServo.write(GRIPPER_CLOSE_ANGLE);
    delay(400);
    Serial.println("{\"ok\":true,\"command\":\"PICK\",\"status\":\"picked\",\"target\":\"" + cmd.substring(5) + "\"}");
  } else if (cmd == "AUTO") {
    Serial.println("{\"ok\":true,\"command\":\"AUTO\",\"status\":\"autonomous_mode\"}");
  } else {
    Serial.println("{\"ok\":false,\"error\":\"Unknown or unsupported command: " + cmd + "\"}");
  }
}

void loop() {
  // Watchdog timeout check
  if (!safetyLocked && !emergencyStopped && (millis() - lastCommandTime > WATCHDOG_TIMEOUT_MS)) {
    stopMotors();
  }

  if (Serial.available() > 0) {
    String input = Serial.readStringUntil('\n');
    processCommand(input);
  }
}
