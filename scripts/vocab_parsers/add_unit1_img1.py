import json
import re

vocabs = [
    {"english": "Welcome to Brighton.", "german": "Willkommen in Brighton.", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "My name is Alice.", "german": "Ich heiße Alice. (wörtlich: Mein Name ist Alice.)", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "I'm from Brighton.", "german": "Ich bin aus Brighton. / Ich komme aus Brighton.", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "I'm eleven years old.", "german": "Ich bin elf Jahre alt.", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "one", "german": "eins", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "two", "german": "zwei", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "three", "german": "drei", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "four", "german": "vier", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "five", "german": "fünf", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "six", "german": "sechs", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "seven", "german": "sieben", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "eight", "german": "acht", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "nine", "german": "neun", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "ten", "german": "zehn", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "eleven", "german": "elf", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "twelve", "german": "zwölf", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "city", "german": "eine Stadt, eine Großstadt", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "in England", "german": "in England", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "my friend", "german": "mein Freund / meine Freundin", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "too", "german": "auch", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "by the sea", "german": "am Meer", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "the", "german": "der, die, das; die", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "sea", "german": "das Meer", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "boy", "german": "der Junge", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "girl", "german": "das Mädchen", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "beach", "german": "der Strand", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "sand", "german": "der Sand", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "seagull", "german": "die Möwe", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "sky", "german": "der Himmel", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "stone", "german": "der Stein", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "(to) see", "german": "sehen; besuchen", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "(to) like", "german": "mögen", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "picture", "german": "das Bild", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "(to) think", "german": "denken, glauben; meinen", "unit": "Unit 1", "part": "Welcome", "page": 225},
    {"english": "nice", "german": "nett, schön", "unit": "Unit 1", "part": "Welcome", "page": 225}
]

js_str = ""
for v in vocabs:
    js_str += f"  {{ \"english\": \"{v['english']}\", \"german\": \"{v['german']}\", \"unit\": \"{v['unit']}\", \"part\": \"{v['part']}\", \"page\": {v['page']} }},\n"

with open("js/vocabs.js", "r") as f:
    content = f.read()

# Insert before the first item of Unit 2 or at the beginning of the array.
# Wait, Unit 2 starts with `{"english": "I'm", ... "page": 240}`
# Let's insert at the beginning of the VOCABULARY array, since it's Unit 1.
match = re.search(r'const VOCABULARY = \[', content)
if match:
    insert_pos = match.end() + 1
    new_content = content[:insert_pos] + js_str + content[insert_pos:]
    with open("js/vocabs.js", "w") as f:
        f.write(new_content)
    print("Appended image 1 vocabs successfully.")
else:
    print("Could not find 'const VOCABULARY = [' to insert after.")
