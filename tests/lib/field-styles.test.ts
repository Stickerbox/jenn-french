import { describe, it, expect } from "vitest";
import {
  applyCardStyles,
  applyFieldStyle,
  applySectionStyles,
  FIELD_STYLES,
} from "@/lib/field-styles";
import { splitIdiom } from "@/lib/idiom";
import { IDIOM_TITLE } from "@/lib/sections";
import type { CardInput } from "@/app/actions";

describe("applyFieldStyle", () => {
  it("seeds the field's old CSS styling into text that has none", () => {
    expect(applyFieldStyle("Think it through", FIELD_STYLES.hint)).toBe(
      "<green>_Think it through_</green>",
    );
  });

  it("keeps emphasis Claude wrote while adding the default around it", () => {
    expect(
      applyFieldStyle("Think **every day** — a habit.", FIELD_STYLES.hint),
    ).toBe("<green>_Think _**_every day_**_ — a habit._</green>");
  });

  it("leaves text alone once it carries a colour", () => {
    const chosen = "<black>Think it through</black>";
    expect(applyFieldStyle(chosen, FIELD_STYLES.hint)).toBe(chosen);
  });

  // Verbatim from a production pronunciation section. The backticks survive
  // the seeding untouched; the chip draws its own moss in cardCodeChip, so the
  // colour written here never reaches it.
  it("keeps a phonetic chip's backticks when seeding the prose around it", () => {
    expect(
      applyFieldStyle(
        "**Pis** `pee` is Quebec's casual for \"and\"",
        FIELD_STYLES.sectionBody,
      ),
    ).toBe("<black>**Pis** `pee` is Quebec's casual for \"and\"</black>");
  });

  it("leaves an empty field empty, so the placeholder still shows", () => {
    expect(applyFieldStyle("", FIELD_STYLES.hint)).toBe("");
  });

  it("applies a colour with no emphasis for the plainer fields", () => {
    expect(
      applyFieldStyle("Je faisais un lunch", FIELD_STYLES.frenchAnswer),
    ).toBe("<blue>Je faisais un lunch</blue>");
  });
});

describe("applySectionStyles", () => {
  it("styles an ordinary section's title and body separately", () => {
    expect(
      applySectionStyles({ title: "Grammar", body: "faire → **faisait**." }),
    ).toEqual({
      title: "<red>**Grammar**</red>",
      body: "<black>faire → **faisait**.</black>",
    });
  });

  it("gives the idiom a red expression and a plain meaning", () => {
    expect(
      applySectionStyles({
        title: IDIOM_TITLE,
        body: "**se pogner le beigne** — to laze about",
      }).body,
    ).toBe("<red>_se pogner le beigne_</red><black>\nto laze about</black>");
  });

  it("splits back into the same two halves it was built from", () => {
    const body = applySectionStyles({
      title: IDIOM_TITLE,
      body: "**se pogner le beigne** — to laze about",
    }).body;
    expect(splitIdiom(body)).toEqual({
      expression: "<red>_se pogner le beigne_</red>",
      meaning: "<black>to laze about</black>",
    });
  });

  it("still recognises the idiom once its title is styled", () => {
    const once = applySectionStyles({ title: IDIOM_TITLE, body: "**a** — b" });
    expect(applySectionStyles({ title: once.title, body: "**c** — d" }).body).toBe(
      "<red>_c_</red><black>\nd</black>",
    );
  });

  it("leaves a body the teacher has already coloured alone", () => {
    const body = "<blue>hers</blue>";
    expect(applySectionStyles({ title: IDIOM_TITLE, body }).body).toBe(body);
  });

  it("leaves an empty body empty", () => {
    expect(applySectionStyles({ title: "Québec Pronunciation", body: "" })).toEqual(
      { title: "<red>**Québec Pronunciation**</red>", body: "" },
    );
  });
});

describe("applyCardStyles", () => {
  const card: CardInput = {
    date: "2026-07-27",
    subject: "Imparfait",
    usage: "Habits of the past",
    englishPrompt: "I used to pack a lunch",
    hint: "",
    frenchAnswer: "Je faisais un lunch",
    sections: [{ title: "Grammar", body: "faire → faisait", id: "s-0" }],
  };

  it("seeds every field with what its stylesheet used to say", () => {
    const styled = applyCardStyles(card);
    expect(styled.subject).toBe("<blue>Imparfait</blue>");
    expect(styled.usage).toBe("<gold>_Habits of the past_</gold>");
    expect(styled.englishPrompt).toBe("<black>I used to pack a lunch</black>");
    expect(styled.frenchAnswer).toBe("<blue>Je faisais un lunch</blue>");
  });

  it("keeps the section id React needs for its key", () => {
    expect(applyCardStyles(card).sections[0].id).toBe("s-0");
  });

  it("is idempotent, so re-opening a saved card changes nothing", () => {
    const once = applyCardStyles(card);
    expect(applyCardStyles(once)).toEqual(once);
  });

  it("does not mutate the values it was given", () => {
    applyCardStyles(card);
    expect(card.subject).toBe("Imparfait");
    expect(card.sections[0].title).toBe("Grammar");
  });
});
