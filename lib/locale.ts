import { headers } from "next/headers";
import { pickLocale, type Locale } from "@/lib/i18n";
import { getStrings, type Strings } from "@/lib/strings";

// The impure half of language selection: the one place this project reads
// Accept-Language. Kept out of lib/i18n.ts so pickLocale stays a pure function
// tested with plain strings and no request in scope. Works in a server
// component, a route handler and a "use server" action alike — headers() is
// available in all three.
export async function currentLocale(): Promise<Locale> {
  const store = await headers();
  return pickLocale(store.get("accept-language"));
}

// A convenience for the common case of wanting both at once: most server
// components read the locale purely to hand a slice of the dictionary to a
// client child, which cannot call headers() itself.
export async function currentStrings(): Promise<Strings> {
  return getStrings(await currentLocale());
}
