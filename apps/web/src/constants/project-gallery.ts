export interface IProjectCover {
  id: string;
  /** Unsplash image URL. Static + curated for now (no API key); swap for a live
   *  Unsplash search later without changing consumers. */
  url: string;
  alt: string;
}

/** Curated Unsplash covers offered when creating a project. */
export const PROJECT_COVER_GALLERY: IProjectCover[] = [
  { id: "aurora", url: "https://images.unsplash.com/photo-1483347756197-71ef80e95f73?w=1200&q=80&auto=format&fit=crop", alt: "Aurora over mountains" },
  { id: "waves", url: "https://images.unsplash.com/photo-1505142468610-359e7d316be0?w=1200&q=80&auto=format&fit=crop", alt: "Ocean waves" },
  { id: "dunes", url: "https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=1200&q=80&auto=format&fit=crop", alt: "Desert dunes" },
  { id: "forest", url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1200&q=80&auto=format&fit=crop", alt: "Sunlit forest" },
  { id: "peaks", url: "https://images.unsplash.com/photo-1454496522488-7a8e488e8606?w=1200&q=80&auto=format&fit=crop", alt: "Mountain peaks" },
  { id: "canyon", url: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1200&q=80&auto=format&fit=crop", alt: "Canyon at sunset" },
  { id: "gradient-1", url: "https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=1200&q=80&auto=format&fit=crop", alt: "Purple gradient" },
  { id: "gradient-2", url: "https://images.unsplash.com/photo-1550859492-d5da9d8e45f3?w=1200&q=80&auto=format&fit=crop", alt: "Teal gradient" },
  { id: "city", url: "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1200&q=80&auto=format&fit=crop", alt: "City skyline" },
  { id: "field", url: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80&auto=format&fit=crop", alt: "Golden field" },
  { id: "snow", url: "https://images.unsplash.com/photo-1418985991508-e47386d96a71?w=1200&q=80&auto=format&fit=crop", alt: "Snowy landscape" },
  { id: "sky", url: "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1200&q=80&auto=format&fit=crop", alt: "Blue sky and clouds" },
];

/** Default cover when the user doesn't pick one. */
export const DEFAULT_PROJECT_COVER: IProjectCover = PROJECT_COVER_GALLERY[0];

/** Curated emoji options for the project badge. */
export const PROJECT_EMOJI_PALETTE: string[] = [
  "🚀", "📱", "📊", "🎨", "🛠️", "🧭", "🔬", "💡", "📦", "🌱", "⚙️", "🗂️",
];
