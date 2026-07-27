import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Français Avec Jenn",
  description:
    "French and English lessons with Jenn — a TEFL accredited teacher from Montreal, Quebec.",
};

// Set as a real CSS property rather than a Tailwind arbitrary value: `font-[…]`
// is ambiguous between font-family and font-weight, so the family was not
// reliably applied.
const SERIF = "Georgia, serif";
const MONO = '"Courier New", monospace';

const intro = [
  "Hi ! My name is Jenn.",
  "My pronouns are she / her.",
  "I am originally from Montreal, Canada.",
  "I speak fluently French and English and teach both languages.",
  "Besides teaching, I love gardening, reading and hiking.",
  "I love discovering new places to brunch and have good coffee.",
  "Before embarking on the teaching journey, I worked in the fashion industry as a leather goods designer and in a millinery studio.",
];

const teaching = [
  "Not only am I very enthusiastic about teaching, I also am a TEFL accredited teacher.",
  "My teaching methods combine accuracy and fluency oriented activities, to grasp the full potential of the students and prepare them for a wide range of interactions.",
  "Thus why I believe in spontaneous conversations to enhance confidence but first and foremost, to experiment with the targeted language.",
  "To do so, I tailor my classes by using different authentic materials, vocabulary activities as well as grammar exercises. I always keep in mind the student's interests to keep them motivated.",
];

const philosophy = [
  "To me, learning a new language is synonymous with curiosity, creativity and open-mindedness.",
  "Learning a new language enables you to communicate and share experiences with native speakers and non native speakers. Being a French Canadian from Quebec, I can expose you to the vernacular and idioms of this particular region. Technology has no bounds, hence why online teaching is to me the most suitable way of learning a new skill in the era we live in.",
];

const pills = ["French tutor", "From Canada 🇨🇦"];

const proseStyle = {
  fontFamily: SERIF,
  fontSize: "17px",
  lineHeight: 1.6,
};

export default function RootPage() {
  return (
    <main
      className="min-h-screen px-5 py-16 sm:py-24"
      style={{ background: "var(--card-page-bg)" }}
    >
      <div className="mx-auto w-full max-w-[660px]">
        <header>
          <h1
            className="text-[var(--card-ink)]"
            style={{
              fontFamily: SERIF,
              fontSize: "clamp(30px, 5vw, 46px)",
              lineHeight: 1.15,
            }}
          >
            Français Avec Jenn
          </h1>

          <div
            className="mt-6 h-[3px] w-24 rounded-full"
            style={{
              background:
                "linear-gradient(to right, var(--card-bleu), var(--card-or))",
            }}
          />

          <ul className="mt-6 flex flex-wrap gap-2">
            {pills.map((pill) => (
              <li
                key={pill}
                className="rounded-full border border-[var(--card-line)] bg-[var(--card-bleu-soft)] px-3.5 py-1.5 text-[13px] text-[var(--card-bleu)]"
                style={{ fontFamily: SERIF }}
              >
                {pill}
              </li>
            ))}
          </ul>

          <div className="mt-8 overflow-hidden rounded-[14px] border border-[var(--card-line)] bg-[var(--card-paper)] shadow-[var(--card-shadow)]">
            <div className="aspect-video w-full">
              <iframe
                className="h-full w-full"
                src="https://www.youtube-nocookie.com/embed/h4-8w-d6K3U"
                title="Meet Jenn"
                loading="lazy"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        </header>

        <div className="mt-10">
          <div>
            <section className="flex flex-col gap-2">
              {intro.map((line) => (
                <p key={line} className="text-[var(--card-ink)]" style={proseStyle}>
                  {line}
                </p>
              ))}
            </section>

            <section className="mt-9 flex flex-col gap-4">
              {teaching.map((line) => (
                <p key={line} className="text-[var(--card-ink)]" style={proseStyle}>
                  {line}
                </p>
              ))}
            </section>

            <section className="mt-9 flex flex-col gap-4">
              {philosophy.map((line) => (
                <p key={line} className="text-[var(--card-ink)]" style={proseStyle}>
                  {line}
                </p>
              ))}
            </section>

            <section className="mt-12 border-t border-dashed border-[var(--card-line)] pt-8">
              <h2
                className="text-[11px] uppercase tracking-[2px] text-[#a89a7f]"
                style={{ fontFamily: MONO }}
              >
                Certifications
              </h2>
              <div className="mt-4">
                <div
                  className="text-xs font-bold uppercase tracking-wider text-[var(--card-bleu)]"
                  style={{ fontFamily: MONO }}
                >
                  2022 — 2022
                </div>
                <div
                  className="mt-1 text-lg text-[var(--card-ink)]"
                  style={{ fontFamily: SERIF }}
                >
                  TEFL
                </div>
                <div
                  className="mt-0.5 text-[15px] italic text-[var(--card-moss)]"
                  style={{ fontFamily: SERIF }}
                >
                  Teaching English as a Foreign Language
                </div>
              </div>
            </section>

            <div className="mt-12">
              <Link
                href="/g/all"
                className="inline-flex items-center gap-2 rounded-full border border-[var(--card-bleu)] bg-[var(--card-paper)] px-6 py-3 text-[15px] text-[var(--card-bleu)] transition-colors hover:bg-[var(--card-bleu)] hover:text-[var(--card-paper)]"
                style={{ fontFamily: SERIF }}
              >
                Word of the day
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
