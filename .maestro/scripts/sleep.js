// Waits SLEEP_SECONDS (Maestro has no plain "wait" command). Used to let fade-to-dark kick in.
var end = Date.now() + parseInt(SLEEP_SECONDS, 10) * 1000;
while (Date.now() < end) {
  // busy wait
}
