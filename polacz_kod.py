import os

# Konfiguracja
source_path = r"C:\Users\DELL\Documents\GitHub\redaktor-saf"
output_path = r"C:\Users\DELL\Downloads\polaczony_kod.txt"
# Rozszerzenia, które chcesz dołączyć
extensions = {'.html', '.css', '.js', '.php', '.json', '.md', '.ts', '.jsx'}
# Foldery do całkowitego pominięcia
exclude_dirs = {'node_modules', '.git', '.vscode', '__pycache__'}

def merge_code():
    with open(output_path, 'w', encoding='utf-8') as outfile:
        for root, dirs, files in os.walk(source_path):
            # Pomijanie folderów z listy exclude_dirs
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            
            for file in files:
                if any(file.endswith(ext) for ext in extensions):
                    file_path = os.path.join(root, file)
                    
                    try:
                        with open(file_path, 'r', encoding='utf-8') as infile:
                            outfile.write(f"\n{'='*20}\n")
                            outfile.write(f"PLIK: {file_path}\n")
                            outfile.write(f"{'='*20}\n\n")
                            outfile.write(infile.read())
                            outfile.write("\n")
                    except Exception as e:
                        print(f"Nie udało się odczytać pliku {file_path}: {e}")

    print(f"Gotowe! Kod został zapisany w: {output_path}")

if __name__ == "__main__":
    merge_code()