export const TYPE_COLORS: Record<string, string> = {
  Reception: "#DBEAFE", "Living Room": "#FEF3C7", Bedroom: "#EDE9FE", Kitchen: "#FFE4E6", "Dining Area": "#FDE68A", Classroom: "#D1FAE5",
  Office: "#E0E7FF", "Conference Room": "#CFFAFE", "Meeting Room": "#CCFBF1", Toilet: "#E2E8F0", Storage: "#F1F5F9", Corridor: "#FFFFFF",
  Staircase: "#F8FAFC", "Open Area": "#ECFCCB", Balcony: "#DCFCE7", "Custom Room": "#FAE8FF", "Open Space": "#F8FAFC",
};
export const colorFor = (type: string): string => TYPE_COLORS[type] || "#F1F5F9";
export const CHART_COLORS = ["#4F46E5", "#0EA5E9", "#14B8A6", "#F59E0B", "#EC4899", "#8B5CF6", "#64748B", "#22C55E", "#EF4444", "#06B6D4", "#A855F7", "#84CC16"];
