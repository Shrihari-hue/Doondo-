// Expo entry point. Don't add logic here — keep app lifecycle in App.tsx.
import { Platform } from 'react-native';
import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);

// Android home-screen widget (Doondo Pulse). The headless task must be
// registered at the entry point so Android can render the widget even
// when the app isn't running. Guarded: Expo Go has no native module.
if (Platform.OS === 'android') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { registerWidgetTaskHandler } = require('react-native-android-widget');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { widgetTaskHandler } = require('./src/widgets/widgetTaskHandler');
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch {
    // Native module not linked in this build — widget simply unavailable.
  }
}
