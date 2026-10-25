// The background inbox check has to be defined when the bundle is evaluated,
// not when the first screen renders: Android can start the JavaScript
// runtime just to run it, with no screen at all. So the task is registered
// here, before the router takes over.
import './src/lib/notify';
// REST validators live on the device in the app; the pure modules and tests
// get an in-memory box instead. Registered before any request is made.
import './src/lib/httpCacheStore';
import './src/lib/proposalsStore';
import 'expo-router/entry';
