use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

/// Zeitstempel der state.json, wie WIR sie zuletzt gelesen/geschrieben haben.
/// Weicht die Datei auf der Platte davon ab, hat jemand anderes geschrieben
/// (z. B. anderes Gerät via iCloud) → Konflikt statt stillem Überschreiben.
struct StateTracker(Mutex<Option<SystemTime>>);

/// Dateien, die aufs Dock-Icon gezogen wurden, bis das Frontend sie abholt.
struct PendingFiles(Mutex<Vec<String>>);

fn home_dir() -> Option<PathBuf> {
  std::env::var_os("HOME").map(PathBuf::from)
}

/// App-Ordner im iCloud Drive, falls iCloud Drive auf diesem Mac aktiv ist
fn icloud_dir() -> Option<PathBuf> {
  let base = home_dir()?.join("Library/Mobile Documents/com~apple~CloudDocs");
  if base.is_dir() { Some(base.join("Finanzplanung")) } else { None }
}

/// Bisheriger lokaler Ort: ~/Library/Application Support/Finanzplanung
fn local_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  let base = app.path().data_dir().map_err(|e| e.to_string())?;
  Ok(base.join("Finanzplanung"))
}

/// Aktiver Datenordner: iCloud Drive, sonst lokal (Fallback ohne iCloud)
fn state_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  match icloud_dir() {
    Some(d) => Ok(d),
    None => local_dir(app),
  }
}

fn state_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  Ok(state_dir(app)?.join("state.json"))
}

fn file_mtime(p: &PathBuf) -> Option<SystemTime> {
  fs::metadata(p).ok().and_then(|m| m.modified().ok())
}

