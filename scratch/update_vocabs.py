import json
import re

with open('js/vocabs.js', 'r') as f:
    content = f.read()

match = re.search(r'const VOCABULARY = (\[.*?\]);', content, re.DOTALL)
if not match:
    print("Could not find VOCABULARY")
    exit(1)

vocab = json.loads(match.group(1))

page_map = {
    'out and about': 256,
    'pavement': 257,
    'not ... yet': 257,
    'description': 258,
    'glass': 259,
    'outside the shop': 260,
    'honestly': 261
}

current_page = 256
for item in vocab:
    eng = item['english']
    if eng in page_map:
        current_page = page_map[eng]
    item['unit'] = 'Unit 4'
    item['part'] = None
    item['page'] = current_page

new_content = 'const VOCABULARY = ' + json.dumps(vocab, indent=2, ensure_ascii=False) + ';\n'
with open('js/vocabs.js', 'w') as f:
    f.write(new_content)

print("vocabs.js updated successfully!")
