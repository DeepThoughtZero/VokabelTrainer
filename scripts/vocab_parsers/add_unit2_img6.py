import json
import re

vocabs = [
    {"english": "against", "german": "gegen", "unit": "Unit 2", "part": "Part B", "page": 245},
    {"english": "(to) buy", "german": "kaufen", "unit": "Unit 2", "part": "Part B", "page": 245},
    {"english": "(to) give", "german": "geben", "unit": "Unit 2", "part": "Part B", "page": 245},
    {"english": "information (about/on) (no pl)", "german": "die Information(en) (über)", "unit": "Unit 2", "part": "Part B", "page": 245},
    {"english": "concert", "german": "das Konzert", "unit": "Unit 2", "part": "Part B", "page": 245},
    {"english": "exam", "german": "die Prüfung", "unit": "Unit 2", "part": "Part B", "page": 245},
    {"english": "loud", "german": "laut", "unit": "Unit 2", "part": "Part B", "page": 245},
    {"english": "I'm finished.", "german": "Ich bin fertig.", "unit": "Unit 2", "part": "Part B", "page": 245},
    {"english": "polite", "german": "höflich", "unit": "Unit 2", "part": "Part B", "page": 245},
    {"english": "scene", "german": "die Szene", "unit": "Unit 2", "part": "Part B", "page": 245},
    {"english": "salad", "german": "der Salat (als Gericht oder Beilage)", "unit": "Unit 2", "part": "Part C", "page": 245},
    {"english": "those ...", "german": "die ... dort; jene ...", "unit": "Unit 2", "part": "Part C", "page": 245},
    {"english": "over", "german": "über", "unit": "Unit 2", "part": "Part C", "page": 245},
    {"english": "over there", "german": "da drüben, dort drüben", "unit": "Unit 2", "part": "Part C", "page": 245},
    {"english": "huge", "german": "riesig", "unit": "Unit 2", "part": "Part C", "page": 245},
    {"english": "cook", "german": "der Koch, die Köchin", "unit": "Unit 2", "part": "Part C", "page": 245},
    {"english": "him", "german": "ihn; ihm", "unit": "Unit 2", "part": "Part C", "page": 245},
    {"english": "me", "german": "mich, mir", "unit": "Unit 2", "part": "Part C", "page": 245},
    {"english": "you", "german": "dich/euch/Sie, dir/euch/Ihnen", "unit": "Unit 2", "part": "Part C", "page": 245},
    {"english": "her", "german": "sie, ihr", "unit": "Unit 2", "part": "Part C", "page": 245},
    {"english": "it", "german": "es, ihm", "unit": "Unit 2", "part": "Part C", "page": 245},
    {"english": "us", "german": "uns", "unit": "Unit 2", "part": "Part C", "page": 245},
    {"english": "them", "german": "sie, ihnen", "unit": "Unit 2", "part": "Part C", "page": 245}
]

js_str = ""
for v in vocabs:
    js_str += f"  {{ \"english\": \"{v['english']}\", \"german\": \"{v['german']}\", \"unit\": \"{v['unit']}\", \"part\": \"{v['part']}\", \"page\": {v['page']} }},\n"

with open("js/vocabs.js", "r") as f:
    content = f.read()

match = re.search(r'(?m)^.*"english": "part".*$', content)
if match:
    insert_pos = match.end() + 1
    new_content = content[:insert_pos] + js_str + content[insert_pos:]
    with open("js/vocabs.js", "w") as f:
        f.write(new_content)
    print("Appended image 6 vocabs successfully.")
else:
    print("Could not find 'part' to insert after.")
