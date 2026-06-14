import json
import re

vocabs = [
    {"english": "pet", "german": "das Haustier", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "cute", "german": "niedlich, süß", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "scary", "german": "unheimlich, gruselig", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "boring", "german": "langweilig", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "budgie", "german": "der Wellensittich", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "cat", "german": "die Katze", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "fish", "german": "der Fisch", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "guinea pig", "german": "das Meerschweinchen", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "parrot", "german": "der Papagei", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "rabbit", "german": "das Kaninchen", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "rat", "german": "die Ratte", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "snake", "german": "die Schlange", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "spider", "german": "die Spinne", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "hamster", "german": "der Hamster", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "under", "german": "unter", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "I don't like ...", "german": "Ich mag ... nicht. / Ich mag kein/keine/keinen ...", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "more", "german": "mehr", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "animal", "german": "das Tier", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "hobby", "german": "das Hobby", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "football", "german": "der Fußball", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "(to) run", "german": "rennen, laufen", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "music", "german": "die Musik", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "(to) swim", "german": "schwimmen", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "(to) dance", "german": "tanzen", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "what", "german": "was", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "What about you?", "german": "Und du? / Und was ist mit dir? / Und ihr? / Und was ist mit euch?", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "if", "german": "wenn, falls", "unit": "Unit 1", "part": "Welcome", "page": 230},
    {"english": "(to) need", "german": "brauchen, benötigen", "unit": "Unit 1", "part": "Welcome", "page": 230}
]

js_str = ""
for v in vocabs:
    js_str += f"  {{ \"english\": \"{v['english']}\", \"german\": \"{v['german']}\", \"unit\": \"{v['unit']}\", \"part\": \"{v['part']}\", \"page\": {v['page']} }},\n"

with open("js/vocabs.js", "r") as f:
    content = f.read()

match = re.search(r'(?m)^.*"english": "world".*$', content)
if match:
    insert_pos = match.end() + 1
    new_content = content[:insert_pos] + js_str + content[insert_pos:]
    with open("js/vocabs.js", "w") as f:
        f.write(new_content)
    print("Appended image 6 vocabs successfully.")
else:
    print("Could not find 'world' to insert after.")