fn now_secs() -> u64 {
  SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/* ================= Pfad-basierte Kernfunktionen =================
   Bewusst ohne Tauri-Typen, damit sie in `cargo test` ohne laufende
   App getestet werden können. Die #[tauri::command]-Hüllen darunter
   reichen nur AppHandle/Tracker durch. */

/// Crash-sicher schreiben: Temp-Datei, fsync, atomar umbenennen.
/// `crash_before_rename` simuliert in Tests einen Absturz mitten im
/// Speichern — die alte Datei muss dann unangetastet bleiben.
fn write_atomic_steps(dir: &PathBuf, file: &PathBuf, json: &str, crash_before_rename: bool) -> Result<(), String> {
  fs::create_dir_all(dir).map_err(|e| e.to_string())?;
  let tmp = dir.join("state.json.tmp");
  fs::write(&tmp, json.as_bytes()).map_err(|e| e.to_string())?;
  let f = fs::File::open(&tmp).map_err(|e| e.to_string())?;
  f.sync_all().map_err(|e| e.to_string())?;
  if crash_before_rename {
    return Err("simulierter Absturz vor dem Umbenennen".into());
  }
  fs::rename(&tmp, file).map_err(|e| e.to_string())
}

fn write_atomic(dir: &PathBuf, file: &PathBuf, json: &str) -> Result<(), String> {
  write_atomic_steps(dir, file, json, false)
}

/// Liest die Zustandsdatei. None = existiert noch nicht (Erststart).
fn read_state_at(file: &PathBuf) -> Result<Option<String>, String> {
  if !file.exists() {
    return Ok(None);
  }
  fs::read_to_string(file).map(Some).map_err(|e| e.to_string())
}

/// Bibliothekar-Check: hat jemand anderes geschrieben, seit wir zuletzt
/// gelesen/geschrieben haben?
fn is_conflict(seen: Option<SystemTime>, on_disk: Option<SystemTime>) -> bool {
  match (seen, on_disk) {
    (Some(s), Some(c)) => c != s,
    (None, Some(_)) => true, // wir kannten keine Datei, plötzlich liegt eine da
    _ => false,
  }
}

/// Unlesbare state.json beiseitelegen statt überschreiben (kein Datenverlust).
fn rescue_at(dir: &PathBuf, ts: u64) -> Result<Option<PathBuf>, String> {
  let file = dir.join("state.json");
  if !file.exists() {
    return Ok(None);
  }
  let backup = dir.join(format!("state.json.defekt-{}", ts));
  fs::rename(&file, &backup).map_err(|e| e.to_string())?;
  Ok(Some(backup))
}

/// Konflikt-Lösung A: meine Version gilt, der fremde Stand wird als Kopie gesichert.
fn resolve_keep_mine_at(dir: &PathBuf, json: &str, ts: u64) -> Result<PathBuf, String> {
  let file = dir.join("state.json");
  let backup = dir.join(format!("state.json.konflikt-anderes-geraet-{}.json", ts));
  if file.exists() {
    fs::rename(&file, &backup).map_err(|e| e.to_string())?;
  }
  write_atomic(dir, &file, json)?;
  Ok(backup)
}

/// Konflikt-Lösung B: fremden Stand übernehmen, meine Sitzung als Kopie sichern.
/// Gibt (fremder Inhalt, Pfad meiner Sicherung) zurück.
fn resolve_take_theirs_at(dir: &PathBuf, json: &str, ts: u64) -> Result<(String, PathBuf), String> {
  let file = dir.join("state.json");
  let backup = dir.join(format!("state.json.konflikt-diese-sitzung-{}.json", ts));
  fs::write(&backup, json.as_bytes()).map_err(|e| e.to_string())?;
  let content = fs::read_to_string(&file).map_err(|e| e.to_string())?;
  Ok((content, backup))
}

/// Touch-ID-Helfer im Entwicklungs-Checkout
fn dev_helper_path() -> PathBuf {
  PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("bin/touchid-helper")
}

/// Einmalige Migration: lokale state.json in den iCloud-Ordner kopieren.
/// Das Original bleibt (umbenannt) als Sicherung liegen.
fn migrate_to_icloud(app: &tauri::AppHandle) {
  let Some(ic_dir) = icloud_dir() else { return };
  let ic = ic_dir.join("state.json");
  let Ok(old_dir) = local_dir(app) else { return };
  let old = old_dir.join("state.json");
  if ic.exists() || !old.exists() {
    return;
  }
  if fs::create_dir_all(&ic_dir).is_ok() && fs::copy(&old, &ic).is_ok() {
    let _ = fs::rename(&old, old_dir.join("state.json.migriert-nach-icloud"));
    log::info!("state.json nach iCloud Drive migriert: {}", ic.display());
  }
}

/* ================= Tauri-Befehle ================= */

/// Liest state.json. None = Datei existiert noch nicht (Erststart).
#[tauri::command]
fn load_state(app: tauri::AppHandle, tracker: tauri::State<StateTracker>) -> Result<Option<String>, String> {
  let file = state_file(&app)?;
  let content = read_state_at(&file)?;
  *tracker.0.lock().unwrap() = if content.is_some() { file_mtime(&file) } else { None };
  Ok(content)
}

/// Speichert — aber nur, wenn die Datei seit unserem letzten Stand unverändert ist.
/// Gibt "conflict" zurück, wenn jemand anderes (anderes Gerät) geschrieben hat.
#[tauri::command]
fn save_state(app: tauri::AppHandle, tracker: tauri::State<StateTracker>, json: String) -> Result<String, String> {
  let dir = state_dir(&app)?;
  let file = dir.join("state.json");
  let seen = *tracker.0.lock().unwrap();
  if is_conflict(seen, file_mtime(&file)) {
    return Ok("conflict".into());
  }
  write_atomic(&dir, &file, &json)?;
  *tracker.0.lock().unwrap() = file_mtime(&file);
  Ok("ok".into())
}

#[tauri::command]
fn resolve_conflict_keep_mine(app: tauri::AppHandle, tracker: tauri::State<StateTracker>, json: String) -> Result<String, String> {
  let dir = state_dir(&app)?;
  let backup = resolve_keep_mine_at(&dir, &json, now_secs())?;
  *tracker.0.lock().unwrap() = file_mtime(&dir.join("state.json"));
  Ok(backup.to_string_lossy().into_owned())
}

#[tauri::command]
fn resolve_conflict_take_theirs(app: tauri::AppHandle, tracker: tauri::State<StateTracker>, json: String) -> Result<String, String> {
  let dir = state_dir(&app)?;
  let (content, _backup) = resolve_take_theirs_at(&dir, &json, now_secs())?;
  *tracker.0.lock().unwrap() = file_mtime(&dir.join("state.json"));
  Ok(content)
}

/// Rettet eine unlesbare state.json unter neuem Namen, statt sie zu überschreiben.
#[tauri::command]
fn rescue_state(app: tauri::AppHandle) -> Result<Option<String>, String> {
  let dir = state_dir(&app)?;
  Ok(rescue_at(&dir, now_secs())?.map(|p| p.to_string_lossy().into_owned()))
}

/// Wo liegt die Zustandsdatei? (für die Anzeige unter „Backup & Einstellungen“)
#[tauri::command]
fn state_location(app: tauri::AppHandle) -> Result<String, String> {
  Ok(state_file(&app)?.to_string_lossy().into_owned())
}

/// Aufs Dock-Icon gezogene Dateien abholen (leert den Puffer).
#[tauri::command]
fn take_pending_open_files(pending: tauri::State<PendingFiles>) -> Vec<String> {
  std::mem::take(&mut *pending.0.lock().unwrap())
}

/// Rohbytes einer Datei (für CSV-Import mit Encoding-Erkennung im Frontend).
#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
  fs::read(&path).map_err(|e| e.to_string())
}

