import re
import json

with open('unit1_docx.txt', 'r') as f:
    lines = f.readlines()

vocabs = []
current_page = None
current_part = "Welcome" # Defaults to Welcome if no Part is found before first vocab

for line in lines:
    line = line.strip()
    if not line:
        continue
    
    if line.startswith("Seite "):
        # Extract page number
        m = re.search(r'Seite (\d+)', line)
        if m:
            current_page = int(m.group(1))
    elif line.startswith("Part ") or line == "Story":
        current_part = line.split(" ")[0] + " " + line.split(" ")[1] if line.startswith("Part ") else line
    elif " – " in line or " - " in line:
        # It's a vocab
        parts = re.split(r' – | - ', line, 1)
        if len(parts) == 2:
            english = parts[0].strip()
            german = parts[1].strip()
            
            # Fix up german part if there are obvious example sentences without formatting?
            # It's fine to just keep it as is.
            
            if current_page is not None:
                vocabs.append({
                    "english": english,
                    "german": german,
                    "unit": "Unit 1",
                    "part": current_part,
                    "page": current_page
                })

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
    print(f"Appended {len(vocabs)} docx vocabs successfully.")
else:
    print("Could not find 'world' to insert after.")
