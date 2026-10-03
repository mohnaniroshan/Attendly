export const TIMETABLE_IMAGE_PROMPT = `Convert the attached timetable image into JSON for the Attendly attendance management app.

IMPORTANT:
- Read ONLY the information visible in the timetable image.
- Do NOT invent, assume, infer, or correct any information.
- Ignore information that is not needed for the JSON, such as faculty names, attendance percentages, course codes, credits, or other metadata.
- Extract only the subject name, day, class start time, class end time, and room number.
- Preserve the subject names exactly as they appear in the timetable.
- Do NOT rename, abbreviate, expand, or simplify subject names.
- Keep PP and PR as separate subjects/classes. Do NOT combine them.
- Support all seven days: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.
- Include every scheduled class visible in the image.
- If a subject has multiple classes on the same day, include all of them.
- If a practical occupies consecutive periods, represent each period separately.
- If a room number is visible, include it exactly as shown.
- If the room number is missing or unreadable, use an empty string "".
- Convert times into the format "hh:mm AM/PM".
- Do not merge classes merely because they belong to the same subject.
- Do not omit Sunday or Saturday classes.
- Do not create entries for days/classes that are not visible.

Return ONLY valid JSON.
Do not include markdown.
Do not include \`\`\`json.
Do not include explanations before or after the JSON.

Use exactly this structure:

{
  "subjects": [
    {
      "name": "Subject Name",
      "schedules": [
        {
          "day": "Monday",
          "classTimes": [
            {
              "startTime": "08:30 AM",
              "endTime": "09:20 AM",
              "roomNumber": "GU_AI-522"
            }
          ]
        }
      ]
    }
  ]
}

Before returning the JSON, internally verify:
1. Every visible class has been included.
2. No class has been duplicated.
3. PP and PR have not been combined.
4. Subject names exactly match the image.
5. Days are correct.
6. Start and end times are correct.
7. Room numbers are correct when visible.
8. The output is valid JSON that can be parsed directly by a JavaScript JSON parser.

Return ONLY the final JSON.`;