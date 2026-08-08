import type { Locale } from "@/lib/i18n";
import type { CardColor } from "@/lib/inline-markup";

// ONE type, TWO objects declared against it — that is the whole mechanism.
// Because `en` below is annotated `Strings` (the shape of the French object,
// not inferred from it), leaving out or mistyping a key on either side is a
// compile error naming the exact key, not a silent `undefined` a student would
// eventually see rendered.
//
// Grouped by area rather than a flat key soup: `student` is everything Task H1
// converts, `chat` is the two label objects Jenn's inbox and a student's FAB
// both need, and `common` is the handful of words identical in shape on both
// sides of every area (a "Close" button means the same thing everywhere it
// appears). Wave 3 (Task H2) adds an `admin` area beside these — this file is
// shared, not owned exclusively by either task.
//
// Interpolating values are FUNCTIONS, never templates substituted by hand:
// French and English disagree about word order ("Marie's page" vs.
// "La page de Marie"), and a placeholder scheme invites building sentences by
// concatenation, which does not survive translation.
//
// THAT IS EXACTLY WHY A RESOLVED `Strings` OBJECT MUST NEVER CROSS INTO A
// CLIENT COMPONENT. React can only serialise a Server Component's props into
// the RSC payload when every value in them is plain data — and roughly 105
// of the values in here are functions, so a `<ClientThing strings={strings} />`
// written from a server component throws "Functions cannot be passed directly
// to Client Components" at request time, not at build time: lint, tsc, the
// test suite and `next build` all pass, because none of them render a request
// through the RSC boundary. A client component takes `locale: Locale` — a
// plain string — and calls `getStrings(locale)` itself; every
// `strings.area.field(...)` call site inside its body is unchanged, because
// the object is now built on the client rather than handed across the wire.
// Once a client component holds `strings`, passing it on to a component it
// renders directly (not across another server/client seam) is fine — that is
// ordinary in-browser composition, not a serialisation boundary. See
// lib/locale.ts for the one server-only module that reads the request and
// `currentLocale()`/`currentStrings()`.
export type Strings = {
  common: {
    today: string;
    close: string;
    save: string;
    saving: string;
    cancel: string;
    // Added for Wave 3 (Task H2): bare verbs that repeat verbatim across the
    // admin's page list, group list and section editor, where only an
    // aria-label needs a name interpolated in beside them.
    clear: string;
    edit: string;
    delete: string;
    deleting: string;
    download: string;
    pin: string;
    unpin: string;
    adding: string;

    // CardFront, CardBack and Flashcard render identically inside the admin's
    // StudentPreview — a live copy of the student's card — as they do on
    // /g/[slug] itself (see CLAUDE.md's Rendering section). Neither `student`
    // nor `admin` owns them, so they sit here instead.
    card: {
      flip: string;
      sayItInFrench: string;
      tapToReveal: string;
      answer: string;
      // The chip on a card being shown again because Jenn posted nothing
      // today. It is what keeps this from being the silent fallback that was
      // removed on 2026-07-31 — see lib/card-revision.ts.
      revision: string;
    };
  };

  student: {
    brand: {
      wordmark: string;
      tagline: string;
    };

    // The header line naming whoever the page belongs to — greeting() for the
    // student themself, teacherPageLabel() for Jenn looking at their page. Two
    // functions rather than one, because they draw on a different amount of
    // the name: a greeting wants the first word ("Bonjour Marie" is a hello,
    // not a summons), teacherPageLabel wants the whole name, since Jenn's
    // problem is telling two students apart and two students can share a
    // first name.
    greeting: (first: string) => string;
    teacherPageLabel: (full: string) => string;

    page: {
      backToAdmin: string;
      unclaimedNotice: (name: string) => string;
      staleNotice: (name: string) => string;
      nothingPosted: string;
    };

    tabs: {
      sectionsLabel: string;
      card: string;
      files: string;
      board: string;
      // NOT "Les cartes". The daily-card tab above is "La carte", and two
      // adjacent tabs one letter apart, meaning different things, is a trap.
      // "Vocabulaire" also says what the deck is for.
      deck: string;
      todo: string;
      // Read out beside the dot, which is aria-hidden. ConversationList's
      // unread dot is the precedent and FilterDisclosure is the second use.
      unseenLabel: string;
    };

    card: {
      eyebrow: string;
    };

    // /f/[token] — the read-only mirror of the Files tab shared with a parent.
    filesPage: {
      eyebrow: string;
      backToCard: string;
    };

    dateNav: {
      dialogLabel: string;
      previousMonth: string;
      nextMonth: string;
    };

    files: {
      searchLabel: string;
      // The disclosure that holds the two chip rows below. It had a `filterBy`
      // caption ("Filtrer par :") until 2026-08-07, drawn beside the icon only
      // while the panel was open — it named controls that were already there
      // and labelled themselves, and being conditional it shifted the icon
      // sideways on every press.
      filterToggle: string;
      filterActive: string;
      kindFilter: {
        group: string;
        all: string;
        html: string;
        link: string;
        pdf: string;
      };
      sortFilter: {
        group: string;
        created: string;
        modified: string;
      };
      emptyShelf: string;
      noMatches: string;
      edit: (title: string) => string;
      editTitle: string;
      pin: (title: string) => string;
      pinTitle: string;
      unpin: (title: string) => string;
      unpinTitle: string;
      delete: (title: string) => string;
      deleteTitle: string;
    };

    // The whiteboard ARCHIVE and the viewer over it. The drawing surface
    // (BoardEditor and its toolbar) is deliberately absent and stays French —
    // it is teacher-only, reachable only by pressing "New board", and editing
    // it means editing the leave-guard.
    board: {
      newBoard: string;
      empty: string;
      drawingPage: (page: number) => string;
      liveNow: string;
      openLive: string;
      download: string;
      downloadFailed: string;
      delete: string;
      pageCount: (count: number) => string;
      viewer: {
        open: (label: string) => string;
        close: string;
        position: (page: number, total: number) => string;
        previous: string;
        next: string;
        zoomIn: string;
        zoomOut: string;
        resetZoom: string;
        loadFailed: string;
      };
    };

    deck: {
      empty: string;
      sort: {
        group: string;
        added: string;
        random: string;
        revision: string;
      };
      // The stretched button covering a tile. It names the card, because a
      // grid of twenty of these would otherwise read as twenty identical
      // "Flip the card" tab stops with nothing to tell them apart.
      flipCard: (front: string) => string;
      open: (front: string) => string;
      flip: string;
      flipHint: string;
      previous: string;
      next: string;
      position: (index: number, total: number) => string;
      close: string;
      delete: string;
      deleteConfirm: string;
      deleteCancel: string;
      addTitle: string;
      // Two consumers each: the add form's field labels, and the pill in a
      // deck tile's top right. The same words for the same idea — a second
      // pair would be two strings both meaning "this is the front of a card"
      // with nothing keeping them in step.
      frontLabel: string;
      backLabel: string;
      noteLabel: string;
      noteHint: string;
      save: string;
      addError: string;
    };

    todo: {
      empty: string;
      addPlaceholder: string;
      add: string;
      toggle: (text: string) => string;
      delete: (text: string) => string;
      byTeacher: string;
      error: string;
    };

    shelf: {
      add: string;
      addLink: string;
      addPage: string;
      addPdf: string;
      linkUrlAriaLabel: string;
      linkError: string;
      pageError: string;
      pdfTooLarge: string;
      pdfError: string;
      pastePrompt: string;
      pasteAccepted: (size: string) => string;
      pasteAriaLabel: string;
      pasteNotHtml: string;
      choosePdf: string;
      pdfHint: string;
      titleAriaLabel: string;
    };

    auth: {
      // The client-side pre-check StudentAuthPanel runs before it ever calls
      // the server action, mirrored by the same checks the action re-runs —
      // see lib/student-credentials.ts. Kept in the dictionary rather than
      // hardcoded so the convenience check speaks whichever language the
      // student's own submission would have come back in.
      badEmail: string;
      tooShort: (min: number) => string;
      tooLong: string;
      // The deliberately UNIFORM failure sentences — see the Auth section of
      // CLAUDE.md. Translated, not narrowed: each still names both halves of
      // a sign-in, or points at the one real recovery, exactly as the French
      // original did.
      signInFailed: string;
      tooManyTries: string;
      inviteUsed: string;
      emailTaken: string;
      genericFailure: string;
      emailLabel: string;
      passwordLabel: string;
      // Full sentences rather than a bare "Show"/"Hide" concatenated with
      // "password" at the call site: French needs "le mot de passe" in
      // between, which a placeholder scheme would drop — the exact failure
      // mode interpolating FUNCTIONS exist to avoid.
      showPassword: string;
      hidePassword: string;
      // No auth-local "cancel" — common.cancel already covers it, and the
      // login form's Cancel button is the same word every other Cancel on
      // this page uses.
      signUpIntro: string;
      signInIntro: string;
      createAccount: string;
      creating: string;
      signIn: string;
      signingIn: string;
      signOut: string;
      haveAccount: string;
    };

    signInPage: {
      subtitle: string;
      forgotPassword: string;
      backToHome: string;
    };
  };

  chat: {
    title: string;
    empty: string;
    placeholder: string;
    send: string;
    back: string;
    deleteMessage: string;
    // Aria-label for the per-bubble quote-reply affordance, and for the
    // composer's control that clears a reply once one is staged.
    reply: string;
    cancelReply: string;
  };

  // Wave 3 (Task H2). Same rules as `student`: grouped by the component or
  // action that owns each string, functions for anything that interpolates.
  admin: {
    header: {
      // Wordmark is NOT duplicated here — it is the same brand name in both
      // languages (see student.brand.wordmark) and Task I's header reuses
      // that value rather than repeating an untranslated string in a second
      // place two edits could disagree about.
      title: string;
      greeting: string;
      logOut: string;
    };

    nav: {
      sectionsLabel: string;
      daily: string;
      students: string;
      pages: string;
    };

    fab: {
      add: string;
    };

    addMenu: {
      addStudent: string;
      addLink: string;
      addPage: string;
    };

    sheets: {
      addStudentTitle: string;
      addLinkTitle: string;
      addPageTitle: string;
      editPageTitle: string;
      loading: string;
    };

    datePicker: {
      label: string;
      dialog: string;
      previousMonth: string;
      nextMonth: string;
    };

    cardEditor: {
      englishPhraseLabel: string;
      frenchPhraseLabel: string;
      subjectLabel: string;
      // The compact subject pill on the card header itself — bare, no
      // asterisk, distinct from the compose form's own required-field label.
      subjectPillLabel: string;
      generate: string;
      generating: string;
      requiredFields: string;
      front: string;
      back: string;
      usagePlaceholder: string;
      usageAriaLabel: string;
      sayItInFrenchRequired: string;
      englishSentence: string;
      hintPlaceholder: string;
      hintAriaLabel: string;
      theAnswerRequired: string;
      frenchAnswer: string;
      saveCard: string;
      deleteConfirm: string;
      deleteCard: string;
      cardSaved: string;
      deleteError: string;
    };

    // CardAiError's own messages — CLAUDE.md is explicit that these are shown
    // to Jenn verbatim, so they are translated and kept exact rather than
    // narrowed. generateCardSuggestion takes a Locale and looks them up here
    // rather than calling headers() itself, keeping lib/card-ai.ts a function
    // of its arguments.
    cardAi: {
      unavailable: string;
      badKey: string;
      rateLimited: string;
      unreachable: string;
      refused: string;
    };

    groups: {
      noStudentsYet: string;
      searchLabel: string;
      unreadCount: (count: number) => string;
      // The bullet sentences. FUNCTIONS and not placeholder templates: French
      // and English disagree about agreement as well as word order, and a
      // template scheme invites building sentences by concatenation.
      summaryToCorrect: (count: number) => string;
      summaryStarted: (count: number) => string;
      summaryNotOpened: (count: number) => string;
      summaryNewFlashcards: (count: number) => string;
      summaryNewFiles: (count: number) => string;
      summaryItemsDone: (count: number) => string;
      // Drawn when a student has no bullets at all. A card with an empty gap
      // under the name reads as a row that failed to load.
      summaryNothingNew: string;
      copyInviteAria: (name: string) => string;
      inviteCopiedAria: (name: string) => string;
      copyInviteTitle: string;
      copiedTitle: string;
      resetAria: (name: string) => string;
      newInviteAria: (name: string) => string;
      resetTitle: string;
      newInviteTitle: string;
      deleteAria: (name: string) => string;
      everyoneLabel: string;
      deleteConfirm: (name: string) => string;
      invitationNotUsed: string;
      signedUp: (date: string) => string;
      copyThisLink: string;
      makeNewInviteConfirm: (name: string) => string;
      resetSignInConfirm: (name: string) => string;
      resetting: string;
      reset: string;
      couldNotDelete: string;
      couldNotReset: string;
    };

    newGroupForm: {
      nameLabel: string;
      helper: string;
      addButton: string;
    };

    // Shared by AddLinkForm, NewPageForm and PageEditor, whose audience
    // checkboxes are the identical fieldset three times over.
    pageForm: {
      studentsLegend: string;
      noStudentsYet: string;
      // The everyone group's pill in an audience form. From the dictionary and
      // NOT from Group.name, for two reasons: renaming that row in the
      // database must not change what this form says, and the word has to be
      // translated like every other word on the screen. See lib/audience.ts.
      allStudents: string;
      // Under the submit button while no student is ticked. All three audience
      // forms refuse to save without one, and a disabled button with no reason
      // beside it reads as a broken form.
      pickAtLeastOne: string;
    };

    // "Title" and "Preparing preview…" and "That PDF is larger than 3 MB." are
    // each identical, word for word, in more than one form below — hoisted
    // here rather than repeated under pageEditor and newPageForm both.
    titleLabel: string;
    preparingPreview: string;
    pdfTooLarge: string;
    // Also identical between the group list and the page list.
    noMatches: string;

    addLinkForm: {
      urlAriaLabel: string;
      addButton: string;
      error: string;
    };

    newPageForm: {
      pageLabel: string;
      pastePrompt: string;
      publishing: string;
      pasteAccepted: (size: string) => string;
      pasteAriaLabel: string;
      titleFromDocumentNote: string;
      pdfLabel: string;
      pdfInputLabel: string;
      pdfEmptyHint: string;
      pdfExistingHint: string;
      titleFromFilenameNote: string;
      publishPdf: string;
      remove: string;
    };

    pageEditor: {
      worksheetLabel: string;
      worksheetHelp: string;
      replacePdfLabel: string;
      pdfReplaceInputLabel: string;
      pdfExistingHint: string;
      saved: string;
      deleteLabel: string;
      deleteError: string;
      // The standalone route (/admin/pages/[slug]) says "Save page"; the
      // overlay opened from a tile's pencil says "Save" — the list is already
      // titled "Pages" behind it, so the noun would be redundant there.
      submitLabelStandalone: string;
      submitLabelOverlay: string;
    };

    pageList: {
      noPagesYet: string;
      searchLabel: string;
      kindFilter: {
        group: string;
        all: string;
        html: string;
        link: string;
        pdf: string;
      };
      sortFilter: {
        group: string;
        created: string;
        modified: string;
      };
      // The disclosure over the kind and sort rows. The student chip row
      // below it is deliberately NOT inside it — see PageList.
      filterToggle: string;
      filterActive: string;
      filterByStudentAria: string;
      addedByStudent: string;
      editAria: (title: string) => string;
      downloadAria: (title: string) => string;
      pinAria: (title: string) => string;
      unpinAria: (title: string) => string;
      pinDisabled: string;
      deleteAria: (title: string) => string;
    };

    sectionEditor: {
      deleteConfirm: string;
      moveUpAria: (label: string) => string;
      moveDownAria: (label: string) => string;
      deleteAria: (label: string) => string;
      untitled: string;
      addNew: string;
      titlePlaceholder: string;
      newTitleAria: string;
      titleAria: (label: string) => string;
      textPlaceholder: string;
      newTextAria: string;
      textAria: (label: string) => string;
    };

    skippedAssets: {
      // Handles the English/French singular-plural split itself rather than
      // through a placeholder — "1 file" vs. "3 files", "1 fichier" vs.
      // "3 fichiers" — which is exactly the word-order-and-agreement problem
      // interpolating functions exist for.
      notIncluded: (count: number) => string;
    };

    studentPreview: {
      heading: string;
    };

    // The teacher's inbox (InboxFab, fed by TeacherInbox.tsx). `title`,
    // `close`, `back` and `deleteMessage` are deliberately NOT repeated here —
    // InboxLabels composes from the shared `chat` group above for those, the
    // same word the student's single-conversation FAB uses.
    chat: {
      title: string;
      pickOne: string;
      search: string;
      noStudents: string;
      noMatch: string;
      noMessages: string;
      you: string;
      yesterday: string;
      unread: string;
      notSignedUp: string;
      // Called with the literal token "{name}" so ITS OWN output still reads
      // "{name} …" — components/chat/UnclaimedNotice.tsx substitutes the real
      // name afterwards with .replace("{name}", name), because that component
      // is outside this task's ownership (see CLAUDE.md's chat components
      // note) and one shared LABELS object is built once for every student in
      // the list, before any one of them is selected. Interpolating the
      // literal token through the function is what keeps this a function, per
      // the project's own rule, while still producing the template that
      // call site needs.
      notSignedUpLong: (name: string) => string;
      copyInvite: string;
      copied: string;
    };

    standalonePage: {
      backToPages: string;
      linkNote: string;
      saveLabel: string;
    };

    // Sentences app/actions.ts, app/page-actions.ts and app/ai-actions.ts
    // throw or return directly — not the ones that originate deeper, in
    // lib/page-html.ts, lib/page-pdf.ts or lib/link-url.ts, which are outside
    // this task's file ownership.
    actions: {
      unauthorized: string;
      titleRequired: string;
      studentNameRequired: string;
      nameTaken: string;
      everyoneCannotBeDeleted: string;
      everyoneCannotBePinned: string;
      groupDeletedMidEdit: string;
      pdfRequired: string;
      fillFieldsFirst: string;
    };

    formatPopover: {
      textFormatting: string;
      bold: string;
      italic: string;
      phonetic: string;
      colorLabel: (color: CardColor) => string;
    };

    genericError: string;
  };

  // components/pdf/PdfShell.tsx and components/pdf/PdfDocumentView.tsx —
  // the in-site PDF viewer that replaced /p/[slug]'s redirect to the
  // browser's own viewer (see CLAUDE.md's "A PDF is never framed"). Neither
  // component is audience-specific the way `admin`/`student` are: /p/[slug]
  // is reached by anyone holding the link, and the worksheet route's own
  // back control and version tabs keep the older strings WorksheetShell
  // already hardcodes by audience rather than gaining a second, locale-keyed
  // copy of the same words. This section covers only what is genuinely new:
  // the loading state, the failure sentence, the escape hatch to the
  // browser's own viewer, and a per-page label for the rasterised canvases.
  pdfViewer: {
    loading: string;
    renderFailed: string;
    // The bar's own control: the file itself. Distinct from openInBrowser
    // below, which is the FAILURE state's escape hatch — when nothing
    // rendered, a reader needs somewhere they can still read it, and a
    // download is a file they then have to find and open.
    download: string;
    openInBrowser: string;
    back: string;
    pageAria: (page: number) => string;
  };

  // The worksheet shell, its version tabs, and the two controls beside them.
  //
  // THIS AREA RETIRES THE AUDIENCE-KEYED COPY that lived inline in
  // `components/worksheet/*` and in `versionLabel` — "French for the student,
  // English for Jenn". That predated the Accept-Language convention and was
  // the last place in the app still choosing a language by who was reading.
  //
  // `audience` survives, and means something narrower now: PERSPECTIVE, not
  // language. Whose answers a tab holds is a different question from which
  // language to say it in, and both are needed. Jenn on an fr-CA browser gets
  // "Les réponses de Marie"; a student on an English browser gets "Jenn's
  // correction". Neither of those is reachable if one key decides both.
  worksheet: {
    versionsLabel: string;
    backToFiles: string;
    readOnly: string;
    // Shown beside the delete control when the reader's own saved copy has
    // come back inert — a click-driven worksheet whose scripts the snapshot
    // stripped. It points at the only way out, so it must name that control.
    stuckHint: string;
    saveFailed: string;

    tabs: {
      blank: string;
      // The same row, from the two sides: `myAnswers` is the student looking
      // at their own, `studentAnswers` is Jenn looking at theirs. Likewise
      // `myCorrection` and `teacherCorrection`.
      myAnswers: string;
      studentAnswers: (name: string) => string;
      myCorrection: string;
      teacherCorrection: string;
    };

    send: {
      toTeacher: string;
      toStudent: (name: string) => string;
      sending: string;
      sent: string;
      // The two disabled reasons. They carry the whole explanation, because a
      // greyed control says nothing by itself and a phone has no hover.
      nothingYet: string;
      alreadySent: string;
      // The two failures, which are different events: the write never landed,
      // or the write landed and the notice did not.
      notSaved: string;
      failed: string;
    };

    reset: {
      student: string;
      teacher: string;
      confirmStudent: string;
      confirmTeacher: string;
    };
  };
};

