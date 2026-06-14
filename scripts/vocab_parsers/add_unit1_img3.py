import json
import re

vocabs = [
    {"english": "ball", "german": "der Ball", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "balloon", "german": "der Luftballon", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "bee", "german": "die Biene", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "bike", "german": "das Fahrrad", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "dog", "german": "der Hund", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "grass", "german": "das Gras; der Rasen", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "flower", "german": "die Blume; die Blüte", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "sandwich", "german": "das Sandwich, (zusammengeklapptes) belegtes Brot", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "tree", "german": "der Baum", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "something", "german": "etwas", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "blue", "german": "blau", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "No, that's wrong.", "german": "Nein, das ist falsch. / Nein, das stimmt nicht.", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "Yes, that's right.", "german": "Ja, das ist richtig. / Ja, das stimmt.", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "now", "german": "nun, jetzt", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "(It's) your turn.", "german": "Du bist dran / an der Reihe.", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "your", "german": "dein/e; euer/eure; Ihr/e", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "(to) spell", "german": "buchstabieren", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "spelling", "german": "die Rechtschreibung", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "colour", "german": "die Farbe", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "red", "german": "rot", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "yellow", "german": "gelb", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "green", "german": "grün", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "brown", "german": "braun", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "orange", "german": "orange", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "grey", "german": "grau", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "pink", "german": "pink, rosa", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "purple", "german": "violett, lila", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "white", "german": "weiß", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "black", "german": "schwarz", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "(to) find", "german": "finden", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "banana", "german": "die Banane", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "(to) have", "german": "haben", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "wrong", "german": "falsch, verkehrt", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "school", "german": "die Schule", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "new", "german": "neu", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "at", "german": "(in Ortsangaben) an, bei, in", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "year", "german": "der Jahrgang (die Jahrgangsstufe)", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "please", "german": "bitte", "unit": "Unit 1", "part": "Welcome", "page": 227},
    {"english": "uniform", "german": "die (Schul-)Uniform", "unit": "Unit 1", "part": "Welcome", "page": 227}
]

js_str = ""
for v in vocabs:
    js_str += f"  {{ \"english\": \"{v['english']}\", \"german\": \"{v['german']}\", \"unit\": \"{v['unit']}\", \"part\": \"{v['part']}\", \"page\": {v['page']} }},\n"

with open("js/vocabs.js", "r") as f:
    content = f.read()

match = re.search(r'(?m)^.*"english": "bag".*$', content)
if match:
    insert_pos = match.end() + 1
    new_content = content[:insert_pos] + js_str + content[insert_pos:]
    with open("js/vocabs.js", "w") as f:
        f.write(new_content)
    print("Appended image 3 vocabs successfully.")
else:
    print("Could not find 'bag' to insert after.")
