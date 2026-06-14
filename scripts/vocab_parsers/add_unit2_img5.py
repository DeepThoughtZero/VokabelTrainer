import json
import re

vocabs = [
    {"english": "page", "german": "die Seite", "unit": "Unit 2", "part": "Part A", "page": 244},
    {"english": "context", "german": "der (Text-, Satz-)Zusammenhang, der Kontext", "unit": "Unit 2", "part": "Part A", "page": 244},
    {"english": "Excuse me.", "german": "Entschuldigung. / Entschuldigen Sie.", "unit": "Unit 2", "part": "Part B", "page": 244},
    {"english": "next week", "german": "nächste Woche", "unit": "Unit 2", "part": "Part B", "page": 244},
    {"english": "these ...", "german": "diese ..., die ... (hier)", "unit": "Unit 2", "part": "Part B", "page": 244},
    {"english": "classmate", "german": "Mitschüler/in, Klassenkamerad/in", "unit": "Unit 2", "part": "Part B", "page": 244},
    {"english": "a kind of ...", "german": "eine Art (von) ...", "unit": "Unit 2", "part": "Part B", "page": 244},
    {"english": "fact", "german": "die Tatsache, der Fakt", "unit": "Unit 2", "part": "Part B", "page": 244},
    {"english": "clear", "german": "klar, deutlich", "unit": "Unit 2", "part": "Part B", "page": 244},
    {"english": "(to) guess", "german": "raten, erraten", "unit": "Unit 2", "part": "Part B", "page": 244},
    {"english": "different (from)", "german": "verschieden; anders (als)", "unit": "Unit 2", "part": "Part B", "page": 244},
    {"english": "second", "german": "zweite(r, s)", "unit": "Unit 2", "part": "Part B", "page": 244},
    {"english": "apple", "german": "der Apfel", "unit": "Unit 2", "part": "Part B", "page": 244},
    {"english": "café", "german": "das Café", "unit": "Unit 2", "part": "Part B", "page": 244},
    {"english": "(to) shout", "german": "schreien, rufen", "unit": "Unit 2", "part": "Part B", "page": 244},
    {"english": "(to) put your hand up", "german": "sich melden", "unit": "Unit 2", "part": "Part B", "page": 244},
    {"english": "Which sentence?", "german": "Welcher Satz?", "unit": "Unit 2", "part": "Part B", "page": 244},
    {"english": "he doesn't have a café", "german": "er hat kein Café", "unit": "Unit 2", "part": "Part B", "page": 244},
    {"english": "(to) get up", "german": "aufstehen", "unit": "Unit 2", "part": "Part B", "page": 244},
    {"english": "(to) hurt", "german": "verletzen", "unit": "Unit 2", "part": "Part B", "page": 244},
    {"english": "them", "german": "sie; ihnen", "unit": "Unit 2", "part": "Part B", "page": 244},
    {"english": "activity", "german": "die Aktivität", "unit": "Unit 2", "part": "Part B", "page": 244},
    {"english": "percent (%)", "german": "das Prozent", "unit": "Unit 2", "part": "Part B", "page": 244},
    {"english": "full", "german": "voll", "unit": "Unit 2", "part": "Part B", "page": 244},
    {"english": "part", "german": "der Teil", "unit": "Unit 2", "part": "Part B", "page": 244}
]

js_str = ""
for v in vocabs:
    js_str += f"  {{ \"english\": \"{v['english']}\", \"german\": \"{v['german']}\", \"unit\": \"{v['unit']}\", \"part\": \"{v['part']}\", \"page\": {v['page']} }},\n"

with open("js/vocabs.js", "r") as f:
    content = f.read()

# find where Unit 2 Part A ends (the last inserted item was '(to) try')
# we will insert after '(to) try' to keep order.
# Actually I can just insert at the top again, but let's insert after '(to) try'
match = re.search(r'(?m)^.*"english": "\(to\) try".*$', content)
if match:
    insert_pos = match.end() + 1
    new_content = content[:insert_pos] + js_str + content[insert_pos:]
    with open("js/vocabs.js", "w") as f:
        f.write(new_content)
    print("Appended image 5 vocabs successfully.")
else:
    print("Could not find '(to) try' to insert after.")
