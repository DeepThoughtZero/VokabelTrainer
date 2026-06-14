import json
import re

vocabs = [
    {"english": "awesome", "german": "klasse, großartig", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "class", "german": "die (Schul-)Klasse", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "Let me show you ...", "german": "Lass mich dir ... zeigen.", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "me", "german": "mich; mir", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "(to) show", "german": "zeigen", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "our", "german": "unser/e", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "classroom", "german": "das Klassenzimmer", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "we", "german": "wir", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "family", "german": "die Familie", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "Let us sing.", "german": "Lass(t) uns singen.", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "us", "german": "uns", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "blazer", "german": "der Blazer, die Sportjacke", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "tie", "german": "der Schlips, die Krawatte", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "thing", "german": "die Sache, das Ding", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "(to) know", "german": "wissen", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "Thanks. (auch: Thank you.)", "german": "Danke.", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "with", "german": "mit, bei", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "dot", "german": "der Punkt, das Pünktchen", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "double", "german": "Doppel-", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "(to) sit", "german": "sitzen; sich setzen", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "together", "german": "zusammen", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "Mr", "german": "Herr", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "Mrs", "german": "Frau", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "(to) teach", "german": "unterrichten", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "art", "german": "die Kunst", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "history", "german": "die Geschichte", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "class teacher", "german": "Klassenlehrer/in", "unit": "Unit 1", "part": "Welcome", "page": 228},
    {"english": "poem", "german": "das Gedicht", "unit": "Unit 1", "part": "Welcome", "page": 228}
]

js_str = ""
for v in vocabs:
    js_str += f"  {{ \"english\": \"{v['english']}\", \"german\": \"{v['german']}\", \"unit\": \"{v['unit']}\", \"part\": \"{v['part']}\", \"page\": {v['page']} }},\n"

with open("js/vocabs.js", "r") as f:
    content = f.read()

match = re.search(r'(?m)^.*"english": "uniform".*$', content)
if match:
    insert_pos = match.end() + 1
    new_content = content[:insert_pos] + js_str + content[insert_pos:]
    with open("js/vocabs.js", "w") as f:
        f.write(new_content)
    print("Appended image 4 vocabs successfully.")
else:
    print("Could not find 'uniform' to insert after.")
