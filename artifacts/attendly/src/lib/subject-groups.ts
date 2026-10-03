import type { SubjectRecord } from "./attendly";

const subjectTypeOrder: Record<SubjectRecord["type"], number> = {
  Theory: 0,
  Practical: 1,
  Other: 2,
};

function compareSubjectNames(a: string, b: string) {
  return a.toLocaleLowerCase("en").localeCompare(b.toLocaleLowerCase("en"), "en", {
    sensitivity: "base",
    numeric: true,
  }) || a.localeCompare(b, "en", { numeric: true });
}

export function groupSubjectsForDisplay(subjects: SubjectRecord[]) {
  const groups = new Map<string, SubjectRecord[]>();
  for (const subject of subjects) {
    const key = subject.name.trim().normalize("NFKC").toLocaleLowerCase("en");
    groups.set(key, [...(groups.get(key) ?? []), subject]);
  }

  return Array.from(groups, ([key, records]) => {
    const sortedRecords = records.slice().sort((a, b) =>
      subjectTypeOrder[a.type] - subjectTypeOrder[b.type]
      || compareSubjectNames(a.name, b.name)
      || a.id.localeCompare(b.id),
    );
    return {
      key,
      name: sortedRecords[0].name.trim(),
      subjects: sortedRecords,
    };
  }).sort((a, b) => compareSubjectNames(a.name, b.name) || a.key.localeCompare(b.key));
}