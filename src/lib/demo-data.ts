// Shared types and demo data for the Forge dashboard

export type Difficulty = "easy" | "medium" | "hard" | "very_hard";

export type Subject = {
  id: string;
  name: string;
  code: string;
  color: string; // tailwind gradient or oklch
  lecturer?: string;
  difficulty?: Difficulty;
};

export type EventBlock = {
  id: string;
  subjectId: string;
  title: string;
  type: "class" | "study" | "break" | "exam";
  day: number; // 0 Mon..6 Sun
  start: number; // minutes from 0:00
  end: number;
  date?: string; // YYYY-MM-DD for one-off calendar events
  venue?: string;
  note?: string;
};

export const SUBJECTS: Subject[] = [
  {
    id: "s1",
    name: "Calculus II",
    code: "MTH 201",
    color: "from-indigo-500 to-purple-500",
    lecturer: "Dr. Adeyemi",
  },
  {
    id: "s2",
    name: "Data Structures",
    code: "CSC 210",
    color: "from-blue-500 to-cyan-500",
    lecturer: "Dr. Okafor",
  },
  {
    id: "s3",
    name: "Organic Chemistry",
    code: "CHM 220",
    color: "from-fuchsia-500 to-pink-500",
    lecturer: "Prof. Bello",
  },
  {
    id: "s4",
    name: "Linear Algebra",
    code: "MTH 205",
    color: "from-violet-500 to-indigo-500",
    lecturer: "Dr. Suleiman",
  },
  {
    id: "s5",
    name: "English Comp.",
    code: "GST 101",
    color: "from-emerald-500 to-teal-500",
    lecturer: "Mr. Hassan",
  },
];

const t = (h: number, m = 0) => h * 60 + m;

export const EVENTS: EventBlock[] = [
  // Mon
  {
    id: "e1",
    subjectId: "s1",
    title: "Calculus II",
    type: "class",
    day: 0,
    start: t(8),
    end: t(10),
    venue: "LT 1",
  },
  {
    id: "e2",
    subjectId: "s2",
    title: "Data Structures Lab",
    type: "class",
    day: 0,
    start: t(13),
    end: t(15),
    venue: "Lab B",
  },
  {
    id: "e3",
    subjectId: "s1",
    title: "Calculus practice",
    type: "study",
    day: 0,
    start: t(18),
    end: t(19, 30),
  },
  // Tue
  {
    id: "e4",
    subjectId: "s3",
    title: "Organic Chemistry",
    type: "class",
    day: 1,
    start: t(9),
    end: t(11),
    venue: "Chem Hall",
  },
  {
    id: "e5",
    subjectId: "s4",
    title: "Deep focus: Linear Algebra",
    type: "study",
    day: 1,
    start: t(15),
    end: t(17),
  },
  // Wed
  {
    id: "e6",
    subjectId: "s2",
    title: "Data Structures",
    type: "class",
    day: 2,
    start: t(10),
    end: t(12),
    venue: "LT 3",
  },
  {
    id: "e7",
    subjectId: "s5",
    title: "English Comp.",
    type: "class",
    day: 2,
    start: t(14),
    end: t(15),
  },
  {
    id: "e8",
    subjectId: "s2",
    title: "DS revision",
    type: "study",
    day: 2,
    start: t(19),
    end: t(20, 30),
  },
  // Thu
  {
    id: "e9",
    subjectId: "s4",
    title: "Linear Algebra",
    type: "class",
    day: 3,
    start: t(8),
    end: t(10),
    venue: "LT 2",
  },
  {
    id: "e10",
    subjectId: "s3",
    title: "OChem revision",
    type: "study",
    day: 3,
    start: t(16),
    end: t(18),
  },
  // Fri
  {
    id: "e11",
    subjectId: "s1",
    title: "Calculus tutorial",
    type: "class",
    day: 4,
    start: t(11),
    end: t(13),
    venue: "LT 1",
  },
  {
    id: "e12",
    subjectId: "s2",
    title: "Project work",
    type: "study",
    day: 4,
    start: t(15),
    end: t(17),
  },
  // Sat
  {
    id: "e13",
    subjectId: "s3",
    title: "Mock exam",
    type: "exam",
    day: 5,
    start: t(10),
    end: t(12),
  },
];

export const subjectById = (id: string) => SUBJECTS.find((s) => s.id === id)!;

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
