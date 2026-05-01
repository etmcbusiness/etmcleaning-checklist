# Sounds

Place audio files here using **exactly** these filenames. The app will play them
automatically — you don't need to change any code.

Recommended format: `.mp3` (best browser support). Keep them short (under ~3
seconds) and reasonably small.

| File                      | When it plays                                                     |
| ------------------------- | ----------------------------------------------------------------- |
| `task.mp3`                | Any time an individual task checkbox is checked                   |
| `milestone-25.mp3`        | First time progress hits 25% (banner: "Nice! 25% Done!")          |
| `milestone-50.mp3`        | First time progress hits 50% (banner: "Half Way There!")          |
| `milestone-75.mp3`        | First time progress hits 75% (banner: "Almost Done!")             |
| `milestone-100.mp3`       | First time progress hits 100% (banner: "Done!")                   |

## Notes

- Filenames are case-sensitive.
- If a file is missing, that particular sound is silently skipped — the rest
  of the app keeps working.
- Each milestone fires only once per cleaning session. Resetting the checklist
  (or completing it) re-arms them.
- After dropping the files in, also add them to `PRECACHE_URLS` in `sw.js` if
  you want them to be available offline. (Optional.)
