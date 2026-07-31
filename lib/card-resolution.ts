import type { CardSection } from "@/lib/sections";

export type CardContent = {
  date: Date;
  subject: string | null;
  usage: string | null;
  englishPrompt: string;
  hint: string | null;
  frenchAnswer: string;
  sections: CardSection[];
};
