import json
import re

vocabs = [
    {"english": "cool", "german": "cool", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "big", "german": "groß", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "small", "german": "klein", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "great", "german": "großartig", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "hot", "german": "heiß", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "cold", "german": "kalt", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "Nice to meet you.", "german": "Freut mich, dich/euch/Sie kennenzulernen.", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "How old are you?", "german": "Wie alt bist du?", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "Are you ...?", "german": "Bist du ...?", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "Where are you from?", "german": "Woher kommst du?", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "where?", "german": "wo? woher? wohin?", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "hometown", "german": "die Heimatstadt", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "town", "german": "die Stadt", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "Hello.", "german": "Hallo. / Guten Tag.", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "today", "german": "heute", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "How are you?", "german": "Wie geht's? / Wie geht es dir/euch/Ihnen?", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "I'm fine(, thanks).", "german": "Gut(, danke).", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "(to) live", "german": "wohnen; leben", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "can", "german": "können", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "(to) fly", "german": "fliegen", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "a tour of Brighton", "german": "ein Rundgang/eine Rundfahrt/eine Reise durch Brighton", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "Germany", "german": "Deutschland", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "Bye. (auch: Goodbye.)", "german": "Tschüs. / Auf Wiedersehen.", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "garden", "german": "der Garten", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "palace", "german": "der Palast, das Schloss", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "the gardens are great", "german": "die Gärten sind großartig", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "park", "german": "der Park", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "game", "german": "das Spiel", "unit": "Unit 1", "part": "Welcome", "page": 226},
    {"english": "bag", "german": "die Tasche, der Beutel, die Tüte", "unit": "Unit 1", "part": "Welcome", "page": 226}
]

js_str = ""
for v in vocabs:
    js_str += f"  {{ \"english\": \"{v['english']}\", \"german\": \"{v['german']}\", \"unit\": \"{v['unit']}\", \"part\": \"{v['part']}\", \"page\": {v['page']} }},\n"

with open("js/vocabs.js", "r") as f:
    content = f.read()

match = re.search(r'(?m)^.*"english": "nice".*$', content)
if match:
    insert_pos = match.end() + 1
    new_content = content[:insert_pos] + js_str + content[insert_pos:]
    with open("js/vocabs.js", "w") as f:
        f.write(new_content)
    print("Appended image 2 vocabs successfully.")
else:
    print("Could not find 'nice' to insert after.")
