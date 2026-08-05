import { defaultContentForType, type ServiceItemContent } from "@/lib/serviceItemContent";

export interface ServiceTemplateItem {
  type: string;
  title: string;
  content?: ServiceItemContent;
}

export interface ServiceTemplate {
  id: string;
  title: string;
  items: ServiceTemplateItem[];
}

export const SERVICE_TEMPLATES: ServiceTemplate[] = [
  {
    id: "sunday-am",
    title: "Sunday Morning Service",
    items: [
      { type: "countdown", title: "Pre-service countdown", content: { countdownSeconds: 600 } },
      { type: "section", title: "Gathering" },
      { type: "logo", title: "Welcome", content: { body: "Welcome" } },
      { type: "song", title: "Opening worship", content: {} },
      { type: "announcement", title: "Announcements", content: { body: "Announcements" } },
      { type: "section", title: "Worship" },
      { type: "scripture", title: "Call to worship", content: { reference: "Psalm 100" } },
      { type: "song", title: "Worship set", content: {} },
      { type: "section", title: "Word" },
      { type: "scripture", title: "Sermon text", content: { reference: "Romans 8:28" } },
      { type: "sermon_note", title: "Sermon notes", content: { body: "Main points" } },
      { type: "section", title: "Response" },
      { type: "scripture", title: "Altar call", content: { reference: "John 3:16" } },
      { type: "blank", title: "Closing", content: {} },
    ],
  },
  {
    id: "midweek",
    title: "Midweek Bible Study",
    items: [
      { type: "countdown", title: "Countdown", content: { countdownSeconds: 300 } },
      { type: "section", title: "Welcome" },
      { type: "announcement", title: "Welcome", content: { body: "Midweek Bible study" } },
      { type: "section", title: "Study" },
      { type: "scripture", title: "Opening scripture", content: { reference: "Psalm 119:105" } },
      { type: "scripture", title: "Study passage", content: { reference: "Ephesians 2:8-10" } },
      { type: "sermon_note", title: "Discussion notes", content: { body: "Questions for the group" } },
    ],
  },
  {
    id: "funeral",
    title: "Memorial Service",
    items: [
      { type: "section", title: "Opening" },
      { type: "logo", title: "Memorial", content: { body: "In loving memory" } },
      { type: "scripture", title: "Comfort", content: { reference: "John 14:1-3" } },
      { type: "section", title: "Remembrance" },
      { type: "scripture", title: "Hope", content: { reference: "1 Thessalonians 4:13-14" } },
      { type: "announcement", title: "Eulogy", content: { body: "Remembrance" } },
      { type: "blank", title: "Moment of silence", content: {} },
    ],
  },
  {
    id: "youth",
    title: "Youth Service",
    items: [
      { type: "countdown", title: "Countdown", content: { countdownSeconds: 180 } },
      { type: "section", title: "Open" },
      { type: "video", title: "Opener video", content: {} },
      { type: "song", title: "High-energy worship", content: {} },
      { type: "announcement", title: "Youth announcements", content: { body: "Events this week" } },
      { type: "section", title: "Message" },
      { type: "scripture", title: "Message scripture", content: { reference: "Jeremiah 29:11" } },
      { type: "speaker_lower_third", title: "Youth pastor", content: defaultContentForType("speaker_lower_third") },
    ],
  },
];

export function getServiceTemplate(id: string): ServiceTemplate | undefined {
  return SERVICE_TEMPLATES.find((t) => t.id === id);
}
