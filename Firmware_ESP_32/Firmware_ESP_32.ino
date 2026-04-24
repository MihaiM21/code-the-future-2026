#include <WiFi.h>
#include <WebSocketsClient.h>
#include "config.h"

WebSocketsClient wsTelemetry; // Pentru recepție (8765)
WebSocketsClient wsCommands;  // Pentru trimitere (8766)

void onTelemetryEvent(WStype_t type, uint8_t * payload, size_t length) {
  if (type == WStype_TEXT) {
    Serial.println((char*)payload); 
  }
}

void onCommandEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_CONNECTED:
      Serial.println("[V] Canal Comenzi (8766) ACTIV");
      break;
    case WStype_DISCONNECTED:
      Serial.println("[!] Canal Comenzi (8766) OFFLINE");
      break;
  }
}

void initWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
}

void setup() {
  Serial.begin(115200);
  delay(2000); 

  initWiFi();
  
  wsTelemetry.begin(host, port, "/");
  wsTelemetry.onEvent(onTelemetryEvent);
  wsTelemetry.setReconnectInterval(5000);

  wsCommands.begin(host, sendPort, "/");
  wsCommands.onEvent(onCommandEvent);
  wsCommands.setReconnectInterval(5000);
}

void loop() {
  wsTelemetry.loop();
  wsCommands.loop();

  if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim();

    if (command.length() > 0) {
      wsCommands.sendTXT(command);
    }
  }
}