import json
import re

vocabs = [
    {"english": "(to) happen (to)", "german": "geschehen, passieren (mit)", "unit": "Unit 2", "part": "Story", "page": 247},
    {"english": "interesting", "german": "interessant", "unit": "Unit 2", "part": "Story", "page": 247},
    {"english": "schoolbook", "german": "das Schulbuch", "unit": "Unit 2", "part": "Story", "page": 247},
    {"english": "Come on!", "german": "Na los! / Komm!", "unit": "Unit 2", "part": "Story", "page": 247},
    {"english": "crib sheet (infml)", "german": "der Spickzettel, der Merkzettel", "unit": "Unit 2", "part": "Story", "page": 247},
    {"english": "note", "german": "die Notiz, die Mitteilung", "unit": "Unit 2", "part": "Story", "page": 247},
    {"english": "(to) breathe in", "german": "einatmen", "unit": "Unit 2", "part": "Story", "page": 247},
    {"english": "(to) relax", "german": "sich entspannen, sich ausruhen", "unit": "Unit 2", "part": "Story", "page": 247},
    {"english": "(to) smile", "german": "lächeln", "unit": "Unit 2", "part": "Story", "page": 247},
    {"english": "slow", "german": "langsam", "unit": "Unit 2", "part": "Story", "page": 247},
    {"english": "fast", "german": "schnell", "unit": "Unit 2", "part": "Story", "page": 247},
    {"english": "in a clear voice", "german": "mit klarer Stimme", "unit": "Unit 2", "part": "Story", "page": 247},
    {"english": "(to) worry (about)", "german": "sich Sorgen machen (wegen, um)", "unit": "Unit 2", "part": "Story", "page": 247},
    {"english": "audience", "german": "das Publikum, Zuschauer/innen, Zuhörer/innen", "unit": "Unit 2", "part": "Story", "page": 247},
    {"english": "technique", "german": "die Technik, die Methode", "unit": "Unit 2", "part": "Story", "page": 247},
    {"english": "while", "german": "während", "unit": "Unit 2", "part": "Story", "page": 247},
    {"english": "(to) repeat", "german": "wiederholen", "unit": "Unit 2", "part": "Story", "page": 247},
    {"english": "tired", "german": "müde", "unit": "Unit 2", "part": "Story", "page": 247},
    {"english": "(to) stop", "german": "aufhören; anhalten", "unit": "Unit 2", "part": "Story", "page": 247},
    {"english": "dancer", "german": "Tänzer/in", "unit": "Unit 2", "part": "Story", "page": 247},
    {"english": "just then", "german": "genau in dem Moment; gerade dann", "unit": "Unit 2", "part": "Story", "page": 247},
    {"english": "(to) beep", "german": "piepen", "unit": "Unit 2", "part": "Story", "page": 247},
    {"english": "shy", "german": "schüchtern, scheu", "unit": "Unit 2", "part": "Story", "page": 247},
    {"english": "It isn't even real.", "german": "Es ist (noch) nicht einmal echt.", "unit": "Unit 2", "part": "Story", "page": 247},
    {"english": "real", "german": "echt, wirklich", "unit": "Unit 2", "part": "Story", "page": 247}
]

js_str = ""
for v in vocabs:
    js_str += f"  {{ \"english\": \"{v['english']}\", \"german\": \"{v['german']}\", \"unit\": \"{v['unit']}\", \"part\": \"{v['part']}\", \"page\": {v['page']} }},\n"

with open("js/vocabs.js", "r") as f:
    content = f.read()

match = re.search(r'(?m)^.*"english": "fifth".*$', content)
if match:
    insert_pos = match.end() + 1
    new_content = content[:insert_pos] + js_str + content[insert_pos:]
    with open("js/vocabs.js", "w") as f:
        f.write(new_content)
    print("Appended image 8 vocabs successfully.")
else:
    print("Could not find 'fifth' to insert after.")
