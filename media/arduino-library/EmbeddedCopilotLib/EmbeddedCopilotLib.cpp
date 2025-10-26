#include "EmbeddedCopilotLib.h"

void EmbeddedCopilot::begin(unsigned long baud) { Serial.begin(baud); }

void EmbeddedCopilot::ping() { Serial.println("EmbeddedCopilot: ping"); }
