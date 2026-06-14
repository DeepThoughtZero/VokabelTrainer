import json
import re

vocabs = [
    {"english": "exciting", "german": "aufregend, spannend", "unit": "Unit 2", "part": "Part C", "page": 246},
    {"english": "(to) beam", "german": "projizieren", "unit": "Unit 2", "part": "Part C", "page": 246},
    {"english": "when?", "german": "wann?", "unit": "Unit 2", "part": "Part C", "page": 246},
    {"english": "creepy", "german": "gruselig", "unit": "Unit 2", "part": "Part C", "page": 246},
    {"english": "weekend", "german": "das Wochenende", "unit": "Unit 2", "part": "Part C", "page": 246},
    {"english": "ice cream", "german": "das (Speise-)Eis", "unit": "Unit 2", "part": "Part C", "page": 246},
    {"english": "little", "german": "klein", "unit": "Unit 2", "part": "Part C", "page": 246},
    {"english": "baby", "german": "das Baby", "unit": "Unit 2", "part": "Part C", "page": 246},
    {"english": "calendar", "german": "der Kalender", "unit": "Unit 2", "part": "Story", "page": 246},
    {"english": "month", "german": "der Monat", "unit": "Unit 2", "part": "Story", "page": 246},
    {"english": "January", "german": "Januar", "unit": "Unit 2", "part": "Story", "page": 246},
    {"english": "February", "german": "Februar", "unit": "Unit 2", "part": "Story", "page": 246},
    {"english": "March", "german": "März", "unit": "Unit 2", "part": "Story", "page": 246},
    {"english": "April", "german": "April", "unit": "Unit 2", "part": "Story", "page": 246},
    {"english": "May", "german": "Mai", "unit": "Unit 2", "part": "Story", "page": 246},
    {"english": "June", "german": "Juni", "unit": "Unit 2", "part": "Story", "page": 246},
    {"english": "July", "german": "Juli", "unit": "Unit 2", "part": "Story", "page": 246},
    {"english": "August", "german": "August", "unit": "Unit 2", "part": "Story", "page": 246},
    {"english": "September", "german": "September", "unit": "Unit 2", "part": "Story", "page": 246},
    {"english": "October", "german": "Oktober", "unit": "Unit 2", "part": "Story", "page": 246},
    {"english": "November", "german": "November", "unit": "Unit 2", "part": "Story", "page": 246},
    {"english": "December", "german": "Dezember", "unit": "Unit 2", "part": "Story", "page": 246},
    {"english": "winter", "german": "Winter", "unit": "Unit 2", "part": "Story", "page": 246},
    {"english": "spring", "german": "Frühling", "unit": "Unit 2", "part": "Story", "page": 246},
    {"english": "summer", "german": "Sommer", "unit": "Unit 2", "part": "Story", "page": 246},
    {"english": "autumn", "german": "Herbst", "unit": "Unit 2", "part": "Story", "page": 246},
    {"english": "term", "german": "das Trimester", "unit": "Unit 2", "part": "Story", "page": 246},
    {"english": "date", "german": "das Datum", "unit": "Unit 2", "part": "Story", "page": 246},
    {"english": "event", "german": "das Ereignis", "unit": "Unit 2", "part": "Story", "page": 246},
    {"english": "holidays (pl)", "german": "Ferien (pl)", "unit": "Unit 2", "part": "Story", "page": 246},
    {"english": "end", "german": "das Ende, der Schluss", "unit": "Unit 2", "part": "Story", "page": 246},
    {"english": "first", "german": "erste(r, s)", "unit": "Unit 2", "part": "Story", "page": 246},
    {"english": "third", "german": "dritte(r, s)", "unit": "Unit 2", "part": "Story", "page": 246},
    {"english": "fourth", "german": "vierte(r, s)", "unit": "Unit 2", "part": "Story", "page": 246},
    {"english": "fifth", "german": "fünfte(r, s)", "unit": "Unit 2", "part": "Story", "page": 246}
]

js_str = ""
for v in vocabs:
    js_str += f"  {{ \"english\": \"{v['english']}\", \"german\": \"{v['german']}\", \"unit\": \"{v['unit']}\", \"part\": \"{v['part']}\", \"page\": {v['page']} }},\n"

with open("js/vocabs.js", "r") as f:
    content = f.read()

match = re.search(r'(?m)^.*"english": "them".*$', content)
if match:
    insert_pos = match.end() + 1
    new_content = content[:insert_pos] + js_str + content[insert_pos:]
    with open("js/vocabs.js", "w") as f:
        f.write(new_content)
    print("Appended image 7 vocabs successfully.")
else:
    print("Could not find 'them' to insert after.")
