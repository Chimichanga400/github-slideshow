/**
 * AppFeatures.js — Single source of truth for what the app can do.
 *
 * KEEP THIS UP TO DATE when you add a new feature.
 * The study coach reads this automatically — no other changes needed.
 *
 * Each entry:
 *   name        — short display name
 *   where       — where to find it in the app
 *   what        — one sentence: what it does for the student
 *   coachTip    — optional: how the coach should recommend it
 */
const AppFeatures = [
  {
    name: 'Guided Study',
    where: 'Study tab → select a topic',
    what: 'A 6-step walkthrough: orient, check prior knowledge, read notes, blank-recall, practice questions, reflect. ADAPTIVE: topics that are pure revision-question banks (no notes) automatically get a shortened question-first session — orient, drill every question, reflect — instead of notes pages.',
    coachTip: 'Best for first-time study of a topic or revisiting something weak. For question-bank topics, it IS the drill — recommend it as the way to practice imported revision questions.',
  },
  {
    name: 'Lecture Slides',
    where: 'Study tab → select a topic → tap "Lecture" or "Slides"',
    what: 'AI generates a full slide deck with bullet points and narration for the topic. Can be played automatically (auto-advances with narration) or presented full-screen.',
    coachTip: 'Good for visual learners or when the student wants a structured overview before diving into notes.',
  },
  {
    name: 'Review / Spaced Repetition',
    where: 'Review tab',
    what: 'Flashcard-style review of all topics. Cards are scheduled automatically — weak cards come back sooner. Modes: Today (due reviews blended with a PACED batch of new cards — a big upload is dripped in at a sustainable daily limit, not dumped all at once), All, and Weak Spots (the questions you keep getting wrong, hardest first, across the whole library). LEECH BREAKER: a card failed several times stops being re-drilled and the app offers to understand the concept instead of grinding a blank.',
    coachTip: 'Best for consolidation and exam prep. Do the "Today" session daily — it mixes review with a healthy number of new cards so nothing floods you. If a student keeps failing the same question, tell them that\'s a signal to LEARN the concept (open the topic / use the tutor), not to drill it harder — the app flags these automatically.',
  },
  {
    name: 'Library',
    where: 'Library tab',
    what: 'All topics with their notes, examples, questions, and mastery scores. Each topic has tabs: Notes, Examples, Questions, Mastery.',
    coachTip: 'Where the student reads and manages their source material.',
  },
  {
    name: 'Worked Examples',
    where: 'Library → topic → Examples tab',
    what: 'Solved accounting examples the student has scanned in. Can be read directly or taught step-by-step by the coach.',
    coachTip: 'For accounting, studying a worked example then redoing it covered-up is one of the most effective techniques.',
  },
  {
    name: 'Add / Scan Content',
    where: 'Add tab (+ button)',
    what: 'Scan photos of handbook pages or upload PDFs. AI extracts the content into structured notes. ADAPTIVE: uploads are classified automatically — worked examples are offered to the Examples tab, and question sheets are detected and offered as verbatim practice-question imports instead of being rewritten into notes.',
  },
  {
    name: 'Study Plan',
    where: 'Study Plan tab or Dashboard → Create Study Plan',
    what: 'Creates a day-by-day study schedule based on exam date, daily available time, and topic difficulty. Tracks session completion.',
    coachTip: 'If the student has an exam date, building a plan removes the daily "what should I study?" decision.',
  },
  {
    name: 'AI Study Coach (this)',
    where: 'More menu → Talk to your coach',
    what: 'Conversational coach that sees the whole library — topics, mastery, examples, plan. Advises on study strategy, technique, and what to prioritise. The coach and the worked-example tutor are ONE unified engine (same conversation, same memory) in different views. It can pivot modes on request: SOCRATIC TUTORING ("tutor me through my revision questions" — strategy first, micro-steps, no final answers given away, with Got-it/Struggled self-marking that updates mastery); RESOURCE MODE ("study my Gross Income topic with me" — loads that topic\'s full saved material into the chat, no re-upload, for explanations, summaries, and recall quizzing); and it can BUILD a linked Revision Questions topic from any existing topic\'s material ("make revision questions from my notes"). MEMORY: the conversation is saved on-device and survives closing the app, and stable facts the student states (exam dates, how much time they have each day, which subjects they are taking, work schedule, their study strategy) are remembered permanently and re-read on every reply — so the coach does not ask for the same information twice, and a correction replaces the old value.',
  },
  {
    name: 'Understanding Check',
    where: 'Study tab → topic → Check step',
    what: 'AI asks questions about the topic and evaluates your answers, giving feedback on gaps.',
  },
  {
    name: 'PowerPoint Export',
    where: 'Study tab → topic → Lecture Slides → ↓ PowerPoint',
    what: 'Downloads the generated slide deck as a real .pptx file.',
  },
  {
    name: 'Revision Questions Upload',
    where: 'Add tab → 📚 Revision Questions',
    what: 'Photograph EVERY page of a revision worksheet at once (questions, answer keys, solutions — multiple photos in one go). AI extracts every question and its answer exactly as written — nothing rewritten — into a topic as real, gradeable questions tracked by spaced repetition. Handles multiple-choice (options kept, letter-only answer keys expanded to full text) and long scenario questions (split per required part with the scenario data included).',
    coachTip: 'For students who study by working through revision questions: upload the worksheet, then drill it via Guided Study or Review. Misses surface under "Review in your textbook".',
  },
  {
    name: 'Past Exam Paper Upload',
    where: 'Add tab → 📝 Past Exam Paper',
    what: 'Upload all pages of a real past paper (with memo if available). Extracts EVERY question and model answer into a topic as practicable questions, AND learns the exam\'s style (question types, mark patterns) so future AI-generated questions match the real exam.',
    coachTip: 'The highest-value upload before an exam — the examiner\'s real questions become drillable material.',
  },
  {
    name: 'Exam Mode',
    where: 'Exam tab (sidebar, or More menu on mobile)',
    what: 'Three formats: Report Card (strengths vs gaps per subject), Timed Quiz (mock exam with countdown), and AI Exam (open answers graded with feedback). Pulls from every topic\'s question bank — including imported revision questions and past-paper questions. SMART SELECTION: the questions aren\'t random — the paper weights toward what the student keeps getting wrong, what\'s due for review, and subjects with analysed past papers, while keeping breadth across topics and varying each attempt. INTERACTIVE MATCHING: multiple-choice questions render as tappable choices, and a full match-and-pair set is reassembled into one interactive two-column table (Column A items ↔ Column B options) — tap an item then its match, and every pair is marked instantly on-device for free, no AI credits.',
    coachTip: 'Recommend a Timed Quiz when a student is strong on content but hasn\'t practiced under pressure. Each attempt targets their weak spots and exam-relevant topics, so re-taking it is genuinely useful, not repetitive.',
  },
  {
    name: 'Past Paper Drill',
    where: 'Progress (Dashboard) → 📝 button on a subject card',
    what: 'Replays the authentic questions extracted from that subject\'s uploaded past papers one at a time: answer, reveal the model answer, self-mark. Works offline, costs no AI credits.',
  },
  {
    name: 'Review in your textbook',
    where: 'Library → topic → Mastery tab',
    what: 'Lists the questions the student has answered wrong (Again/Hard), worst-missed first, with the model answers — a concrete list of exactly what to go re-read in the textbook.',
    coachTip: 'When a student asks "what should I focus on?", this list is the evidence-based answer for that topic.',
  },
  {
    name: 'Exam Readiness',
    where: 'Progress (Dashboard) — top card',
    what: 'An evidence-based readiness score computed on-device (no AI cost) from four signals: coverage (how much material is started), mastery, retention (are reviews overdue/decayed), and exam-fit (do high-mastery topics match the examiner\'s past-paper topics). Shows a prioritised "do these next" list — the fewest, highest-impact moves to get exam-ready fastest — each tappable to jump straight to the topic or task.',
    coachTip: 'When a student asks "am I ready?" or "where should I focus?", the Progress tab\'s Exam Readiness card is the evidence-based answer, and its top action is the single highest-leverage next move.',
  },
  {
    name: 'Study Colors',
    where: 'Settings → Study Color',
    what: 'Switches the app accent between research-informed color modes: Focus blue (math/logic work), Growth green (long marathons, easiest on the eyes), Energy orange (alertness for flashcards/exam prep), plus the default amber. Independent of dark/light mode.',
  },
];
