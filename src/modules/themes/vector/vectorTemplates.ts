import type { VectorDesign } from "@/lib/vectorDesign";
import { createVectorElement } from "@/lib/vectorDesign";

export interface VectorTemplate {
  id: string;
  name: string;
  description: string;
  build: (accentColor?: string) => Partial<VectorDesign>;
}

export const VECTOR_TEMPLATES: VectorTemplate[] = [
  {
    id: "lower-third-frame",
    name: "Lower Third Frame",
    description: "Accent bar with translucent panel for scripture overlays",
    build: (accent = "#2563eb") => ({
      enabled: true,
      elements: [
        createVectorElement("rect", {
          name: "Bottom panel",
          x: 0,
          y: 880,
          width: 1920,
          height: 200,
          fill: "rgba(15,23,42,0.88)",
          stroke: "none",
          zIndex: 1,
          layer: "background",
        }),
        createVectorElement("rect", {
          name: "Accent stripe",
          x: 0,
          y: 880,
          width: 1920,
          height: 6,
          fill: accent,
          stroke: "none",
          rx: 0,
          zIndex: 2,
          layer: "background",
        }),
        createVectorElement("line", {
          name: "Left accent",
          x: 48,
          y: 920,
          x2: 48,
          y2: 1040,
          stroke: accent,
          strokeWidth: 4,
          zIndex: 3,
          layer: "background",
        }),
      ],
    }),
  },
  {
    id: "corner-bars",
    name: "Corner Bars",
    description: "Minimal L-shaped corner accents for broadcast look",
    build: (accent = "#2563eb") => ({
      enabled: true,
      elements: [
        createVectorElement("path", {
          name: "Top-left",
          x: 40,
          y: 40,
          d: "M 40 120 L 40 40 L 120 40",
          fill: "none",
          stroke: accent,
          strokeWidth: 4,
          zIndex: 1,
          layer: "background",
        }),
        createVectorElement("path", {
          name: "Bottom-right",
          x: 1800,
          y: 1040,
          d: "M 1800 960 L 1800 1040 L 1880 1040",
          fill: "none",
          stroke: accent,
          strokeWidth: 4,
          zIndex: 2,
          layer: "background",
        }),
      ],
    }),
  },
  {
    id: "center-frame",
    name: "Center Frame",
    description: "Rounded border framing the main content area",
    build: (accent = "#3b82f6") => ({
      enabled: true,
      elements: [
        createVectorElement("rect", {
          name: "Content frame",
          x: 120,
          y: 80,
          width: 1680,
          height: 920,
          fill: "none",
          stroke: accent,
          strokeWidth: 2,
          rx: 16,
          opacity: 0.7,
          zIndex: 1,
          layer: "background",
        }),
        createVectorElement("rect", {
          name: "Inner glow",
          x: 124,
          y: 84,
          width: 1672,
          height: 912,
          fill: "rgba(255,255,255,0.02)",
          stroke: "none",
          rx: 14,
          zIndex: 0,
          layer: "background",
        }),
      ],
    }),
  },
  {
    id: "worship-watermark",
    name: "Worship Watermark",
    description: "Soft cross watermark behind text",
    build: () => ({
      enabled: true,
      elements: [
        createVectorElement("path", {
          name: "Cross",
          x: 960,
          y: 540,
          d: "M 960 320 L 960 760 M 740 540 L 1180 540",
          fill: "none",
          stroke: "rgba(255,255,255,0.06)",
          strokeWidth: 48,
          zIndex: 1,
          layer: "background",
        }),
        createVectorElement("ellipse", {
          name: "Halo",
          x: 760,
          y: 340,
          width: 400,
          height: 400,
          fill: "rgba(255,255,255,0.03)",
          stroke: "none",
          zIndex: 0,
          layer: "background",
        }),
      ],
    }),
  },
  {
    id: "title-banner",
    name: "Title Banner",
    description: "Top banner strip for announcements and song titles",
    build: (accent = "#2563eb") => ({
      enabled: true,
      elements: [
        createVectorElement("rect", {
          name: "Banner",
          x: 0,
          y: 0,
          width: 1920,
          height: 100,
          fill: "rgba(15,23,42,0.85)",
          stroke: "none",
          zIndex: 1,
          layer: "foreground",
        }),
        createVectorElement("rect", {
          name: "Banner accent",
          x: 0,
          y: 96,
          width: 1920,
          height: 4,
          fill: accent,
          stroke: "none",
          rx: 0,
          zIndex: 2,
          layer: "foreground",
        }),
        createVectorElement("text", {
          name: "Banner label",
          x: 960,
          y: 62,
          text: "TITLE HERE",
          fontSize: 36,
          fontFamily: "'Segoe UI', sans-serif",
          fontWeight: 600,
          textAnchor: "middle",
          fill: "#f8fafc",
          zIndex: 3,
          layer: "foreground",
        }),
      ],
    }),
  },
];

export function applyVectorTemplate(
  templateId: string,
  accentColor?: string,
): Partial<VectorDesign> {
  const template = VECTOR_TEMPLATES.find((t) => t.id === templateId);
  if (!template) return { enabled: true, elements: [] };
  return template.build(accentColor);
}
