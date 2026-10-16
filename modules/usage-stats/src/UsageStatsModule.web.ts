import { registerWebModule, NativeModule } from 'expo';

// UsageStatsModule is not available on the web platform.
class UsageStatsModule extends NativeModule<{}> {}

export default registerWebModule(UsageStatsModule, 'UsageStatsModule');
