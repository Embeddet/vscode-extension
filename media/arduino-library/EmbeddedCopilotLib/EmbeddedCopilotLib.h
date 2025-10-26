#ifndef EMBEDDED_COPILOT_LIB_H
#define EMBEDDED_COPILOT_LIB_H

#include <Arduino.h>

class EmbeddedCopilot {
public:
  EmbeddedCopilot() {}
  void begin(unsigned long baud = 115200) { Serial.begin(baud); }
  void ping() { Serial.println("EmbeddedCopilot: ping"); }
};

#endif
