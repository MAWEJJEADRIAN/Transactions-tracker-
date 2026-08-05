# data/

This folder is where backup files exported from the app (Report tab →
Backup → Export Backup) naturally land if you save them into the project
directory — for example while testing locally.

It's empty by default. Nothing in the app writes here automatically; all
real data lives in the browser's IndexedDB on the device the app is
running on. This folder is just a convenient, git-ignored place to keep
exported `.json` backups if you want them alongside the project rather
than in your regular Downloads folder.

`.gitignore` excludes `*.json` files in this folder specifically so a
teller's real transaction data never accidentally ends up committed to
source control.
