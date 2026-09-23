/**
 * The iOS home-screen widget — the same card as the Android one: a commit of
 * yours over the year of days under it. Linked into the Xcode project by
 * @bacons/apple-targets at `npx expo prebuild -p ios`.
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: 'widget',
  name: 'GitHuhWidget',
  displayName: 'git-huh?',
  bundleIdentifier: '.widget',
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'WidgetKit'],
  entitlements: {
    // The app writes the payload into this group; the widget reads it.
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
});
