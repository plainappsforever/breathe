// Entry point. The reminder-answer task must be defined before anything else loads, because on Android
// Snooze and Skip taps with the app closed start a headless JS run that only executes this entry
// (expo-router loads the route files, and with them the rest of the app, lazily in that run).
import './src/lib/reminder-task';
import 'expo-router/entry';
