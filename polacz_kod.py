import os

# Konfiguracja
SOURCE_PATH = r"C:\Users\DELL\Documents\GitHub\redaktor-saf"
OUTPUT_PATH = r"C:\Users\DELL\Downloads\polaczony_kod_redaktor-saf.txt"

# Nazwy folderów do całkowitego pominięcia
EXCLUDE_DIRS = {
    '__pycache__', '.git', 'node_modules', '.idea', '.vscode', 'vendor'
}

# Pełne ścieżki do konkretnych plików, które mają być całkowicie zignorowane
EXCLUDE_FILE_PATHS = {
    r"C:\Users\DELL\Documents\GitHub\redaktor-saf\polacz_kod.py",
}

# Rozszerzenia plików binarnych/niepotrzebnych, których NIE chcemy scalać ani czytać
EXCLUDE_EXTS = {
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp', # Grafika
    '.mp4', '.mp3', '.wav',                                   # Multimedia
    '.zip', '.tar', '.gz', '.rar', '.7z',                     # Archiwa
    '.pdf', '.doc', '.docx',                                  # Dokumenty binarne
    '.exe', '.dll', '.so', '.dylib',                          # Pliki wykonywalne/binaria
    '.woff', '.woff2', '.eot', '.ttf'                         # Fonty
}

def generate_tree(dir_path, prefix=""):
    """Generuje strukturę katalogów i plików w postaci drzewa tekstowego."""
    tree_str = ""
    try:
        # Pobieramy zawartość i sortujemy (najpierw foldery, potem pliki)
        entries = sorted(os.listdir(dir_path), key=lambda x: (not os.path.isdir(os.path.join(dir_path, x)), x.lower()))
    except Exception as e:
        return f"{prefix}[Błąd dostępu do folderu: {e}]\n"

    # Filtrujemy foldery
    entries = [e for e in entries if e not in EXCLUDE_DIRS]
    
    # Filtrujemy konkretne pliki na podstawie ich pełnej ścieżki
    filtered_entries = []
    for entry in entries:
        full_path = os.path.join(dir_path, entry)
        if os.path.isfile(full_path) and full_path in EXCLUDE_FILE_PATHS:
            continue
        filtered_entries.append(entry)

    for i, entry in enumerate(filtered_entries):
        path = os.path.join(dir_path, entry)
        is_last = (i == len(filtered_entries) - 1)
        connector = "└── " if is_last else "├── "
        
        # Dodajemy element do drzewa
        tree_str += f"{prefix}{connector}{entry}\n"
        
        # Jeśli to folder, wchodzimy głębiej rekurencyjnie
        if os.path.isdir(path):
            next_prefix = prefix + ("    " if is_last else "│   ")
            tree_str += generate_tree(path, next_prefix)
            
    return tree_str

def merge_code():
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as outfile:
        # 1. Nagłówek i generowanie struktury na samej górze
        outfile.write(f"{'='*40}\n")
        outfile.write(f" STRUKTURA PROJEKTU: {SOURCE_PATH}\n")
        outfile.write(f"{'='*40}\n\n")
        
        project_tree = generate_tree(SOURCE_PATH)
        outfile.write(project_tree)
        outfile.write(f"\n\n{'='*40}\n")
        outfile.write(" ZAWARTOŚĆ PLIKÓW\n")
        outfile.write(f"{'='*40}\n")

        # 2. Iteracja po plikach i scalanie kodu
        for root, dirs, files in os.walk(SOURCE_PATH):
            # Pomijanie folderów w os.walk modyfikując dirs na miejscu
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            
            for file in files:
                file_path = os.path.join(root, file)
                
                # Pomijamy, jeśli plik jest na liście wykluczonych ścieżek
                if file_path in EXCLUDE_FILE_PATHS:
                    continue
                
                _, ext = os.path.splitext(file)
                # Pomijamy tylko jeśli rozszerzenie jest na czarnej liście
                if ext.lower() in EXCLUDE_EXTS:
                    continue
                                    
                try:
                    with open(file_path, 'r', encoding='utf-8') as infile:
                        # Wypisujemy separator i ścieżkę pliku
                        outfile.write(f"\n{'='*20}\n")
                        outfile.write(f"PLIK: {file_path}\n")
                        outfile.write(f"{'='*20}\n\n")
                        
                        # Zapisujemy zawartość
                        outfile.write(infile.read())
                        outfile.write("\n")
                except UnicodeDecodeError:
                    # Na wypadek plików binarnych
                    print(f"Pominięto (prawdopodobnie plik binarny): {file_path}")
                except Exception as e:
                    print(f"Nie udało się odczytać pliku {file_path}: {e}")

    print(f"Gotowe! Kod i struktura zostały zapisane w: {OUTPUT_PATH}")

if __name__ == "__main__":
    merge_code()