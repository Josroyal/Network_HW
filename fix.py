import os

files = ['static/js/panels.js', 'static/js/controls.js']

for f in files:
    try:
        with open(f, 'r', encoding='utf-8') as file:
            content = file.read()
        
        # Also fix \${} and \` if any
        content = content.replace(r'\${', '${')
        
        with open(f, 'w', encoding='utf-8') as file:
            file.write(content)
        print(f"Fixed {f}")
    except Exception as e:
        print(f"Error {f}: {e}")
