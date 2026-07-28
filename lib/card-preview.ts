import type { CardInput } from "@/app/actions";
import type { CardContent } from "@/lib/card-resolution";
import { normaliseSections } from "@/lib/sections";

// The editor's fields are all `string` because they drive controlled inputs;
// the card faces want the nullable shape the database uses.
//
// The `|| null` conversions mirror toCreateData in app/actions.ts exactly,
// down to not trimming. A subject of "   " is truthy there, so it saves and
// the student card renders a pill full of spaces — a preview that trimmed
// would show no pill and be wrong about the one thing it exists to be right
// about. Sections are the exception only because the save path is: it runs
// normaliseSections too.
export function toPreviewContent(values: CardInput): CardContent {
  return {
    date: new Date(`${values.date}T00:00:00Z`),
    subject: values.subject || null,
    usage: values.usage || null,
    englishPrompt: values.englishPrompt,
    hint: values.hint || null,
    frenchAnswer: values.frenchAnswer,
    sections: normaliseSections(values.sections),
  };
}