/// Touch-ID/Passwort-Abfrage über den mitgelieferten Swift-Helfer.
/// true = entsperrt, false = abgebrochen/fehlgeschlagen, Err = nicht verfügbar.
#[tauri::command]
async fn authenticate(app: tauri::AppHandle) -> Result<bool, String> {
  let mut helper = dev_helper_path();
  if !helper.exists() {
    if let Ok(rd) = app.path().resource_dir() {
      helper = rd.join("bin/touchid-helper");
    }
  }
  if !helper.exists() {
    return Err("Touch-ID-Helfer nicht gefunden".into());
  }
  let status = std::process::Command::new(&helper).status().map_err(|e| e.to_string())?;
  match status.code() {
    Some(0) => Ok(true),
    Some(1) => Ok(false),
    _ => Err("Touch ID nicht verfügbar".into()),
  }
}

/// „Sichern unter“-Dialog + Datei schreiben (Backup- und CSV-Export).
/// None = Nutzer hat abgebrochen. Async, damit der blockierende Dialog
/// nicht auf dem Main-Thread läuft.
#[tauri::command]
async fn save_file_dialog(
  app: tauri::AppHandle,
  contents: String,
  default_name: String,
) -> Result<Option<String>, String> {
  let ext = std::path::Path::new(&default_name)
    .extension()
    .and_then(|e| e.to_str())
    .unwrap_or("json")
    .to_string();
  let picked = app
    .dialog()
    .file()
    .add_filter(ext.to_uppercase(), &[&ext])
    .set_file_name(&default_name)
    .blocking_save_file();
  match picked {
    None => Ok(None),
    Some(fp) => {
      let path = fp.into_path().map_err(|e| e.to_string())?;
      fs::write(&path, contents.as_bytes()).map_err(|e| e.to_string())?;
      Ok(Some(path.to_string_lossy().into_owned()))
    }
  }
}

/// „Öffnen“-Dialog für den Backup-Import; liefert den Dateiinhalt.
/// None = Nutzer hat abgebrochen.
#[tauri::command]
async fn pick_backup(app: tauri::AppHandle) -> Result<Option<String>, String> {
  let picked = app
    .dialog()
    .file()
    .add_filter("JSON", &["json"])
    .blocking_pick_file();
  match picked {
    None => Ok(None),
    Some(fp) => {
      let path = fp.into_path().map_err(|e| e.to_string())?;
      fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
    }
  }
}

