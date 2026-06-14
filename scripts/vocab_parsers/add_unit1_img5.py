import json
import re

vocabs = [
    {"english": "day", "german": "der Tag", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "The days of the week", "german": "Die Wochentage", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "Monday", "german": "Montag", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "Tuesday", "german": "Dienstag", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "Wednesday", "german": "Mittwoch", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "Thursday", "german": "Donnerstag", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "Friday", "german": "Freitag", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "Saturday", "german": "Samstag, Sonnabend", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "Sunday", "german": "Sonntag", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "book", "german": "das Buch; das Heft", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "song", "german": "das Lied, der Song", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "(to) go", "german": "gehen", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "(to) speak", "german": "sprechen", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "French", "german": "Französisch", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "(to) read", "german": "lesen", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "(to) watch", "german": "sich einen Film anschauen", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "but", "german": "aber", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "I don't have ...", "german": "Ich habe kein/keine/keinen ...", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "so", "german": "so cool/heiß/...", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "board", "german": "die (Wand-)Tafel", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "chair", "german": "der Stuhl", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "desk", "german": "der Schreibtisch", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "exercise book", "german": "das Schulheft, das Übungsheft", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "pencil case", "german": "das Federmäppchen", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "glue stick", "german": "der Klebestift", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "pencil", "german": "der Bleistift", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "schoolbag", "german": "die Schultasche", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "student", "german": "Schüler/in; Student/in", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "marker", "german": "der Textmarker", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "sharpener", "german": "der Anspitzer", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "pen", "german": "der Kugelschreiber, der Stift, der Füller", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "rubber", "german": "der/das Radiergummi", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "ruler", "german": "das Lineal", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "no ...", "german": "kein ..., keine ...", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "problem", "german": "das Problem", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "Here you are.", "german": "Hier, bitte.", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "Simon says ...", "german": "Simon sagt ...", "unit": "Unit 1", "part": "Welcome", "page": 229},
    {"english": "world", "german": "die Welt", "unit": "Unit 1", "part": "Welcome", "page": 229}
]

js_str = ""
for v in vocabs:
    js_str += f"  {{ \"english\": \"{v['english']}\", \"german\": \"{v['german']}\", \"unit\": \"{v['unit']}\", \"part\": \"{v['part']}\", \"page\": {v['page']} }},\n"

with open("js/vocabs.js", "r") as f:
    content = f.read()

match = re.search(r'(?m)^.*"english": "poem".*$', content)
if match:
    insert_pos = match.end() + 1
    new_content = content[:insert_pos] + js_str + content[insert_pos:]
    with open("js/vocabs.js", "w") as f:
        f.write(new_content)
    print("Appended image 5 vocabs successfully.")
else:
    print("Could not find 'poem' to insert after.")
