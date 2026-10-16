// Re-export the native module. On web, it will be resolved to UsageStatsModule.web.ts
// and on native platforms to UsageStatsModule.ts
export { default } from './src/UsageStatsModule';
export * from './src/UsageStats.types';
