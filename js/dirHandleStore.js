// Zapamiętuje uchwyt do ostatnio wybranego folderu (File System Access API) w IndexedDB,
// żeby przy kolejnej wizycie użytkownik mógł zapisać zdjęcia w "tym samym miejscu co ostatnio"
// bez ponownego przechodzenia przez okno wyboru folderu. localStorage tu nie wystarczy -
// FileSystemDirectoryHandle nie da się zserializować do stringa, ale JEST poprawnie
// klonowalny strukturalnie przez IndexedDB.
const DB_NAME = 'saf-redaktor-fs';
const STORE_NAME = 'handles';
const KEY = 'lastDirectory';

function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function getRememberedHandle() {
    try {
        const db = await openDb();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get(KEY);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    } catch {
        return null; // brak IndexedDB albo inny problem ze storage - po prostu nic nie pamiętamy
    }
}

export async function rememberHandle(handle) {
    try {
        const db = await openDb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(handle, KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch {
        // Nieudane zapamiętanie nie jest krytyczne - po prostu przy następnej wizycie
        // użytkownik znów wybierze folder ręcznie.
    }
}

// Uchwyty do folderów tracą czasem uprawnienia między wizytami (polityka bezpieczeństwa
// przeglądarki) - trzeba je zweryfikować i ewentualnie poprosić o nie ponownie.
export async function verifyPermission(handle, mode = 'readwrite') {
    const opts = { mode };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if ((await handle.requestPermission(opts)) === 'granted') return true;
    return false;
}
