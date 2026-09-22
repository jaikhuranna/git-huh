// The background inbox check has to be defined when the bundle is evaluated,
// not when the first screen renders: Android can start the JavaScript
// runtime just to run it, with no screen at all. So the task is registered
// here, before the router takes over.
import './src/lib/notify';
import 'expo-router/entry';
