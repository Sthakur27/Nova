//! Cheap, nonrecursive snapshots of only open notes and visible directories.
use crate::{err, root_path, Access};
use serde::Serialize;
use std::{
    fs,
    path::{Component, Path},
};
use tauri::State;

#[derive(Serialize)]
pub(crate) struct Stamp {
    path: String,
    stamp: Option<String>,
    error: Option<String>,
}
fn stamp(root: &Path, relative: &str) -> Result<Option<String>, String> {
    let relative = Path::new(relative);
    if relative.is_absolute()
        || relative
            .components()
            .any(|p| matches!(p, Component::ParentDir | Component::Prefix(_)))
    {
        return Err("Choose a path inside the open folder.".into());
    }
    let path = match fs::canonicalize(root.join(relative)) {
        Ok(path) => path,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(err(e)),
    };
    if !path.starts_with(root) {
        return Err("Choose a path inside the open folder.".into());
    }
    let metadata = fs::metadata(path).map_err(err)?;
    if !metadata.is_file() && !metadata.is_dir() {
        return Err("Unsupported file type.".into());
    }
    let mut value = format!(
        "{}:{:?}:{:?}",
        metadata.len(),
        metadata.modified().map_err(err)?,
        metadata.created().ok()
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        value.push_str(&format!(
            ":{}:{}:{}",
            metadata.ino(),
            metadata.ctime(),
            metadata.ctime_nsec()
        ));
    }
    Ok(Some(value))
}
#[tauri::command]
pub(crate) async fn local_path_stamps(
    root: String,
    paths: Vec<String>,
    access: State<'_, Access>,
) -> Result<Vec<Stamp>, String> {
    let root = root_path(&access, &root)?;
    if paths.len() > 4096 {
        return Err("Too many paths to monitor at once.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        paths
            .into_iter()
            .map(|path| match stamp(&root, &path) {
                Ok(stamp) => Stamp {
                    path,
                    stamp,
                    error: None,
                },
                Err(error) => Stamp {
                    path,
                    stamp: None,
                    error: Some(error),
                },
            })
            .collect()
    })
    .await
    .map_err(err)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn detects_rewrites_replacement_deletion_and_directory_changes() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let file = root.join("note.md");
        fs::write(&file, "one").unwrap();
        let before = stamp(&root, "note.md").unwrap();
        // Metadata is an optimization, not a content revision: rapid same-size
        // writes can retain identical timestamps (notably on Windows).
        // Native events and focus reconciliation force a content revision read.
        fs::write(&file, "two, changed length").unwrap();
        assert_ne!(before, stamp(&root, "note.md").unwrap());
        let before = stamp(&root, "note.md").unwrap();
        fs::write(root.join("swap"), "new").unwrap();
        fs::rename(root.join("swap"), &file).unwrap();
        assert_ne!(before, stamp(&root, "note.md").unwrap());
        assert!(stamp(&root, "").unwrap().is_some());
        fs::remove_file(&file).unwrap();
        assert_eq!(stamp(&root, "note.md").unwrap(), None);
        let child = root.join("child");
        fs::create_dir(&child).unwrap();
        assert!(stamp(&root, "child").unwrap().is_some());
        fs::remove_dir(child).unwrap();
        assert_eq!(stamp(&root, "child").unwrap(), None);
        assert!(stamp(&root, "../escape").is_err());
    }
    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("note.md"), "private").unwrap();
        std::os::unix::fs::symlink(outside.path(), dir.path().join("escape")).unwrap();
        assert!(stamp(&dir.path().canonicalize().unwrap(), "escape/note.md").is_err());
    }
}

#[cfg(desktop)]
pub(crate) mod native_watch {
    use super::*;
    use notify::event::ModifyKind;
    use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
    use serde::Deserialize;
    use std::{
        collections::{BTreeMap, BTreeSet, HashMap},
        path::PathBuf,
        sync::{
            atomic::{AtomicBool, Ordering},
            mpsc::{self, Receiver, SyncSender, TrySendError},
            Arc, Mutex,
        },
        thread::{self, JoinHandle},
        time::{Duration, Instant},
    };
    use tauri::{Emitter, Manager, WebviewWindow};