/// Die 9 Sidebar-Bereiche in Sidebar-Reihenfolge (⌘1–⌘9), IDs wie in ui-core.js
const VIEWS: [(&str, &str); 9] = [
  ("dashboard", "Dashboard"),
  ("monat", "Monat"),
  ("import", "CSV-Import"),
  ("posten", "Posten & Kategorien"),
  ("fi", "FI-Planung"),
  ("hauskauf", "Hauskauf"),
  ("hochzeit", "Hochzeit"),
  ("kinder", "Kinder"),
  ("backup", "Backup & Einstellungen"),
];

/// Natives Menüband. Eigene Einträge melden sich per Event "menu" im Frontend,
/// vordefinierte (Beenden, Kopieren, …) erledigt macOS selbst.
fn build_menu(app: &tauri::App) -> tauri::Result<()> {
  let h = app.handle();

  let about = AboutMetadata {
    name: Some("Finanzplanung".into()),
    version: Some("0.1.0".into()),
    comments: Some("Finanz-Cockpit — FI-Planung, Budget & Szenarien".into()),
    ..Default::default()
  };
  let app_sub = SubmenuBuilder::new(h, "Finanzplanung")
    .item(&PredefinedMenuItem::about(h, Some("Über Finanzplanung"), Some(about))?)
    .separator()
    .item(&PredefinedMenuItem::hide(h, Some("Finanzplanung ausblenden"))?)
    .item(&PredefinedMenuItem::hide_others(h, Some("Andere ausblenden"))?)
    .separator()
    .item(&PredefinedMenuItem::quit(h, Some("Finanzplanung beenden"))?)
    .build()?;

  let datei = SubmenuBuilder::new(h, "Datei")
    .item(&MenuItemBuilder::with_id("csv-import", "CSV importieren…")
      .accelerator("CmdOrCtrl+I").build(h)?)
    .separator()
    .item(&MenuItemBuilder::with_id("backup-export", "Backup exportieren…")
      .accelerator("CmdOrCtrl+S").build(h)?)
    .item(&MenuItemBuilder::with_id("backup-import", "Backup importieren…")
      .accelerator("CmdOrCtrl+Shift+O").build(h)?)
    .build()?;

  // Ohne eigenes Bearbeiten-Menü gäbe es in der App kein ⌘C/⌘V/⌘X mehr
  let bearbeiten = SubmenuBuilder::new(h, "Bearbeiten")
    .item(&PredefinedMenuItem::undo(h, Some("Widerrufen"))?)
    .item(&PredefinedMenuItem::redo(h, Some("Wiederholen"))?)
    .separator()
    .item(&PredefinedMenuItem::cut(h, Some("Ausschneiden"))?)
    .item(&PredefinedMenuItem::copy(h, Some("Kopieren"))?)
    .item(&PredefinedMenuItem::paste(h, Some("Einsetzen"))?)
    .item(&PredefinedMenuItem::select_all(h, Some("Alles auswählen"))?)
    .build()?;

  let mut ansicht_b = SubmenuBuilder::new(h, "Ansicht");
  for (i, (id, label)) in VIEWS.iter().enumerate() {
    ansicht_b = ansicht_b.item(
      &MenuItemBuilder::with_id(format!("view:{}", id), *label)
        .accelerator(format!("CmdOrCtrl+{}", i + 1))
        .build(h)?,
    );
  }
  let ansicht = ansicht_b.build()?;

  let fenster = SubmenuBuilder::new(h, "Fenster")
    .item(&PredefinedMenuItem::minimize(h, Some("Im Dock ablegen"))?)
    .item(&PredefinedMenuItem::fullscreen(h, Some("Vollbild ein/aus"))?)
    .build()?;

  let menu = MenuBuilder::new(h)
    .items(&[&app_sub, &datei, &bearbeiten, &ansicht, &fenster])
    .build()?;
  app.set_menu(menu)?;

  app.on_menu_event(|app, event| {
    let id = event.id().as_ref();
    if id == "csv-import" || id == "backup-export" || id == "backup-import" || id.starts_with("view:") {
      let _ = app.emit("menu", id.to_string());
    }
  });
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .manage(StateTracker(Mutex::new(None)))
    .manage(PendingFiles(Mutex::new(Vec::new())))
    .invoke_handler(tauri::generate_handler![
      load_state,
      save_state,
      rescue_state,
      resolve_conflict_keep_mine,
      resolve_conflict_take_theirs,
      state_location,
      take_pending_open_files,
      read_file_bytes,
      authenticate,
      save_file_dialog,
      pick_backup
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      migrate_to_icloud(app.handle());
      build_menu(app)?;
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application");

  app.run(|app_handle, event| {
    // macOS: Datei aufs Dock-Icon gezogen (oder „Öffnen mit“) → puffern,
    // Fenster nach vorn holen und das Frontend anstupsen.
    if let tauri::RunEvent::Opened { urls } = event {
      let paths: Vec<String> = urls
        .iter()
        .filter_map(|u| u.to_file_path().ok())
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
      if paths.is_empty() {
        return;
      }
      app_handle.state::<PendingFiles>().0.lock().unwrap().extend(paths);
      if let Some(win) = app_handle.get_webview_window("main") {
        let _ = win.set_focus();
      }
      let _ = app_handle.emit("open-files", ());
    }
  });
}

/* ================= Tests (cargo test) ================= */
#[cfg(test)]
mod tests {
  use super::*;
  use std::sync::atomic::{AtomicUsize, Ordering};

  static N: AtomicUsize = AtomicUsize::new(0);
  fn tmp_dir() -> PathBuf {
    let d = std::env::temp_dir().join(format!(
      "fipla-rust-test-{}-{}",
      std::process::id(),
      N.fetch_add(1, Ordering::SeqCst)
    ));
    fs::create_dir_all(&d).unwrap();
    d
  }
  fn state_path(dir: &PathBuf) -> PathBuf {
    dir.join("state.json")
  }
  fn find_with_prefix(dir: &PathBuf, prefix: &str) -> Vec<PathBuf> {
    fs::read_dir(dir)
      .unwrap()
      .filter_map(|e| e.ok())
      .map(|e| e.path())
      .filter(|p| p.file_name().unwrap().to_string_lossy().starts_with(prefix))
      .collect()
  }

  #[test]
  fn save_schreibt_und_hinterlaesst_keine_tempdatei() {
    let dir = tmp_dir();
    let file = state_path(&dir);
    write_atomic(&dir, &file, "{\"a\":1}").unwrap();
    assert_eq!(fs::read_to_string(&file).unwrap(), "{\"a\":1}");
    assert!(!dir.join("state.json.tmp").exists(), "Temp-Datei muss nach dem Umbenennen weg sein");
    write_atomic(&dir, &file, "{\"a\":2}").unwrap();
    assert_eq!(fs::read_to_string(&file).unwrap(), "{\"a\":2}");
  }

  #[test]
  fn absturz_mitten_im_schreiben_laesst_alte_datei_intakt() {
    let dir = tmp_dir();
    let file = state_path(&dir);
    write_atomic(&dir, &file, "ALTER STAND").unwrap();
    // Absturz zwischen Temp-Schreiben und Umbenennen simulieren:
    let res = write_atomic_steps(&dir, &file, "NEUER STAND", true);
    assert!(res.is_err(), "simulierter Absturz muss als Fehler enden");
    assert_eq!(
      fs::read_to_string(&file).unwrap(),
      "ALTER STAND",
      "die alte Datei darf bei einem Absturz vor dem Umbenennen nicht angerührt sein"
    );
    // und der neue Stand lag zu dem Zeitpunkt NUR in der Temp-Datei:
    assert_eq!(fs::read_to_string(dir.join("state.json.tmp")).unwrap(), "NEUER STAND");
  }

  #[test]
  fn load_liest_gueltige_datei_und_none_bei_erststart() {
    let dir = tmp_dir();
    let file = state_path(&dir);
    assert_eq!(read_state_at(&file).unwrap(), None, "fehlende Datei = Erststart = None");
    write_atomic(&dir, &file, "{\"tx\":243}").unwrap();
    assert_eq!(read_state_at(&file).unwrap(), Some("{\"tx\":243}".into()));
  }

  #[test]
  fn kaputte_datei_wird_beiseitegelegt_ohne_datenverlust() {
    let dir = tmp_dir();
    let file = state_path(&dir);
    fs::write(&file, "kaputt{{{nicht-json").unwrap();
    let backup = rescue_at(&dir, 12345).unwrap().expect("Sicherung muss angelegt werden");
    assert!(!file.exists(), "state.json muss beiseitegelegt sein");
    assert_eq!(
      fs::read_to_string(&backup).unwrap(),
      "kaputt{{{nicht-json",
      "die Original-Bytes müssen vollständig erhalten bleiben"
    );
    assert!(backup.file_name().unwrap().to_string_lossy().starts_with("state.json.defekt-"));
    // ohne Datei ist rescue ein No-Op:
    assert_eq!(rescue_at(&dir, 12346).unwrap(), None);
  }

  #[test]
  fn konflikt_erkennung_bibliothekar_check() {
    let t1 = SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(100);
    let t2 = SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(200);
    assert!(!is_conflict(Some(t1), Some(t1)), "unveränderte Datei = kein Konflikt");
    assert!(is_conflict(Some(t1), Some(t2)), "fremder Schreibzugriff = Konflikt");
    assert!(is_conflict(None, Some(t1)), "Datei aufgetaucht, die wir nie sahen = Konflikt");
    assert!(!is_conflict(Some(t1), None), "Datei weg (z. B. gerettet) = kein Konflikt, neu schreiben ok");
    assert!(!is_conflict(None, None), "Erststart = kein Konflikt");
  }

  #[test]
  fn keep_mine_sichert_fremden_stand_als_kopie() {
    let dir = tmp_dir();
    let file = state_path(&dir);
    write_atomic(&dir, &file, "FREMDER STAND").unwrap();
    let backup = resolve_keep_mine_at(&dir, "MEIN STAND", 777).unwrap();
    assert_eq!(fs::read_to_string(&file).unwrap(), "MEIN STAND", "meine Version muss gelten");
    assert_eq!(
      fs::read_to_string(&backup).unwrap(),
      "FREMDER STAND",
      "der fremde Stand darf nicht verworfen werden"
    );
    assert_eq!(find_with_prefix(&dir, "state.json.konflikt-anderes-geraet-").len(), 1);
  }

  #[test]
  fn take_theirs_sichert_meine_sitzung_als_kopie() {
    let dir = tmp_dir();
    let file = state_path(&dir);
    write_atomic(&dir, &file, "FREMDER STAND").unwrap();
    let (content, backup) = resolve_take_theirs_at(&dir, "MEIN STAND", 888).unwrap();
    assert_eq!(content, "FREMDER STAND", "der fremde Stand muss zurückgegeben werden");
    assert_eq!(fs::read_to_string(&file).unwrap(), "FREMDER STAND", "die Datei bleibt der fremde Stand");
    assert_eq!(
      fs::read_to_string(&backup).unwrap(),
      "MEIN STAND",
      "meine Sitzung darf nicht verworfen werden"
    );
    assert_eq!(find_with_prefix(&dir, "state.json.konflikt-diese-sitzung-").len(), 1);
  }

  #[test]
  fn touchid_helfer_liegt_bereit_und_ist_ausfuehrbar() {
    // `authenticate` selbst öffnet eine macOS-Systemabfrage und ist daher
    // nicht headless testbar — geprüft wird die Helfer-Auflösung.
    use std::os::unix::fs::PermissionsExt;
    let p = dev_helper_path();
    assert!(p.exists(), "src-tauri/bin/touchid-helper fehlt (swiftc-Build, siehe helper/touchid.swift)");
    let mode = fs::metadata(&p).unwrap().permissions().mode();
    assert!(mode & 0o111 != 0, "Helfer ist nicht ausführbar");
  }
}