const fr: Strings = {
  common: {
    today: "Aujourd'hui",
    close: "Fermer",
    save: "Enregistrer",
    saving: "Enregistrement…",
    cancel: "Annuler",
    clear: "Effacer",
    edit: "Modifier",
    delete: "Supprimer",
    deleting: "Suppression…",
    download: "Télécharger",
    pin: "Épingler",
    unpin: "Désépingler",
    adding: "Ajout…",

    card: {
      flip: "Retourner la carte",
      sayItInFrench: "Dites-le en français",
      tapToReveal: "touchez pour révéler la réponse",
      answer: "La réponse",
      revision: "Révision",
    },
  },

  student: {
    brand: {
      wordmark: "Français Avec Jenn",
      tagline: "Un jour, une carte — saveur québécoise",
    },

    greeting: (first) => `Bonjour ${first}`,

    // French has no possessive 's: "de" carries it regardless of how the name
    // ends, so this branch needs none of the English side's Chicago-style
    // apostrophe rule.
    teacherPageLabel: (full) => `La page de ${full}`,

    page: {
      backToAdmin: "← Retour à l'admin",
      unclaimedNotice: (name) =>
        `${name} ne s'est pas encore inscrit. Partagez ce lien une fois — il lui permettra de créer son compte :`,
      staleNotice: (name) =>
        `Votre lien pour ${name} n'est plus à jour — ${name} s'est inscrit depuis, ce qui l'a changé. Ouvrez cet élève depuis l'onglet Élèves de l'admin pour déverrouiller le clavardage et les tableaux.`,
      nothingPosted: "Rien n'a été publié — revenez bientôt !",
    },

    tabs: {
      sectionsLabel: "Sections",
      card: "La carte",
      files: "Les fichiers",
      board: "Le tableau",
      deck: "Vocabulaire",
      todo: "À faire",
      unseenLabel: "Nouveau",
    },

    card: {
      eyebrow: "⚜ La carte du jour ⚜",
    },

    filesPage: {
      eyebrow: "⚜ Les ressources ⚜",
      backToCard: "← La carte du jour",
    },

    dateNav: {
      dialogLabel: "Choisir une date",
      previousMonth: "Mois précédent",
      nextMonth: "Mois suivant",
    },

    files: {
      searchLabel: "Chercher",
      // A neutral noun, not an instruction to reveal: aria-expanded already
      // carries open/closed, and "Afficher les filtres, développé" read like
      // a contradiction to a screen reader.
      filterToggle: "Filtres",
      filterActive: "Filtres actifs",
      kindFilter: {
        group: "Filtrer par type",
        all: "Tout",
        html: "Les pages",
        link: "Les liens",
        pdf: "Les PDF",
      },
      sortFilter: {
        group: "Trier par",
        created: "Ajout",
        modified: "Modification",
      },
      emptyShelf: "Rien ici pour l'instant.",
      noMatches: "Rien ne correspond.",
      edit: (title) => `Modifier ${title}`,
      editTitle: "Modifier",
      pin: (title) => `Épingler ${title}`,
      pinTitle: "Épingler",
      unpin: (title) => `Désépingler ${title}`,
      unpinTitle: "Désépingler",
      delete: (title) => `Supprimer ${title}`,
      deleteTitle: "Supprimer",
    },

    board: {
      newBoard: "Nouveau tableau",
      // French typography puts a space before ! and ?, and it must be
      // non-breaking or the punctuation can wrap onto its own line.
      // BoardTab.tsx and LeaveBoardDialog.tsx already carry this convention
      // (as the &nbsp; JSX entity); \u00A0 is the same character, written as
      // an escape so the next reader can see it is deliberate and can grep
      // for it rather than an invisible character nobody can find again.
      empty: "Aucun tableau pour l'instant\u00A0!",
      drawingPage: (page) => `Page ${page} — Jenn dessine…`,
      liveNow: "Jenn dessine en ce moment",
      openLive: "Ouvrir le tableau",
      download: "Télécharger",
      downloadFailed: "Échec",
      delete: "Supprimer",
      pageCount: (count) => (count === 1 ? "1 page" : `${count} pages`),
      viewer: {
        open: (label) => `Ouvrir le tableau du ${label}`,
        close: "Fermer",
        position: (page, total) => `Page ${page} sur ${total}`,
        previous: "Page précédente",
        next: "Page suivante",
        zoomIn: "Agrandir",
        zoomOut: "Réduire",
        resetZoom: "Taille normale",
        loadFailed: "Impossible d'ouvrir ce tableau.",
      },
    },

    deck: {
      empty: "Aucune carte pour l'instant\u00A0!",
      sort: {
        group: "Trier par",
        added: "Ajout",
        random: "Aléatoire",
        revision: "À réviser",
      },
      flipCard: (front) => `Retourner la carte «\u00A0${front}\u00A0»`,
      open: (front) => `Ouvrir la carte «\u00A0${front}\u00A0»`,
      flip: "Retourner",
      flipHint: "Retourner la carte",
      previous: "Carte précédente",
      next: "Carte suivante",
      position: (index, total) => `Carte ${index} sur ${total}`,
      close: "Fermer",
      delete: "Supprimer cette carte",
      deleteConfirm: "Supprimer\u00A0?",
      deleteCancel: "Annuler",
      addTitle: "Ajouter une carte",
      frontLabel: "Recto",
      backLabel: "Verso",
      noteLabel: "Note",
      noteHint: "Facultatif",
      save: "Ajouter",
      addError: "La carte n'a pas pu être ajoutée.",
    },

    todo: {
      empty: "Rien à faire pour l'instant\u00A0!",
      addPlaceholder: "Ajouter une tâche…",
      add: "Ajouter",
      toggle: (text) => `Cocher «\u00A0${text}\u00A0»`,
      delete: (text) => `Supprimer «\u00A0${text}\u00A0»`,
      byTeacher: "Jenn",
      error: "Ça n'a pas fonctionné. Réessayez.",
    },

    shelf: {
      add: "Ajouter",
      addLink: "Ajouter un lien",
      addPage: "Ajouter une page",
      addPdf: "Ajouter un PDF",
      linkUrlAriaLabel: "Adresse du lien",
      linkError: "Ce lien n'a pas pu être ajouté.",
      pageError: "Cette page n'a pas pu être ajoutée.",
      pdfTooLarge: "Ce PDF dépasse 3 Mo.",
      pdfError: "Ce PDF n'a pas pu être ajouté.",
      pastePrompt: "Collez le code HTML ici (⌘V)",
      pasteAccepted: (size) => `Page reçue — ${size}`,
      pasteAriaLabel: "Code HTML de la page",
      pasteNotHtml: "Ce n'est pas une page HTML.",
      choosePdf: "Choisir un PDF",
      pdfHint: "PDF, 3 Mo maximum",
      titleAriaLabel: "Titre du document",
    },

    auth: {
      badEmail: "Ce courriel ne semble pas valide.",
      tooShort: (min) =>
        `Le mot de passe doit contenir au moins ${min} caractères.`,
      tooLong: "Ce mot de passe est trop long.",
      signInFailed: "Le courriel ou le mot de passe ne correspond pas.",
      tooManyTries:
        "Trop d'essais. Réessayez dans quinze minutes ou écrivez à Jenn.",
      inviteUsed:
        "Ce lien a déjà été utilisé. Écrivez à Jenn pour en recevoir un nouveau.",
      emailTaken:
        "Ce courriel est déjà utilisé par un autre élève. Utilisez une autre adresse ou écrivez à Jenn.",
      genericFailure: "Une erreur est survenue. Réessayez.",
      emailLabel: "Courriel",
      passwordLabel: "Mot de passe",
      showPassword: "Afficher le mot de passe",
      hidePassword: "Masquer le mot de passe",
      signUpIntro:
        "Créez votre compte pour accéder à vos documents et au clavardage.",
      signInIntro:
        "Connectez-vous pour accéder à vos documents et au clavardage.",
      createAccount: "Créer mon compte",
      creating: "Création…",
      signIn: "Se connecter",
      signingIn: "Connexion…",
      signOut: "Se déconnecter",
      haveAccount: "Vous avez un compte ? Se connecter",
    },

    signInPage: {
      subtitle: "Connectez-vous pour retrouver votre page.",
      forgotPassword:
        "Mot de passe oublié ? Écrivez à Jenn et elle vous enverra un nouveau lien.",
      backToHome: "← Retour à l'accueil",
    },
  },

  chat: {
    title: "Clavardage",
    empty: "Aucun message pour l'instant.",
    placeholder: "Écrivez un message…",
    send: "Envoyer",
    back: "Retour",
    deleteMessage: "Supprimer",
    reply: "Répondre",
    cancelReply: "Annuler la réponse",
  },

  admin: {
    header: {
      title: "Admin",
      greeting: "Bonjour Jenn !",
      logOut: "Se déconnecter",
    },

    nav: {
      sectionsLabel: "Sections de l'admin",
      daily: "Mot du jour",
      students: "Élèves",
      pages: "Pages",
    },

    fab: {
      add: "Ajouter",
    },

    addMenu: {
      addStudent: "Ajouter un élève",
      addLink: "Ajouter un lien",
      addPage: "Ajouter une page",
    },

    sheets: {
      addStudentTitle: "Ajouter un élève",
      addLinkTitle: "Ajouter un lien",
      addPageTitle: "Ajouter une page",
      editPageTitle: "Modifier la page",
      loading: "Chargement…",
    },

    datePicker: {
      label: "Date",
      dialog: "Choisir une date",
      previousMonth: "Mois précédent",
      nextMonth: "Mois suivant",
    },

    cardEditor: {
      englishPhraseLabel: "Phrase anglaise *",
      frenchPhraseLabel: "Phrase française *",
      subjectLabel: "Sujet *",
      subjectPillLabel: "Sujet",
      generate: "Générer",
      generating: "Génération…",
      requiredFields:
        "La phrase anglaise et la réponse française sont toutes les deux requises.",
      front: "Recto",
      back: "Verso",
      usagePlaceholder: "Emploi — p. ex. Habitudes du passé",
      usageAriaLabel: "Emploi",
      sayItInFrenchRequired: "Dites-le en français *",
      englishSentence: "Phrase anglaise à traduire",
      hintPlaceholder: "Indice (facultatif)",
      hintAriaLabel: "Indice",
      theAnswerRequired: "La réponse *",
      frenchAnswer: "Réponse française",
      saveCard: "Enregistrer la carte",
      deleteConfirm: "Supprimer cette carte ?",
      deleteCard: "Supprimer la carte",
      cardSaved: "Carte enregistrée",
      deleteError: "La carte n'a pas pu être supprimée",
    },

    cardAi: {
      unavailable: "Claude n'est pas configuré sur ce serveur.",
      badKey: "Claude a rejeté la clé API.",
      rateLimited: "Claude a atteint sa limite — réessayez dans un instant.",
      unreachable: "Impossible de joindre Claude. Réessayez.",
      refused: "Claude a refusé de répondre à celle-ci.",
    },

    groups: {
      noStudentsYet: "Pas encore d'élèves.",
      searchLabel: "Chercher des élèves",
      unreadCount: (count) => `${count} non lu${count > 1 ? "s" : ""}`,
      summaryToCorrect: (count) =>
        `${count} devoir${count > 1 ? "s" : ""} à corriger`,
      summaryStarted: (count) =>
        `${count} devoir${count > 1 ? "s" : ""} commencé${count > 1 ? "s" : ""}`,
      summaryNotOpened: (count) =>
        `${count} devoir${count > 1 ? "s" : ""} pas encore ouvert${count > 1 ? "s" : ""}`,
      summaryNewFlashcards: (count) =>
        `${count} nouvelle${count > 1 ? "s" : ""} carte${count > 1 ? "s" : ""}`,
      summaryNewFiles: (count) =>
        `${count} nouveau${count > 1 ? "x" : ""} fichier${count > 1 ? "s" : ""}`,
      summaryItemsDone: (count) =>
        `${count} tâche${count > 1 ? "s" : ""} terminée${count > 1 ? "s" : ""}`,
      summaryNothingNew: "Rien de nouveau.",
      copyInviteAria: (name) => `Copier le lien d'invitation pour ${name}`,
      inviteCopiedAria: (name) => `Lien d'invitation pour ${name} copié`,
      copyInviteTitle: "Copier le lien d'invitation",
      copiedTitle: "Copié",
      resetAria: (name) => `Réinitialiser la connexion de ${name}`,
      newInviteAria: (name) => `Nouveau lien d'invitation pour ${name}`,
      resetTitle: "Réinitialiser la connexion",
      newInviteTitle: "Nouveau lien d'invitation",
      deleteAria: (name) => `Supprimer ${name}`,
      everyoneLabel: "tout le monde",
      deleteConfirm: (name) => `Supprimer ${name} ?`,
      invitationNotUsed: "Invitation pas encore utilisée",
      signedUp: (date) => ` · inscrit le ${date}`,
      copyThisLink: "Copier ce lien",
      makeNewInviteConfirm: (name) =>
        `Créer un nouveau lien d'invitation pour ${name} ? L'ancien cessera de fonctionner.`,
      resetSignInConfirm: (name) =>
        `Réinitialiser la connexion de ${name} ? Son courriel et son mot de passe sont effacés et ses anciens liens cessent de fonctionner. Ses pages, son clavardage et ses tableaux restent.`,
      resetting: "Réinitialisation…",
      reset: "Réinitialiser",
      couldNotDelete: "L'élève n'a pas pu être supprimé",
      couldNotReset: "Cette connexion n'a pas pu être réinitialisée",
    },

    newGroupForm: {
      nameLabel: "Nom de l'élève",
      helper:
        "Leur lien est généré à partir de ce nom — « Marie Dupont » devient /g/marie-dupont.",
      addButton: "Ajouter l'élève",
    },

    pageForm: {
      studentsLegend: "Élèves",
      noStudentsYet: "Pas encore d'élèves.",
      allStudents: "Tous les élèves",
      pickAtLeastOne: "Choisissez au moins un élève.",
    },

    titleLabel: "Titre",
    preparingPreview: "Préparation de l'aperçu…",
    pdfTooLarge: "Ce PDF dépasse 3 Mo.",
    noMatches: "Rien ne correspond.",

    addLinkForm: {
      urlAriaLabel: "Adresse du lien",
      addButton: "Ajouter le lien",
      error: "Ce lien n'a pas pu être ajouté.",
    },

    newPageForm: {
      pageLabel: "Page",
      pastePrompt:
        "Collez le code HTML de la page ici (⌘V) — elle est publiée aussitôt",
      publishing: "Publication…",
      pasteAccepted: (size) => `Publiée — ${size}`,
      pasteAriaLabel: "Code HTML de la page à publier",
      titleFromDocumentNote:
        "Le titre vient du document. Vous pouvez le renommer par la suite ; le lien qu'il obtient est permanent.",
      pdfLabel: "PDF",
      pdfInputLabel: "PDF à publier",
      pdfEmptyHint: "Déposez un PDF ici, ou cliquez pour en choisir un",
      pdfExistingHint: "Déposez-en un autre pour le remplacer.",
      titleFromFilenameNote: "Le titre vient du nom du fichier. 3 Mo maximum.",
      publishPdf: "Publier le PDF",
      remove: "Retirer",
    },

    pageEditor: {
      worksheetLabel: "Les élèves peuvent enregistrer leurs réponses",
      worksheetHelp:
        "S'ouvre sur la propre page de l'élève, avec un bouton Enregistrer et jusqu'à trois versions.",
      replacePdfLabel: "Remplacer le PDF",
      pdfReplaceInputLabel: "PDF pour remplacer celui-ci",
      pdfExistingHint: "Un PDF est publié. Déposez-en un nouveau pour le remplacer.",
      saved: "Enregistré",
      deleteLabel: "Supprimer la page",
      deleteError: "La page n'a pas pu être supprimée",
      submitLabelStandalone: "Enregistrer la page",
      submitLabelOverlay: "Enregistrer",
    },

    pageList: {
      noPagesYet: "Pas encore de pages.",
      searchLabel: "Chercher des pages",
      kindFilter: {
        group: "Filtrer par type",
        all: "Tout",
        html: "Les pages",
        link: "Les liens",
        pdf: "Les PDF",
      },
      sortFilter: {
        group: "Trier par",
        created: "Ajout",
        modified: "Modification",
      },
      filterToggle: "Filtres",
      filterActive: "Filtres actifs",
      filterByStudentAria: "Filtrer par élève",
      addedByStudent: "ajouté par l'élève",
      editAria: (title) => `Modifier ${title}`,
      downloadAria: (title) => `Télécharger ${title}`,
      pinAria: (title) => `Épingler ${title}`,
      unpinAria: (title) => `Désépingler ${title}`,
      pinDisabled: "Choisir un élève pour épingler",
      deleteAria: (title) => `Supprimer ${title}`,
    },

    sectionEditor: {
      deleteConfirm: "Supprimer la section ?",
      moveUpAria: (label) => `Déplacer ${label} vers le haut`,
      moveDownAria: (label) => `Déplacer ${label} vers le bas`,
      deleteAria: (label) => `Supprimer ${label}`,
      untitled: "section sans titre",
      addNew: "Ajouter une nouvelle section",
      titlePlaceholder: "Titre de la section",
      newTitleAria: "Titre de la nouvelle section",
      titleAria: (label) => `Titre de ${label}`,
      textPlaceholder: "Texte de la section",
      newTextAria: "Texte de la nouvelle section",
      textAria: (label) => `Texte de ${label}`,
    },

    skippedAssets: {
      notIncluded: (count) =>
        count === 1
          ? "La page est publiée, mais 1 fichier n'a pas pu être inclus :"
          : `La page est publiée, mais ${count} fichiers n'ont pas pu être inclus :`,
    },

    studentPreview: {
      heading: "Ce que voit l'élève",
    },

    chat: {
      title: "Messages",
      pickOne: "Choisissez un élève pour voir votre conversation.",
      search: "Chercher des élèves",
      noStudents: "Pas encore d'élèves.",
      noMatch: "Rien ne correspond.",
      noMessages: "Aucun message pour l'instant",
      you: "Vous : ",
      yesterday: "Hier",
      unread: "Messages non lus",
      notSignedUp: "Pas encore inscrit",
      notSignedUpLong: (name) =>
        `${name} ne s'est pas encore inscrit, alors il n'y a personne pour recevoir un message. Partagez son lien d'invitation.`,
      copyInvite: "Copier l'invitation",
      copied: "Copié",
    },

    standalonePage: {
      backToPages: "← Pages",
      linkNote: "— le lien reste le même quand vous renommez la page.",
      saveLabel: "Enregistrer la page",
    },

    actions: {
      unauthorized: "Non autorisé",
      titleRequired: "Un titre est requis.",
      studentNameRequired: "Un élève a besoin d'un nom.",
      nameTaken: "Ce nom est déjà pris — essayez d'ajouter un nom de famille.",
      everyoneCannotBeDeleted: "Tout le monde ne peut pas être supprimé.",
      everyoneCannotBePinned: "On ne peut rien épingler pour tout le monde.",
      groupDeletedMidEdit:
        "Un de ces élèves vient d'être supprimé — rechargez la page et réessayez.",
      pdfRequired: "Un fichier PDF est requis.",
      fillFieldsFirst: "Remplissez d'abord les trois champs.",
    },

    formatPopover: {
      textFormatting: "Mise en forme du texte",
      bold: "Gras",
      italic: "Italique",
      phonetic: "Phonétique",
      colorLabel: (color) => {
        const names: Record<CardColor, string> = {
          red: "rouge",
          blue: "bleu",
          green: "vert",
          gold: "or",
          black: "noir",
        };
        return `texte ${names[color]}`;
      },
    },

    genericError: "Une erreur est survenue",
  },

  pdfViewer: {
    loading: "Chargement…",
    renderFailed: "Ce PDF n'a pas pu s'afficher ici.",
    download: "Télécharger le PDF",
    openInBrowser: "Ouvrir dans le navigateur",
    back: "Retour",
    pageAria: (page) => `Page ${page}`,
  },

  worksheet: {
    versionsLabel: "Versions du devoir",
    backToFiles: "Les fichiers",
    readOnly: "Lecture seule",
    stuckHint:
      "On ne peut plus écrire dans cette copie. Recommence pour la refaire.",
    saveFailed: "L'enregistrement a échoué. Essaie encore.",

    tabs: {
      blank: "Le devoir",
      myAnswers: "Mes réponses",
      // The WHOLE name, and always "de" — the rule teacherPageLabel records.
      // Two students can share a first name.
      studentAnswers: (name) => `Les réponses de ${name}`,
      myCorrection: "Ma correction",
      // "Jenn" is hardcoded, exactly as versionNotice hardcodes it: there is
      // exactly one teacher, and she has a name rather than a role.
      teacherCorrection: "La correction de Jenn",
    },

    send: {
      toTeacher: "Envoyer à Jenn",
      toStudent: (name) => `Envoyer à ${name}`,
      sending: "Envoi…",
      sent: "Envoyé",
      nothingYet: "Il n'y a rien à envoyer pour le moment",
      alreadySent: "Déjà envoyé — modifie quelque chose pour renvoyer",
      notSaved: "Enregistrement impossible. Rien n'a été envoyé.",
      failed: "L'envoi a échoué. Essaie encore.",
    },

    reset: {
      student: "Recommencer",
      teacher: "Supprimer ma correction",
      confirmStudent: "Recommencer ce devoir ? Tes réponses seront effacées.",
      confirmTeacher: "Supprimer ta correction ? C'est définitif.",
    },
  },
};