    const QUEUE_SIZE: usize = 256;
    const QUIET: Duration = Duration::from_millis(200);
    const MAX_BATCH: Duration = Duration::from_millis(500);
    #[derive(Clone, Deserialize)]
    pub(crate) struct Target {
        root: String,
        files: Vec<String>,
        directories: Vec<String>,
    }
    #[derive(Clone)]
    struct Plan {
        root: String,
        canonical: PathBuf,
        files: BTreeMap<PathBuf, String>,
        directories: BTreeMap<PathBuf, String>,
    }
    #[derive(Clone, Serialize, Debug, PartialEq)]
    pub(crate) struct Change {
        root: String,
        files: Vec<String>,
        directories: Vec<String>,
    }
    #[derive(Clone, Serialize, Debug)]
    pub(crate) struct Batch {
        generation: String,
        changes: Vec<Change>,
        rescan: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    }
    #[derive(Serialize)]
    pub(crate) struct WatchResult {
        warnings: Vec<String>,
    }
    fn excluded(path: &Path) -> bool {
        path.components().any(|c| {
            matches!(
                c.as_os_str().to_str(),
                Some(".git" | "node_modules" | "target" | ".nova-registry-backups")
            )
        })
    }
    // Validate missing paths too, without following a symlink beyond the workspace.
    fn safe_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
        let relative = Path::new(relative);
        if relative.is_absolute()
            || relative
                .components()
                .any(|p| matches!(p, Component::ParentDir | Component::Prefix(_)))
        {
            return Err("Cannot monitor this path inside the Local folder.".into());
        }
        let path = root.join(relative);
        let mut existing = path.as_path();
        loop {
            match fs::symlink_metadata(existing) {
                Ok(_) => {
                    let canonical = fs::canonicalize(existing).map_err(err)?;
                    if !canonical.starts_with(root) || canonical != existing {
                        return Err("Cannot monitor symlink paths.".into());
                    }
                    return Ok(path);
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    existing = existing.parent().ok_or("Cannot resolve monitored path.")?
                }
                Err(e) => return Err(err(e)),
            }
        }
    }
    fn plan(target: Target, canonical: PathBuf) -> Result<Plan, String> {
        let mut files = BTreeMap::new();
        let mut directories = BTreeMap::new();
        for file in target.files {
            files.insert(safe_path(&canonical, &file)?, file);
        }
        for directory in target.directories {
            if !excluded(Path::new(&directory)) {
                directories.insert(safe_path(&canonical, &directory)?, directory);
            }
        }
        Ok(Plan {
            root: target.root,
            canonical,
            files,
            directories,
        })
    }
    fn registrations(plans: &[Plan]) -> BTreeSet<PathBuf> {
        let mut paths = BTreeSet::new();
        for plan in plans {
            paths.insert(plan.canonical.clone());
            if let Some(parent) = plan.canonical.parent() {
                paths.insert(parent.to_path_buf());
            }
            for directory in plan
                .directories
                .keys()
                .map(PathBuf::as_path)
                .chain(plan.files.keys().filter_map(|file| file.parent()))
            {
                for ancestor in directory
                    .ancestors()
                    .take_while(|ancestor| ancestor.starts_with(&plan.canonical))
                {
                    paths.insert(ancestor.to_path_buf());
                }
            }
        }
        paths
    }
    #[derive(Default)]
    struct Pending {
        changes: BTreeMap<String, (BTreeSet<String>, BTreeSet<String>)>,
        rescan: bool,
        error: Option<String>,
    }
    impl Pending {
        fn event(&mut self, event: Event, plans: &[Plan]) {
            if event.need_rescan() {
                self.rescan = true;
            }
            if matches!(event.kind, EventKind::Access(_)) {
                return;
            }
            let structural = matches!(
                event.kind,
                EventKind::Create(_)
                    | EventKind::Remove(_)
                    | EventKind::Modify(ModifyKind::Name(_))
                    | EventKind::Any
                    | EventKind::Other
            );
            for plan in plans {
                for path in &event.paths {
                    let Ok(relative) = path.strip_prefix(&plan.canonical) else {
                        continue;
                    };
                    let changed = self.changes.entry(plan.root.clone()).or_default();
                    // An explicitly opened ordinary file remains observable even in a generated/hidden tree.
                    if let Some(file) = plan.files.get(path) {
                        changed.0.insert(file.clone());
                    }
                    if structural {
                        for (file, relative) in &plan.files {
                            if file != path && file.starts_with(path) {
                                changed.0.insert(relative.clone());
                                self.rescan = true;
                            }
                        }
                        for (directory, relative) in &plan.directories {
                            if directory.starts_with(path) {
                                changed.1.insert(relative.clone());
                                self.rescan = true;
                            }
                        }
                    }
                    if excluded(relative) {
                        continue;
                    }
                    if structural {
                        if path == &plan.canonical {
                            changed.0.extend(plan.files.values().cloned());
                            changed.1.extend(plan.directories.values().cloned());
                            self.rescan = true;
                        }
                        if let Some(directory) = path
                            .parent()
                            .and_then(|parent| plan.directories.get(parent))
                        {
                            changed.1.insert(directory.clone());
                        }
                        if let Some(directory) = plan.directories.get(path) {
                            changed.1.insert(directory.clone());
                        }
                        // A removed/renamed directory invalidates open descendants as well.
                        for (file, relative) in &plan.files {
                            if file.starts_with(path) {
                                changed.0.insert(relative.clone());
                            }
                        }
                    }
                }
            }
        }
        fn batch(self, generation: &str) -> Option<Batch> {
            let changes: Vec<_> = self
                .changes
                .into_iter()
                .filter(|(_, (files, dirs))| !files.is_empty() || !dirs.is_empty())
                .map(|(root, (files, directories))| Change {
                    root,
                    files: files.into_iter().collect(),
                    directories: directories.into_iter().collect(),
                })
                .collect();
            if changes.is_empty() && !self.rescan && self.error.is_none() {
                return None;
            }
            Some(Batch {
                generation: generation.into(),
                changes,
                rescan: self.rescan,
                error: self.error,
            })
        }
    }
    enum Message {
        Event(notify::Result<Event>),
        Stop,
    }
    fn enqueue(sender: &SyncSender<Message>, overflow: &AtomicBool, event: notify::Result<Event>) {
        if matches!(
            sender.try_send(Message::Event(event)),
            Err(TrySendError::Full(_))
        ) {
            overflow.store(true, Ordering::Release);
        }
    }
    fn worker(
        receiver: Receiver<Message>,
        plans: Vec<Plan>,
        generation: String,
        stopped: Arc<AtomicBool>,
        overflow: Arc<AtomicBool>,
        emit: impl Fn(Batch),
    ) {
        while let Ok(first) = receiver.recv() {
            if stopped.load(Ordering::Acquire) {
                break;
            }
            let mut pending = Pending::default();
            let deadline = Instant::now() + MAX_BATCH;
            let mut next = first;
            loop {
                match next {
                    Message::Stop => return,
                    Message::Event(Ok(event)) => pending.event(event, &plans),
                    Message::Event(Err(error)) => {
                        pending.rescan = true;
                        pending.error = Some(error.to_string());
                    }
                }
                if stopped.load(Ordering::Acquire) {
                    return;
                }
                let remaining = deadline.saturating_duration_since(Instant::now());
                if remaining.is_zero() {
                    break;
                }
                match receiver.recv_timeout(QUIET.min(remaining)) {
                    Ok(event) => next = event,
                    Err(mpsc::RecvTimeoutError::Timeout) => break,
                    Err(mpsc::RecvTimeoutError::Disconnected) => return,
                }
            }
            if overflow.swap(false, Ordering::AcqRel) {
                pending.rescan = true;
                pending.error =
                    Some("Filesystem event queue overflowed; refreshing watched paths.".into());
            }
            if !stopped.load(Ordering::Acquire) {
                if let Some(batch) = pending.batch(&generation) {
                    emit(batch);
                }
            }
        }
    }
    struct Subscription {
        generation: String,
        stopped: Arc<AtomicBool>,
        sender: SyncSender<Message>,
        watcher: Option<RecommendedWatcher>,
        worker: Option<JoinHandle<()>>,
    }
    impl Drop for Subscription {
        fn drop(&mut self) {
            self.stopped.store(true, Ordering::Release);
            self.watcher.take();
            let _ = self.sender.try_send(Message::Stop);
            if let Some(worker) = self.worker.take() {
                let _ = worker.join();
            }
        }
    }
    fn subscribe(
        plans: Vec<Plan>,
        generation: String,
        emit: impl Fn(Batch) + Send + 'static,
    ) -> Result<(Subscription, Vec<String>), String> {
        let (sender, receiver) = mpsc::sync_channel(QUEUE_SIZE);
        let overflow = Arc::new(AtomicBool::new(false));
        let stopped = Arc::new(AtomicBool::new(false));
        let event_sender = sender.clone();
        let event_overflow = overflow.clone();
        let filter_plans = plans.clone();
        let mut watcher = notify::recommended_watcher(move |event: notify::Result<Event>| {
            if let Ok(ref event) = event {
                let mut pending = Pending::default();
                pending.event(event.clone(), &filter_plans);
                if pending.batch("").is_none() {
                    return;
                }
            }
            enqueue(&event_sender, &event_overflow, event);
        })
        .map_err(err)?;
        let mut warnings = Vec::new();
        for path in registrations(&plans) {
            if fs::canonicalize(&path).is_ok_and(|canonical| canonical != path) {
                warnings.push(format!(
                    "{}: symlink paths cannot be monitored",
                    path.display()
                ));
                continue;
            }
            if let Err(error) = watcher.watch(&path, RecursiveMode::NonRecursive) {
                warnings.push(format!("{}: {error}", path.display()));
            }
        }
        let worker_stop = stopped.clone();
        let worker_generation = generation.clone();
        let handle = thread::Builder::new()
            .name("nova-local-changes".into())
            .spawn(move || {
                worker(
                    receiver,
                    plans,
                    worker_generation,
                    worker_stop,
                    overflow,
                    emit,
                )
            })
            .map_err(err)?;
        Ok((
            Subscription {
                generation,
                stopped,
                sender,
                watcher: Some(watcher),
                worker: Some(handle),
            },
            warnings,
        ))
    }
    #[derive(Default)]
    pub(crate) struct LocalWatchers {
        subscriptions: Mutex<HashMap<String, Subscription>>,
        desired: Mutex<HashMap<String, String>>,
    }
    impl LocalWatchers {
        pub(crate) fn close_window(&self, label: &str) {
            if let Ok(mut desired) = self.desired.lock() {
                desired.remove(label);
                if let Ok(mut subscriptions) = self.subscriptions.lock() {
                    subscriptions.remove(label);
                }
            }
        }
        fn install(
            &self,
            label: &str,
            generation: &str,
            subscription: Subscription,
        ) -> Result<(), String> {
            let desired = self.desired.lock().map_err(err)?;
            if desired.get(label).is_some_and(|value| value == generation) {
                self.subscriptions
                    .lock()
                    .map_err(err)?
                    .insert(label.into(), subscription);
            }
            Ok(())
        }
        fn remove_generation(&self, label: &str, generation: &str) -> Result<(), String> {
            let mut desired = self.desired.lock().map_err(err)?;
            if desired.get(label).is_some_and(|value| value == generation) {
                desired.remove(label);
            }
            let mut subscriptions = self.subscriptions.lock().map_err(err)?;
            if subscriptions
                .get(label)
                .is_some_and(|s| s.generation == generation)
            {
                subscriptions.remove(label);
            }
            Ok(())
        }
    }
    #[tauri::command]
    pub(crate) async fn watch_local_changes(
        targets: Vec<Target>,
        generation: String,
        window: WebviewWindow,
        access: State<'_, Access>,
    ) -> Result<WatchResult, String> {
        if targets.len() > 100
            || targets
                .iter()
                .map(|t| t.files.len() + t.directories.len())
                .sum::<usize>()
                > 4096
        {
            return Err("Too many paths to monitor.".into());
        }
        window
            .state::<LocalWatchers>()
            .desired
            .lock()
            .map_err(err)?
            .insert(window.label().into(), generation.clone());
        let mut plans = Vec::new();
        for target in targets {
            let root = root_path(&access, &target.root)?;
            if crate::read_registry(&root)?
                .get("cloudSpace")
                .is_some_and(|v| v.is_object())
            {
                return Err("External file monitoring is only available for Local folders.".into());
            }
            plans.push(plan(target, root)?);
        }
        tauri::async_runtime::spawn_blocking(move || {
            let output = window.clone();
            let (subscription, warnings) = subscribe(plans, generation.clone(), move |batch| {
                let _ = output.emit("nova:local-changes", batch);
            })?;
            let state = window.state::<LocalWatchers>();
            state.install(window.label(), &generation, subscription)?;
            Ok(WatchResult { warnings })
        })
        .await
        .map_err(err)?
    }
    #[cfg(test)]
    mod watch_tests {
        use super::*;
        use notify::event::{AccessKind, CreateKind, DataChange, RemoveKind, RenameMode};
        fn fixture_plan(root: &Path) -> Plan {
            plan(
                Target {
                    root: root.to_string_lossy().into(),
                    files: vec!["open.md".into(), "expanded/nested.md".into()],
                    directories: vec!["".into(), "expanded".into()],
                },
                root.to_path_buf(),
            )
            .unwrap()
        }
        fn event(kind: EventKind, path: PathBuf) -> Event {
            Event::new(kind).add_path(path)
        }
        #[test]
        fn filters_unrelated_access_hidden_trees_and_coalesces_target_paths() {
            let dir = tempfile::tempdir().unwrap();
            let root = dir.path().canonicalize().unwrap();
            fs::create_dir(root.join("expanded")).unwrap();
            let plan = fixture_plan(&root);
            let mut pending = Pending::default();
            let explicit = super::plan(
                Target {
                    root: root.to_string_lossy().into(),
                    files: vec![".git/HEAD".into()],
                    directories: vec!["".into()],
                },
                root.clone(),
            )
            .unwrap();
            let mut explicit_changes = Pending::default();
            explicit_changes.event(
                event(
                    EventKind::Modify(ModifyKind::Data(DataChange::Any)),
                    root.join(".git/HEAD"),
                ),
                &[explicit],
            );
            assert_eq!(
                explicit_changes.batch("g").unwrap().changes[0].files,
                vec![".git/HEAD"]
            );
            for path in [
                "other.md",
                ".git/HEAD",
                "node_modules/new.md",
                "sibling/file.md",
            ] {
                pending.event(
                    event(
                        EventKind::Modify(ModifyKind::Data(DataChange::Any)),
                        root.join(path),
                    ),
                    &[plan.clone()],
                );
            }
            pending.event(
                event(EventKind::Access(AccessKind::Any), root.join("open.md")),
                &[plan.clone()],
            );
            assert!(pending.batch("g").is_none());
            let mut pending = Pending::default();
            for _ in 0..20 {
                pending.event(
                    event(
                        EventKind::Modify(ModifyKind::Data(DataChange::Any)),
                        root.join("open.md"),
                    ),
                    &[plan.clone()],
                );
            }
            pending.event(
                event(
                    EventKind::Create(CreateKind::File),
                    root.join("expanded/new.md"),
                ),
                &[plan.clone()],
            );
            let batch = pending.batch("g").unwrap();
            assert_eq!(batch.changes[0].files, vec!["open.md"]);
            assert_eq!(batch.changes[0].directories, vec!["expanded"]);
            let mut pending = Pending::default();
            pending.event(
                event(
                    EventKind::Modify(ModifyKind::Name(RenameMode::From)),
                    root.join("expanded"),
                ),
                &[plan],
            );
            assert_eq!(
                pending.batch("g").unwrap().changes[0].files,
                vec!["expanded/nested.md"]
            );
        }
        #[test]
        fn bounded_overflow_rescans_and_conditional_cleanup_preserves_new_subscription() {
            let dir = tempfile::tempdir().unwrap();
            let root = dir.path().canonicalize().unwrap();
            fs::create_dir(root.join("expanded")).unwrap();
            let (tx, rx) = mpsc::sync_channel(1);
            let overflow = Arc::new(AtomicBool::new(false));
            enqueue(&tx, &overflow, Ok(Event::new(EventKind::Other)));
            enqueue(&tx, &overflow, Ok(Event::new(EventKind::Other)));
            assert!(overflow.load(Ordering::Acquire));
            let stopped = Arc::new(AtomicBool::new(false));
            let stop = stopped.clone();
            let (out, result) = mpsc::channel();
            let handle = thread::spawn(move || {
                worker(rx, vec![], "new".into(), stop, overflow, |batch| {
                    out.send(batch).unwrap();
                })
            });
            let batch = result.recv_timeout(Duration::from_secs(2)).unwrap();
            assert!(batch.rescan);
            assert!(batch.error.is_some());
            stopped.store(true, Ordering::Release);
            tx.send(Message::Stop).unwrap();
            handle.join().unwrap();
            let (subscription, _) =
                subscribe(vec![fixture_plan(&root)], "new".into(), |_| {}).unwrap();
            let state = LocalWatchers::default();
            state
                .desired
                .lock()
                .unwrap()
                .insert("window".into(), "new".into());
            state.install("window", "new", subscription).unwrap();
            let (stale, _) = subscribe(vec![fixture_plan(&root)], "old".into(), |_| {}).unwrap();
            state.install("window", "old", stale).unwrap();
            assert_eq!(
                state
                    .subscriptions
                    .lock()
                    .unwrap()
                    .get("window")
                    .unwrap()
                    .generation,
                "new"
            );
            state.remove_generation("window", "old").unwrap();
            assert_eq!(state.subscriptions.lock().unwrap().len(), 1);
            state.close_window("window");
            assert!(state.subscriptions.lock().unwrap().is_empty());
            assert!(state.desired.lock().unwrap().is_empty());
        }
        #[test]
        fn os_events_with_5000_files_keep_registration_bounded_and_survive_atomic_saves() {
            let dir = tempfile::tempdir().unwrap();
            let root = dir.path().canonicalize().unwrap();
            fs::create_dir(root.join("expanded")).unwrap();
            fs::create_dir(root.join("closed")).unwrap();
            for i in 0..5000 {
                fs::write(root.join("closed").join(format!("{i}.md")), "unused").unwrap();
            }
            fs::write(root.join("open.md"), "old").unwrap();
            fs::write(root.join("expanded/nested.md"), "old").unwrap();
            let plan = fixture_plan(&root);
            let paths = registrations(&[plan.clone()]);
            assert_eq!(paths.len(), 3);
            assert!(!paths.contains(&root.join("closed")));
            let (sender, receiver) = mpsc::channel();
            let (subscription, warnings) = subscribe(vec![plan], "os".into(), move |batch| {
                let _ = sender.send(batch);
            })
            .unwrap();
            assert!(warnings.is_empty(), "{warnings:?}");
            // Give the native backend time to begin its event stream (FSEvents starts asynchronously).
            thread::sleep(Duration::from_millis(300));
            for i in 0..25 {
                fs::write(root.join("open.md"), format!("burst {i}")).unwrap();
            }
            fs::write(root.join("replacement"), "atomic").unwrap();
            fs::rename(root.join("replacement"), root.join("open.md")).unwrap();
            let deadline = Instant::now() + Duration::from_secs(8);
            let mut saw_file = false;
            while Instant::now() < deadline {
                if let Ok(batch) = receiver.recv_timeout(Duration::from_millis(500)) {
                    if batch
                        .changes
                        .iter()
                        .any(|c| c.files.iter().any(|f| f == "open.md"))
                    {
                        saw_file = true;
                        break;
                    }
                }
            }
            assert!(saw_file, "No native open-file event after atomic save");
            fs::remove_file(root.join("expanded/nested.md")).unwrap();
            let deadline = Instant::now() + Duration::from_secs(8);
            let mut saw_delete = false;
            while Instant::now() < deadline {
                if let Ok(batch) = receiver.recv_timeout(Duration::from_millis(500)) {
                    if batch.changes.iter().any(|c| {
                        c.files.iter().any(|f| f == "expanded/nested.md")
                            && c.directories.iter().any(|d| d == "expanded")
                    }) {
                        saw_delete = true;
                        break;
                    }
                }
            }
            assert!(saw_delete, "No native deletion event");
            // Exercise removal with the full subscription still active. Windows
            // can deny directory renames while watcher handles are open, even
            // with delete sharing; removal is supported by its native backend.
            fs::remove_dir_all(&root).unwrap();
            let deadline = Instant::now() + Duration::from_secs(8);
            let mut saw_root = false;
            while Instant::now() < deadline {
                if let Ok(batch) = receiver.recv_timeout(Duration::from_millis(500)) {
                    if batch.rescan {
                        saw_root = true;
                        break;
                    }
                }
            }
            assert!(saw_root, "No native workspace removal event");
            drop(subscription);
            while receiver.try_recv().is_ok() {}
            assert!(matches!(
                receiver.recv_timeout(Duration::from_millis(300)),
                Err(mpsc::RecvTimeoutError::Disconnected)
            ));
        }
        #[test]
        fn os_events_rearm_after_unexpanded_nested_parent_is_recreated() {
            let dir = tempfile::tempdir().unwrap();
            let root = dir.path().canonicalize().unwrap();
            fs::create_dir_all(root.join("a/b")).unwrap();
            fs::write(root.join("a/b/c.md"), "before").unwrap();
            let target = Target {
                root: root.to_string_lossy().into(),
                files: vec!["a/b/c.md".into()],
                directories: vec!["".into()],
            };
            let make = || {
                let (sender, receiver) = mpsc::channel();
                let plan = plan(target.clone(), root.clone()).unwrap();
                assert_eq!(registrations(&[plan.clone()]).len(), 4);
                let (watch, warnings) = subscribe(vec![plan], "nested".into(), move |batch| {
                    let _ = sender.send(batch);
                })
                .unwrap();
                (watch, receiver, warnings)
            };
            let wait_for = |receiver: &Receiver<Batch>, needs_rescan: bool| {
                let deadline = Instant::now() + Duration::from_secs(8);
                while Instant::now() < deadline {
                    if let Ok(batch) = receiver.recv_timeout(Duration::from_millis(500)) {
                        if (!needs_rescan || batch.rescan)
                            && batch
                                .changes
                                .iter()
                                .any(|c| c.files.iter().any(|f| f == "a/b/c.md"))
                        {
                            return;
                        }
                    }
                }
                panic!("Missing nested notification (rescan={needs_rescan})");
            };
            let (watch, receiver, warnings) = make();
            assert!(warnings.is_empty());
            thread::sleep(Duration::from_millis(300));
            fs::remove_dir_all(root.join("a/b")).unwrap();
            wait_for(&receiver, true);
            drop(watch);
            // Match the frontend's reconfigure after receiving the rescan event.
            let (watch, receiver, warnings) = make();
            assert!(!warnings.is_empty());
            thread::sleep(Duration::from_millis(300));
            fs::create_dir(root.join("a/b")).unwrap();
            fs::write(root.join("a/b/c.md"), "restored").unwrap();
            wait_for(&receiver, true);
            drop(watch);
            let (watch, receiver, warnings) = make();
            assert!(warnings.is_empty());
            thread::sleep(Duration::from_millis(300));
            fs::write(root.join("a/b/c.md"), "edited again").unwrap();
            wait_for(&receiver, false);
            drop(watch);
        }
        #[cfg(unix)]
        #[test]
        fn watch_plan_rejects_existing_and_missing_paths_under_symlink_escape() {
            let dir = tempfile::tempdir().unwrap();
            let other = tempfile::tempdir().unwrap();
            let root = dir.path().canonicalize().unwrap();
            fs::write(other.path().join("existing.md"), "outside").unwrap();
            std::os::unix::fs::symlink(other.path(), root.join("escape")).unwrap();
            assert!(safe_path(&root, "escape/existing.md").is_err());
            assert!(safe_path(&root, "escape/missing.md").is_err());
            assert!(safe_path(&root, "../escape").is_err());
            assert!(safe_path(&root, ".git/HEAD").is_ok());
            let mut pending = Pending::default();
            pending.event(
                event(EventKind::Remove(RemoveKind::Folder), root.clone()),
                &[fixture_plan(&root)],
            );
            assert!(pending.batch("g").unwrap().rescan);
        }
    }
    #[tauri::command]
    pub(crate) async fn unwatch_local_changes(
        generation: String,
        window: WebviewWindow,
    ) -> Result<(), String> {
        tauri::async_runtime::spawn_blocking(move || {
            window
                .state::<LocalWatchers>()
                .remove_generation(window.label(), &generation)
        })
        .await
        .map_err(err)?
    }
}
#[cfg(desktop)]
pub(crate) use native_watch::LocalWatchers;
