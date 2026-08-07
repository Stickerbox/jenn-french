// The bounds on a card and a checklist row, in characters.
//
// Imported by BOTH the server actions that enforce them and the forms that cap
// their inputs, which is why this file imports nothing — anything reaching for
// prisma here would drag it into the browser bundle.
//
// The form's maxLength is the courtesy and the action's check is the
// authority: a client is not an authority on length, and the input attribute
// is trivially removed.
export const MAX_CARD_FACE = 200;
export const MAX_CARD_NOTE = 500;
export const MAX_ITEM_TEXT = 300;