const en: Strings = {
  common: {
    today: "Today",
    close: "Close",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    clear: "Clear",
    edit: "Edit",
    delete: "Delete",
    deleting: "Deleting…",
    download: "Download",
    pin: "Pin",
    unpin: "Unpin",
    adding: "Adding…",

    card: {
      flip: "Flip card",
      sayItInFrench: "Say it in French",
      tapToReveal: "tap to reveal the answer",
      answer: "The answer",
      revision: "Revision",
    },
  },

  student: {
    brand: {
      wordmark: "Français Avec Jenn",
      tagline: "One day, one card — Québec-flavoured",
    },

    greeting: (first) => `Hello ${first}`,

    // Possessive 's, always — including a name ending in s ("Jonas's page").
    // One rule, no special case: that is Chicago's own position, written down
    // so the special case does not get added back later as a "fix". French
    // needs no equivalent branch — see the fr side.
    teacherPageLabel: (full) => `${full}'s page`,

    page: {
      backToAdmin: "← Back to admin",
      unclaimedNotice: (name) =>
        `${name} hasn't signed up yet. Share this link once — it lets them create their account:`,
      staleNotice: (name) =>
        `Your link for ${name} is out of date — ${name} has signed up since, which changes it. Open this student from the admin Students tab to unlock the chat and boards.`,
      nothingPosted: "Nothing posted yet — check back soon!",
    },

    tabs: {
      sectionsLabel: "Sections",
      card: "The card",
      files: "Files",
      board: "Board",
      deck: "Vocabulary",
      todo: "To-do",
      unseenLabel: "New",
    },

    card: {
      eyebrow: "⚜ Card of the day ⚜",
    },

    filesPage: {
      eyebrow: "⚜ Resources ⚜",
      backToCard: "← Card of the day",
    },

    dateNav: {
      dialogLabel: "Choose a date",
      previousMonth: "Previous month",
      nextMonth: "Next month",
    },

    files: {
      searchLabel: "Search",
      // A neutral noun, not an instruction to reveal: aria-expanded already
      // carries open/closed, and "Show filters, expanded" read like a
      // contradiction to a screen reader.
      filterToggle: "Filters",
      filterActive: "Filters active",
      kindFilter: {
        group: "Filter by type",
        all: "All",
        html: "Pages",
        link: "Links",
        pdf: "PDFs",
      },
      sortFilter: {
        group: "Sort by",
        created: "Added",
        modified: "Modified",
      },
      emptyShelf: "Nothing here yet.",
      noMatches: "Nothing matches.",
      edit: (title) => `Edit ${title}`,
      editTitle: "Edit",
      pin: (title) => `Pin ${title}`,
      pinTitle: "Pin",
      unpin: (title) => `Unpin ${title}`,
      unpinTitle: "Unpin",
      delete: (title) => `Delete ${title}`,
      deleteTitle: "Delete",
    },

    board: {
      newBoard: "New board",
      empty: "No boards yet!",
      drawingPage: (page) => `Page ${page} — Jenn is drawing…`,
      liveNow: "Jenn is drawing right now",
      openLive: "Open the board",
      download: "Download",
      downloadFailed: "Failed",
      delete: "Delete",
      pageCount: (count) => (count === 1 ? "1 page" : `${count} pages`),
      viewer: {
        open: (label) => `Open the board from ${label}`,
        close: "Close",
        position: (page, total) => `Page ${page} of ${total}`,
        previous: "Previous page",
        next: "Next page",
        zoomIn: "Zoom in",
        zoomOut: "Zoom out",
        resetZoom: "Actual size",
        loadFailed: "This board could not be opened.",
      },
    },

    deck: {
      empty: "No cards yet!",
      sort: {
        group: "Sort by",
        added: "Added",
        random: "Random",
        revision: "Needs revision",
      },
      flipCard: (front) => `Flip the card “${front}”`,
      open: (front) => `Open the card “${front}”`,
      flip: "Flip",
      flipHint: "Flip the card",
      previous: "Previous card",
      next: "Next card",
      position: (index, total) => `Card ${index} of ${total}`,
      close: "Close",
      delete: "Delete this card",
      deleteConfirm: "Delete?",
      deleteCancel: "Cancel",
      addTitle: "Add a flashcard",
      frontLabel: "Front",
      backLabel: "Back",
      noteLabel: "Note",
      noteHint: "Optional",
      save: "Add",
      addError: "That card could not be added.",
    },

    todo: {
      empty: "Nothing to do yet!",
      addPlaceholder: "Add an item…",
      add: "Add",
      toggle: (text) => `Tick “${text}”`,
      delete: (text) => `Delete “${text}”`,
      byTeacher: "Jenn",
      error: "That did not work. Try again.",
    },

    shelf: {
      add: "Add",
      addLink: "Add a link",
      addPage: "Add a page",
      addPdf: "Add a PDF",
      linkUrlAriaLabel: "Link address",
      linkError: "This link could not be added.",
      pageError: "This page could not be added.",
      pdfTooLarge: "This PDF is over 3 MB.",
      pdfError: "This PDF could not be added.",
      pastePrompt: "Paste the HTML here (⌘V)",
      pasteAccepted: (size) => `Page received — ${size}`,
      pasteAriaLabel: "Page HTML",
      pasteNotHtml: "That isn't an HTML page.",
      choosePdf: "Choose a PDF",
      pdfHint: "PDF, up to 3 MB",
      titleAriaLabel: "Title",
    },

    auth: {
      badEmail: "That email doesn't look valid.",
      tooShort: (min) => `The password must be at least ${min} characters.`,
      tooLong: "That password is too long.",
      signInFailed: "That email or password doesn't match.",
      tooManyTries:
        "Too many attempts. Try again in fifteen minutes, or email Jenn.",
      inviteUsed:
        "This link has already been used. Email Jenn for a new one.",
      emailTaken:
        "That email is already used by another student. Use a different address, or email Jenn.",
      genericFailure: "Something went wrong. Try again.",
      emailLabel: "Email",
      passwordLabel: "Password",
      showPassword: "Show password",
      hidePassword: "Hide password",
      signUpIntro: "Create your account to reach your files and the chat.",
      signInIntro: "Sign in to reach your files and the chat.",
      createAccount: "Create my account",
      creating: "Creating…",
      signIn: "Sign in",
      signingIn: "Signing in…",
      signOut: "Sign out",
      haveAccount: "Already have an account? Sign in",
    },

    signInPage: {
      subtitle: "Sign in to find your page.",
      forgotPassword: "Forgot your password? Email Jenn and she'll send you a new link.",
      backToHome: "← Back to home",
    },
  },

  chat: {
    title: "Chat",
    empty: "No messages yet.",
    placeholder: "Write a message…",
    send: "Send",
    back: "Back",
    deleteMessage: "Delete",
    reply: "Reply",
    cancelReply: "Cancel reply",
  },

  admin: {
    header: {
      title: "Admin",
      greeting: "Hello Jenn!",
      logOut: "Log out",
    },

    nav: {
      sectionsLabel: "Admin sections",
      daily: "Daily word",
      students: "Students",
      pages: "Pages",
    },

    fab: {
      add: "Add",
    },

    addMenu: {
      addStudent: "Add a student",
      addLink: "Add a link",
      addPage: "Add a page",
    },

    sheets: {
      addStudentTitle: "Add a student",
      addLinkTitle: "Add a link",
      addPageTitle: "Add a page",
      editPageTitle: "Edit page",
      loading: "Loading…",
    },

    datePicker: {
      label: "Date",
      dialog: "Choose a date",
      previousMonth: "Previous month",
      nextMonth: "Next month",
    },

    cardEditor: {
      englishPhraseLabel: "English phrase *",
      frenchPhraseLabel: "French phrase *",
      subjectLabel: "Subject *",
      subjectPillLabel: "Subject",
      generate: "Generate",
      generating: "Generating…",
      requiredFields: "The English sentence and the French answer are both needed.",
      front: "Front",
      back: "Back",
      usagePlaceholder: "Usage — e.g. Habits of the past",
      usageAriaLabel: "Usage",
      sayItInFrenchRequired: "Say it in French *",
      englishSentence: "English sentence to translate",
      hintPlaceholder: "Hint (optional)",
      hintAriaLabel: "Hint",
      theAnswerRequired: "The answer *",
      frenchAnswer: "French answer",
      saveCard: "Save card",
      deleteConfirm: "Delete this card?",
      deleteCard: "Delete card",
      cardSaved: "Card saved",
      deleteError: "Could not delete the card",
    },

    cardAi: {
      unavailable: "Claude isn't configured on this server.",
      badKey: "Claude rejected the API key.",
      rateLimited: "Claude is rate limited — try again in a moment.",
      unreachable: "Claude couldn't be reached. Try again.",
      refused: "Claude declined to answer this one.",
    },

    groups: {
      noStudentsYet: "No students yet.",
      searchLabel: "Search students",
      unreadCount: (count) => `${count} unread`,
      summaryToCorrect: (count) =>
        `${count} homework to correct`,
      summaryStarted: (count) =>
        `${count} homework started`,
      summaryNotOpened: (count) =>
        `${count} homework not opened`,
      summaryNewFlashcards: (count) =>
        `${count} new flashcard${count > 1 ? "s" : ""}`,
      summaryNewFiles: (count) =>
        `${count} new file${count > 1 ? "s" : ""}`,
      summaryItemsDone: (count) =>
        `${count} to-do${count > 1 ? "s" : ""} done`,
      summaryNothingNew: "Nothing new.",
      copyInviteAria: (name) => `Copy invite link for ${name}`,
      inviteCopiedAria: (name) => `Invite link for ${name} copied`,
      copyInviteTitle: "Copy invite link",
      copiedTitle: "Copied",
      resetAria: (name) => `Reset sign-in for ${name}`,
      newInviteAria: (name) => `New invite link for ${name}`,
      resetTitle: "Reset sign-in",
      newInviteTitle: "New invite link",
      deleteAria: (name) => `Delete ${name}`,
      everyoneLabel: "everyone",
      deleteConfirm: (name) => `Delete ${name}?`,
      invitationNotUsed: "Invitation not used yet",
      signedUp: (date) => ` · signed up ${date}`,
      copyThisLink: "Copy this link",
      makeNewInviteConfirm: (name) =>
        `Make a new invite link for ${name}? The old one stops working.`,
      resetSignInConfirm: (name) =>
        `Reset sign-in for ${name}? Their email and password are cleared and their old links stop working. Their pages, chat and boards stay.`,
      resetting: "Resetting…",
      reset: "Reset",
      couldNotDelete: "Could not delete the student",
      couldNotReset: "Could not reset that sign-in",
    },

    newGroupForm: {
      nameLabel: "Student name",
      helper:
        "Their link is made from this name — “Marie Dupont” becomes /g/marie-dupont.",
      addButton: "Add student",
    },

    pageForm: {
      studentsLegend: "Students",
      noStudentsYet: "No students yet.",
      allStudents: "All students",
      pickAtLeastOne: "Choose at least one student.",
    },

    titleLabel: "Title",
    preparingPreview: "Preparing preview…",
    pdfTooLarge: "That PDF is larger than 3 MB.",
    noMatches: "Nothing matches that.",

    addLinkForm: {
      urlAriaLabel: "Link address",
      addButton: "Add link",
      error: "Could not add that link",
    },

    newPageForm: {
      pageLabel: "Page",
      pastePrompt: "Paste the page's HTML here (⌘V) — it publishes straight away",
      publishing: "Publishing…",
      pasteAccepted: (size) => `Published — ${size}`,
      pasteAriaLabel: "HTML of the page to publish",
      titleFromDocumentNote:
        "The title comes from the document. You can rename it afterwards; the link it gets is permanent.",
      pdfLabel: "PDF",
      pdfInputLabel: "PDF to publish",
      pdfEmptyHint: "Drop a PDF here, or click to choose one",
      pdfExistingHint: "Drop another to replace it.",
      titleFromFilenameNote: "The title comes from the filename. Up to 3 MB.",
      publishPdf: "Publish PDF",
      remove: "Remove",
    },

    pageEditor: {
      worksheetLabel: "Students can save their answers",
      worksheetHelp:
        "Opens on the student's own page, with a Save button and up to three versions.",
      replacePdfLabel: "Replace the PDF",
      pdfReplaceInputLabel: "PDF to replace this one with",
      pdfExistingHint: "A PDF is published. Drop a new one to replace it.",
      saved: "Saved",
      deleteLabel: "Delete page",
      deleteError: "Could not delete the page",
      submitLabelStandalone: "Save page",
      submitLabelOverlay: "Save",
    },

    pageList: {
      noPagesYet: "No pages yet.",
      searchLabel: "Search pages",
      kindFilter: {
        group: "Filter by kind",
        all: "All",
        html: "Pages",
        link: "Links",
        pdf: "PDFs",
      },
      sortFilter: {
        group: "Sort by",
        created: "Added",
        modified: "Modified",
      },
      filterToggle: "Filters",
      filterActive: "Filters active",
      filterByStudentAria: "Filter by student",
      addedByStudent: "added by student",
      editAria: (title) => `Edit ${title}`,
      downloadAria: (title) => `Download ${title}`,
      pinAria: (title) => `Pin ${title}`,
      unpinAria: (title) => `Unpin ${title}`,
      pinDisabled: "Pick a student to pin for",
      deleteAria: (title) => `Delete ${title}`,
    },

    sectionEditor: {
      deleteConfirm: "Delete section?",
      moveUpAria: (label) => `Move ${label} up`,
      moveDownAria: (label) => `Move ${label} down`,
      deleteAria: (label) => `Delete ${label}`,
      untitled: "untitled section",
      addNew: "Add new section",
      titlePlaceholder: "Section title",
      newTitleAria: "New section title",
      titleAria: (label) => `${label} title`,
      textPlaceholder: "Section text",
      newTextAria: "New section text",
      textAria: (label) => `${label} text`,
    },

    skippedAssets: {
      notIncluded: (count) =>
        `The page is published, but ${count} ${count === 1 ? "file" : "files"} could not be included:`,
    },

    studentPreview: {
      heading: "As the student sees it",
    },

    chat: {
      title: "Messages",
      pickOne: "Pick a student to see your conversation.",
      search: "Search students",
      noStudents: "No students yet.",
      noMatch: "Nothing matches that.",
      noMessages: "No messages yet",
      you: "You: ",
      yesterday: "Yesterday",
      unread: "Unread messages",
      notSignedUp: "Hasn't signed up yet",
      notSignedUpLong: (name) =>
        `${name} hasn't signed up yet, so there's nobody to receive a message. Share their invite link.`,
      copyInvite: "Copy invite",
      copied: "Copied",
    },

    standalonePage: {
      backToPages: "← Pages",
      linkNote: "— the link stays the same when you rename the page.",
      saveLabel: "Save page",
    },

    actions: {
      unauthorized: "Unauthorized",
      titleRequired: "A title is required.",
      studentNameRequired: "A student needs a name.",
      nameTaken: "That name is already taken — try adding a surname.",
      everyoneCannotBeDeleted: "Everyone can't be deleted.",
      everyoneCannotBePinned: "Nothing can be pinned for everyone.",
      groupDeletedMidEdit:
        "One of those groups was just deleted — reload the page and try again.",
      pdfRequired: "A PDF file is required.",
      fillFieldsFirst: "Fill in all three fields first.",
    },

    formatPopover: {
      textFormatting: "Text formatting",
      bold: "Bold",
      italic: "Italic",
      phonetic: "Phonetic",
      colorLabel: (color) => `${color} text`,
    },

    genericError: "Something went wrong",
  },

  pdfViewer: {
    loading: "Loading…",
    renderFailed: "This PDF couldn't be displayed here.",
    download: "Download PDF",
    openInBrowser: "Open in browser",
    back: "Back",
    pageAria: (page) => `Page ${page}`,
  },

  worksheet: {
    versionsLabel: "Worksheet versions",
    backToFiles: "Back to files",
    readOnly: "Read-only",
    stuckHint:
      "This copy can't be typed in any more. Start again to redo it.",
    saveFailed: "That didn't save. Try again.",

    tabs: {
      blank: "The worksheet",
      myAnswers: "My answers",
      // The WHOLE name, and always 's — the rule teacherPageLabel records.
      // Two students can share a first name, and "Jonas' answers" would be a
      // second possessive rule for one apostrophe's worth of grammar.
      studentAnswers: (name) => `${name}'s answers`,
      myCorrection: "My correction",
      teacherCorrection: "Jenn's correction",
    },

    send: {
      toTeacher: "Send to Jenn",
      toStudent: (name) => `Send to ${name}`,
      sending: "Sending…",
      sent: "Sent",
      nothingYet: "Nothing saved to send yet",
      alreadySent: "Already sent — change something to send again",
      notSaved: "That didn't save, so nothing was sent.",
      failed: "That didn't send. Try again.",
    },

    reset: {
      student: "Start again",
      teacher: "Delete correction",
      confirmStudent: "Start this worksheet again? Your answers will be erased.",
      confirmTeacher: "Delete your correction? This cannot be undone.",
    },
  },
};

const DICTIONARIES: Record<Locale, Strings> = { fr, en };

export function getStrings(locale: Locale): Strings {
  return DICTIONARIES[locale];
}
