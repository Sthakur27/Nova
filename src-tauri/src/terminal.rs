use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{collections::HashMap, io::{Read, Write}, sync::Mutex};
use tauri::{ipc::Channel, State, WebviewWindow};

struct Session {
    owner: String,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}
impl Drop for Session {
    fn drop(&mut self) { let _ = self.killer.kill(); }
}
#[derive(Default)]
pub struct Terminals(Mutex<HashMap<String, Session>>);
impl Terminals {
    pub fn close_window(&self, owner: &str) {
        if let Ok(mut sessions) = self.0.lock() { sessions.retain(|_, session| session.owner != owner); }
    }
}
#[derive(Clone, Serialize)]
pub struct Output { data: Vec<u8>, exited: bool }
fn size(cols: u16, rows: u16) -> PtySize {
    PtySize { rows: rows.clamp(1, 500), cols: cols.clamp(2, 1000), pixel_width: 0, pixel_height: 0 }
}
#[tauri::command]
pub fn terminal_open(window: WebviewWindow, terminals: State<Terminals>, access: State<crate::Access>,
    id: String, root: Option<String>, cols: u16, rows: u16, output: Channel<Output>) -> Result<(), String> {
    let cwd = if let Some(root) = root {
        let path = std::fs::canonicalize(root).map_err(crate::err)?;
        if !access.roots.lock().map_err(crate::err)?.contains(&path) { return Err("Open this folder in Nova first.".into()); }
        Some(path)
    } else { std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(std::path::PathBuf::from) };
    let mut sessions = terminals.0.lock().map_err(crate::err)?;
    if sessions.contains_key(&id) { return Err("Terminal already exists.".into()); }
    let pair = native_pty_system().openpty(size(cols, rows)).map_err(crate::err)?;
    let shell = std::env::var(if cfg!(windows) { "COMSPEC" } else { "SHELL" })
        .unwrap_or_else(|_| if cfg!(windows) { "cmd.exe".into() } else { "/bin/sh".into() });
    let mut command = CommandBuilder::new(shell);
    if !cfg!(windows) { command.arg("-l"); }
    if let Some(cwd) = cwd { command.cwd(cwd); }
    command.env("TERM", "xterm-256color");
    let mut reader = pair.master.try_clone_reader().map_err(crate::err)?;
    let writer = pair.master.take_writer().map_err(crate::err)?;
    let mut child = pair.slave.spawn_command(command).map_err(crate::err)?;
    let killer = child.clone_killer();
    drop(pair.slave);
    sessions.insert(id, Session { owner: window.label().into(), master: pair.master, writer, killer });
    std::thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(count) => if output.send(Output { data: buffer[..count].to_vec(), exited: false }).is_err() {
                    let _ = child.kill();
                    break;
                },
            }
        }
        let _ = child.wait();
        let _ = output.send(Output { data: vec![], exited: true });
    });
    Ok(())
}
#[tauri::command]
pub fn terminal_write(window: WebviewWindow, terminals: State<Terminals>, id: String, data: String) -> Result<(), String> {
    let mut sessions = terminals.0.lock().map_err(crate::err)?;
    let session = sessions.get_mut(&id).filter(|s| s.owner == window.label()).ok_or("Terminal is closed.")?;
    session.writer.write_all(data.as_bytes()).map_err(crate::err)?;
    session.writer.flush().map_err(crate::err)
}
#[tauri::command]
pub fn terminal_resize(window: WebviewWindow, terminals: State<Terminals>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = terminals.0.lock().map_err(crate::err)?;
    let session = sessions.get(&id).filter(|s| s.owner == window.label()).ok_or("Terminal is closed.")?;
    session.master.resize(size(cols, rows)).map_err(crate::err)
}
#[tauri::command]
pub fn terminal_close(window: WebviewWindow, terminals: State<Terminals>, id: String) -> Result<(), String> {
    let mut sessions = terminals.0.lock().map_err(crate::err)?;
    if sessions.get(&id).is_some_and(|s| s.owner == window.label()) { sessions.remove(&id); }
    Ok(())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    #[test]
    fn shell_accepts_input_and_observes_directory_and_terminal_size() {
        let directory = tempfile::tempdir().unwrap();
        let pair = native_pty_system().openpty(size(80, 24)).unwrap();
        pair.master.resize(size(100, 35)).unwrap();
        let mut reader = pair.master.try_clone_reader().unwrap();
        let mut writer = pair.master.take_writer().unwrap();
        let mut command = CommandBuilder::new("/bin/sh");
        command.args(["-c", "stty size; pwd; read -r line; printf 'received:%s\\n' \"$line\""]);
        command.cwd(directory.path());
        let mut child = pair.slave.spawn_command(command).unwrap();
        drop(pair.slave);
        writer.write_all("nova-λ\n".as_bytes()).unwrap();
        writer.flush().unwrap();
        let (send, receive) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = reader.read_to_end(&mut bytes);
            let _ = send.send(String::from_utf8_lossy(&bytes).into_owned());
        });
        let result = receive.recv_timeout(std::time::Duration::from_secs(10));
        if result.is_err() { let _ = child.kill(); }
        let _ = child.wait();
        let output = result.expect("shell should exit promptly");
        assert!(output.contains("35 100"), "{output}");
        assert!(output.contains(directory.path().file_name().unwrap().to_str().unwrap()), "{output}");
        assert!(output.contains("received:nova-λ"), "{output}");
    }
}
