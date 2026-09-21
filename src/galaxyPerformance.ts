export const galaxyPerformanceModes = ["high", "saver"] as const;
export type GalaxyPerformance = typeof galaxyPerformanceModes[number];
export const DEFAULT_GALAXY_PERFORMANCE: GalaxyPerformance = "high";
export const galaxyPerformanceLabels: Record<GalaxyPerformance, string> = {
  high: "High performance",
  saver: "Saver",
};
