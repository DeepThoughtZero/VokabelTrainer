import zipfile
import xml.etree.ElementTree as ET

def extract_text_from_docx(docx_path):
    with zipfile.ZipFile(docx_path) as docx:
        tree = ET.XML(docx.read('word/document.xml'))
        namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        text = []
        for p in tree.findall('.//w:p', namespaces):
            para_text = ""
            for t in p.findall('.//w:t', namespaces):
                para_text += t.text
            if para_text.strip():
                text.append(para_text.strip())
        return "\n".join(text)

text = extract_text_from_docx('pictures/Englisch_Klasse5/Unit1/David_Englisch_Klasse5_Unit1.docx')

with open('unit1_docx.txt', 'w') as f:
    f.write(text)
